const express = require('express');
const { pool } = require('../db');
const { wrap, toId } = require('../http');
const router = express.Router();

// checks :id once for every route below
router.param('id', wrap(async (req, res, next, value) => {
    const id = toId(value);
    if (id === null) return res.status(400).json({ error: 'instrument id must be a positive integer' });
    const found = await pool.query('SELECT 1 FROM instruments WHERE instrument_id = $1', [id]);
    if (found.rows.length === 0) return res.status(404).json({ error: 'instrument not found' });
    req.instrumentId = id;
    next();
}));

// GET /api/instruments?search=...&sector=...
// Both filters are optional. Each row also has best bid/ask and 30-day volume.
// search matches ticker or company name (ILIKE); % and _ are escaped so they
// are searched for literally.
router.get('/', wrap(async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const sector = typeof req.query.sector === 'string' ? req.query.sector.trim() : '';
    const pattern = search === '' ? null : '%' + search.replace(/[\\%_]/g, (c) => '\\' + c) + '%';

    const result = await pool.query(
        `SELECT i.instrument_id, i.ticker, i.company_name, i.sector, i.last_price,
                (SELECT MAX(b.limit_price) FROM v_order_book b
                  WHERE b.instrument_id = i.instrument_id AND b.side = 'BUY')  AS best_bid,
                (SELECT MIN(b.limit_price) FROM v_order_book b
                  WHERE b.instrument_id = i.instrument_id AND b.side = 'SELL') AS best_ask,
                COALESCE(v.volume_30d, 0) AS volume_30d
           FROM instruments i
           LEFT JOIN (SELECT instrument_id, SUM(quantity) AS volume_30d
                        FROM trades
                       WHERE executed_at >= now() - INTERVAL '30 days'
                       GROUP BY instrument_id) v ON v.instrument_id = i.instrument_id
          WHERE ($1::text IS NULL OR i.ticker ILIKE $1 OR i.company_name ILIKE $1)
            AND ($2::text IS NULL OR i.sector = $2)
          ORDER BY i.ticker`,
        [pattern, sector === '' ? null : sector]
    );
    res.json(result.rows);
}));

// GET /api/instruments/sectors - for the filter drop-down
router.get('/sectors', wrap(async (req, res) => {
    const result = await pool.query(
        'SELECT DISTINCT sector FROM instruments WHERE sector IS NOT NULL ORDER BY sector'
    );
    res.json(result.rows.map((r) => r.sector));
}));

// GET /api/instruments/:id/book - best bids and asks first
router.get('/:id/book', wrap(async (req, res) => {
    const result = await pool.query(
        `SELECT side, limit_price, total_quantity, order_count
         FROM v_order_book
         WHERE instrument_id = $1
         ORDER BY CASE WHEN side = 'BUY' THEN -limit_price ELSE limit_price END`,
        [req.instrumentId]
    );
    res.json({
        bids: result.rows.filter((r) => r.side === 'BUY'),
        asks: result.rows.filter((r) => r.side === 'SELL'),
    });
}));

// GET /api/instruments/:id/history
router.get('/:id/history', wrap(async (req, res) => {
    const result = await pool.query(
        `SELECT trade_id, price, volume, recorded_at
         FROM v_price_history
         WHERE instrument_id = $1
         ORDER BY recorded_at DESC, trade_id DESC
         LIMIT 100`,
        [req.instrumentId]
    );
    res.json(result.rows);
}));

module.exports = router;
