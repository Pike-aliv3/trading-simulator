const express = require('express');
const { pool } = require('../db');
const { wrap, toId } = require('../http');
const router = express.Router();

// checks :id once for every route below (bad id -> 400, unknown -> 404)
router.param('id', wrap(async (req, res, next, value) => {
    const id = toId(value);
    if (id === null) return res.status(400).json({ error: 'account id must be a positive integer' });
    const found = await pool.query('SELECT 1 FROM accounts WHERE account_id = $1', [id]);
    if (found.rows.length === 0) return res.status(404).json({ error: 'account not found' });
    req.accountId = id;
    next();
}));

// GET /api/accounts/:id/summary
router.get('/:id/summary', wrap(async (req, res) => {
    const result = await pool.query('SELECT * FROM v_account_summary WHERE account_id = $1', [req.accountId]);
    res.json(result.rows[0]);
}));

// GET /api/accounts/:id/portfolio
router.get('/:id/portfolio', wrap(async (req, res) => {
    const result = await pool.query(
        'SELECT * FROM v_portfolio WHERE account_id = $1 ORDER BY market_value DESC, ticker',
        [req.accountId]
    );
    res.json(result.rows);
}));

// GET /api/accounts/:id/trades - trades on either side
router.get('/:id/trades', wrap(async (req, res) => {
    const result = await pool.query(
        `SELECT t.trade_id, t.executed_at, i.ticker,
                CASE WHEN bo.account_id = $1 THEN 'BUY' ELSE 'SELL' END AS side,
                t.quantity, t.price, (t.quantity * t.price) AS trade_value
         FROM trades t
         JOIN orders bo ON bo.order_id = t.buy_order_id
         JOIN orders so ON so.order_id = t.sell_order_id
         JOIN instruments i ON i.instrument_id = t.instrument_id
         WHERE bo.account_id = $1 OR so.account_id = $1
         ORDER BY t.executed_at DESC, t.trade_id DESC`,
        [req.accountId]
    );
    res.json(result.rows);
}));

// GET /api/accounts/:id/ledger - cash statement
router.get('/:id/ledger', wrap(async (req, res) => {
    const result = await pool.query(
        `SELECT ledger_id, txn_type, amount, balance_after, related_trade_id, created_at
         FROM cash_ledger
         WHERE account_id = $1
         ORDER BY created_at DESC, ledger_id DESC
         LIMIT 100`,
        [req.accountId]
    );
    res.json(result.rows);
}));

// GET /api/accounts/:id/orders
router.get('/:id/orders', wrap(async (req, res) => {
    const result = await pool.query(
        `SELECT o.order_id, o.instrument_id, i.ticker, o.side, o.order_type, o.limit_price,
                o.quantity, o.remaining_quantity, o.status, o.created_at
         FROM orders o
         JOIN instruments i ON i.instrument_id = o.instrument_id
         WHERE o.account_id = $1
         ORDER BY o.created_at DESC, o.order_id DESC
         LIMIT 100`,
        [req.accountId]
    );
    res.json(result.rows);
}));

// Deposit / withdraw: the procedures in db/funds.sql do the checks.

