const fs = require('fs');
const path = require('path');
const express = require('express');
const { pool } = require('../db');
const { wrap } = require('../http');
const router = express.Router();

// Runs the queries from db/queries.sql directly, so the file and the
// Reports screen always match. Each query starts at a "-- N. Title" line.
// Queries 1 and 4 need an id and are used elsewhere.
const REPORTS = {
    'portfolio-valuation': 2,   // multi-table join + aggregation
    'above-average':       3,   // correlated subquery
    'most-active':         5,   // CTE + UNION ALL + window function (RANK)
    'never-traded':        6,   // NOT EXISTS anti-join
};

function loadQueries() {
    const text = fs.readFileSync(path.resolve(__dirname, '../../../db/queries.sql'), 'utf8');
    const queries = {};
    // split before every "-- N." line
    for (const part of text.split(/^(?=-- \d+\. )/m)) {
        const m = part.match(/^-- (\d+)\. /);
        if (m) queries[Number(m[1])] = part.trim().replace(/;\s*$/, '');
    }
    return queries;
}
const QUERIES = loadQueries();
for (const n of Object.values(REPORTS)) {
    if (!QUERIES[n]) throw new Error(`db/queries.sql has no query ${n}`);
}

// GET /api/reports/:name
router.get('/:name', wrap(async (req, res) => {
    const n = Object.hasOwn(REPORTS, req.params.name) ? REPORTS[req.params.name] : null;
    if (!n) return res.status(404).json({ error: 'no such report' });
    const result = await pool.query(QUERIES[n]);
    res.json(result.rows);
}));

module.exports = router;
