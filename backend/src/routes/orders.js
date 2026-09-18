const express = require('express');
const { pool } = require('../db');
const { wrap, toId } = require('../http');
const router = express.Router();

// order_id is BIGINT, so allow up to JS's safe integer limit
const MAX_ORDER_ID = Number.MAX_SAFE_INTEGER;

// POST /api/orders - all the matching happens in place_order
router.post('/', wrap(async (req, res) => {
    const { account_id, instrument_id, side, order_type, limit_price, quantity } = req.body || {};

    // only check the types here; the business rules are in the database
    const accountId = toId(account_id);
    const instrumentId = toId(instrument_id);
    const qty = toId(quantity);
    const price = typeof limit_price === 'string' && limit_price.trim() !== '' ? Number(limit_price) : limit_price;

    if (accountId === null || instrumentId === null) {
        return res.status(400).json({ error: 'account_id and instrument_id must be positive integers' });
    }
    if (side !== 'BUY' && side !== 'SELL') {
        return res.status(400).json({ error: 'side must be BUY or SELL' });
    }
    if (order_type !== 'LIMIT' && order_type !== 'MARKET') {
        return res.status(400).json({ error: 'order_type must be LIMIT or MARKET' });
    }
    if (qty === null) {
        return res.status(400).json({ error: 'quantity must be a positive whole number' });
    }
    const hasPrice = price !== null && price !== undefined;
    if (hasPrice && (typeof price !== 'number' || !Number.isFinite(price))) {
        return res.status(400).json({ error: 'limit_price must be a number' });
    }
    if (!hasPrice && order_type === 'LIMIT') {
        return res.status(400).json({ error: 'limit_price is required for LIMIT orders' });
    }

    // the NULL is the placeholder for the OUT parameter p_order_id
    const result = await pool.query(
        'CALL place_order($1, $2, $3, $4, $5, $6, NULL)',
        [accountId, instrumentId, side, order_type, hasPrice ? price : null, qty]
    );
    const orderId = result.rows[0].p_order_id;

    const orderResult = await pool.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
    const tradesResult = await pool.query(
        'SELECT * FROM trades WHERE buy_order_id = $1 OR sell_order_id = $1 ORDER BY trade_id',
        [orderId]
    );

    res.status(201).json({ order: orderResult.rows[0], trades: tradesResult.rows });
}));

// POST /api/orders/:id/cancel - cancel_order does the checks
router.post('/:id/cancel', wrap(async (req, res) => {
    const orderId = toId(req.params.id, MAX_ORDER_ID);
    const accountId = toId((req.body || {}).account_id);
    if (orderId === null) return res.status(400).json({ error: 'order id must be a positive integer' });
    if (accountId === null) return res.status(400).json({ error: 'account_id is required' });

    await pool.query('CALL cancel_order($1, $2)', [orderId, accountId]);
    const orderResult = await pool.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
    res.json({ order: orderResult.rows[0] });
}));

// GET /api/orders/:id - the order and its trades
router.get('/:id', wrap(async (req, res) => {
    const orderId = toId(req.params.id, MAX_ORDER_ID);
    if (orderId === null) return res.status(400).json({ error: 'order id must be a positive integer' });

    const orderResult = await pool.query('SELECT * FROM orders WHERE order_id = $1', [orderId]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'order not found' });

    const tradesResult = await pool.query(
        'SELECT * FROM trades WHERE buy_order_id = $1 OR sell_order_id = $1 ORDER BY trade_id',
        [orderId]
    );

    res.json({ order: orderResult.rows[0], trades: tradesResult.rows });
}));

module.exports = router;