// "1500", "1500.5", 1500.25 -> number; anything else -> null
function toAmount(value) {
    if (typeof value === 'string' && value.trim() !== '') value = Number(value);
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

for (const [path, procedure] of [['deposit', 'deposit_cash'], ['withdraw', 'withdraw_cash']]) {
    // POST /api/accounts/:id/deposit and /api/accounts/:id/withdraw
    router.post(`/:id/${path}`, wrap(async (req, res) => {
        const amount = toAmount((req.body || {}).amount);
        if (amount === null) return res.status(400).json({ error: 'amount must be a number' });

        await pool.query(`CALL ${procedure}($1, $2)`, [req.accountId, amount]);
        const summary = await pool.query('SELECT * FROM v_account_summary WHERE account_id = $1', [req.accountId]);
        res.json(summary.rows[0]);
    }));
}

// Watchlists belong to the user, so we go through accounts to find them.
// Duplicates and unknown instruments are refused by the database
// (UNIQUE, primary key, foreign key); we only reword the error.

// the list must belong to the user who owns this account
router.param('watchlistId', wrap(async (req, res, next, value) => {
    const id = toId(value);
    if (id === null) return res.status(400).json({ error: 'watchlist id must be a positive integer' });
    const found = await pool.query(
        `SELECT w.watchlist_id
           FROM watchlists w JOIN accounts a ON a.user_id = w.user_id
          WHERE a.account_id = $1 AND w.watchlist_id = $2`,
        [req.accountId, id]
    );
    if (found.rows.length === 0) return res.status(404).json({ error: 'watchlist not found' });
    req.watchlistId = id;
    next();
}));

// GET /api/accounts/:id/watchlists - LEFT JOIN so empty lists show 0
router.get('/:id/watchlists', wrap(async (req, res) => {
    const result = await pool.query(
        `SELECT w.watchlist_id, w.name, w.created_at, COUNT(wi.instrument_id)::int AS item_count
           FROM accounts a
           JOIN watchlists w            ON w.user_id = a.user_id
           LEFT JOIN watchlist_items wi ON wi.watchlist_id = w.watchlist_id
          WHERE a.account_id = $1
          GROUP BY w.watchlist_id, w.name, w.created_at
          ORDER BY w.watchlist_id`,
        [req.accountId]
    );
    res.json(result.rows);
}));

// POST /api/accounts/:id/watchlists
router.post('/:id/watchlists', wrap(async (req, res) => {
    const raw = (req.body || {}).name;
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (name === '') return res.status(400).json({ error: 'name is required' });
    if (name.length > 100) return res.status(400).json({ error: 'name must be at most 100 characters' });

    try {
        const result = await pool.query(
            `INSERT INTO watchlists (user_id, name)
             SELECT user_id, $2 FROM accounts WHERE account_id = $1
             RETURNING watchlist_id, name, created_at`,
            [req.accountId, name]
        );
        res.status(201).json({ ...result.rows[0], item_count: 0 });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: `you already have a watchlist called "${name}"` });
        throw err;
    }
}));

// DELETE /api/accounts/:id/watchlists/:watchlistId - items go via ON DELETE CASCADE
router.delete('/:id/watchlists/:watchlistId', wrap(async (req, res) => {
    await pool.query('DELETE FROM watchlists WHERE watchlist_id = $1', [req.watchlistId]);
    res.json({ removed: req.watchlistId });
}));

// GET /api/accounts/:id/watchlists/:watchlistId/items
router.get('/:id/watchlists/:watchlistId/items', wrap(async (req, res) => {
    const result = await pool.query(
        `SELECT i.instrument_id, i.ticker, i.company_name, i.sector, i.last_price, wi.added_at
           FROM watchlist_items wi
           JOIN instruments i ON i.instrument_id = wi.instrument_id
          WHERE wi.watchlist_id = $1
          ORDER BY i.ticker`,
        [req.watchlistId]
    );
    res.json(result.rows);
}));

// POST /api/accounts/:id/watchlists/:watchlistId/items
router.post('/:id/watchlists/:watchlistId/items', wrap(async (req, res) => {
    const instrumentId = toId((req.body || {}).instrument_id);
    if (instrumentId === null) return res.status(400).json({ error: 'instrument_id must be a positive integer' });

    try {
        await pool.query(
            'INSERT INTO watchlist_items (watchlist_id, instrument_id) VALUES ($1, $2)',
            [req.watchlistId, instrumentId]
        );
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'already on this watchlist' });
        if (err.code === '23503') return res.status(400).json({ error: 'no such instrument' });
        throw err;
    }
    res.status(201).json({ watchlist_id: req.watchlistId, instrument_id: instrumentId });
}));

// DELETE /api/accounts/:id/watchlists/:watchlistId/items/:instrumentId
router.delete('/:id/watchlists/:watchlistId/items/:instrumentId', wrap(async (req, res) => {
    const instrumentId = toId(req.params.instrumentId);
    if (instrumentId === null) return res.status(400).json({ error: 'instrument id must be a positive integer' });

    const result = await pool.query(
        'DELETE FROM watchlist_items WHERE watchlist_id = $1 AND instrument_id = $2',
        [req.watchlistId, instrumentId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'not on this watchlist' });
    res.json({ removed: instrumentId });
}));

module.exports = router;
