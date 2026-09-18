-- Retrieval queries
-- Queries 2, 3, 5 and 6 are run by the Reports screen straight from this
-- file (backend/src/routes/reports.js), so keep the "-- N. Title" lines.
-- Queries 1 and 4 take an id; the app uses the same logic through the
-- v_order_book view and GET /api/accounts/:id/trades.

-- 1. Order book depth for one instrument (aggregation, GROUP BY)
SELECT side, limit_price, SUM(remaining_quantity) AS total_quantity, COUNT(*) AS order_count
FROM orders
WHERE instrument_id = 1
  AND status IN ('OPEN', 'PARTIALLY_FILLED')
GROUP BY side, limit_price
ORDER BY side,
         CASE WHEN side = 'BUY' THEN limit_price END DESC,
         CASE WHEN side = 'SELL' THEN limit_price END ASC;

-- 2. Portfolio value, cost and unrealised P&L per account (multi-table join, aggregation)
SELECT a.account_id, u.name,
       SUM(h.quantity * i.last_price)          AS market_value,
       SUM(h.quantity * h.avg_cost)             AS cost_basis,
       SUM(h.quantity * (i.last_price - h.avg_cost)) AS unrealized_pnl
FROM holdings h
JOIN accounts a   ON a.account_id = h.account_id
JOIN users u      ON u.user_id = a.user_id
JOIN instruments i ON i.instrument_id = h.instrument_id
WHERE h.quantity > 0
GROUP BY a.account_id, u.name
ORDER BY unrealized_pnl DESC;

-- 3. Instruments trading above their 30-day average price (correlated subquery)
SELECT i.ticker, i.company_name, i.last_price,
       (SELECT ROUND(AVG(t.price), 2) FROM trades t
         WHERE t.instrument_id = i.instrument_id
           AND t.executed_at >= now() - INTERVAL '30 days') AS avg_30d_price
FROM instruments i
WHERE i.last_price > (
    SELECT AVG(t.price) FROM trades t
    WHERE t.instrument_id = i.instrument_id
      AND t.executed_at >= now() - INTERVAL '30 days'
)
ORDER BY i.last_price DESC;

-- 4. Trade history of one account, buy and sell side (joins orders twice)
SELECT t.trade_id, t.executed_at, i.ticker,
       CASE WHEN bo.account_id = 1 THEN 'BUY' ELSE 'SELL' END AS side,
       t.quantity, t.price, (t.quantity * t.price) AS trade_value
FROM trades t
JOIN orders bo      ON bo.order_id = t.buy_order_id
JOIN orders so      ON so.order_id = t.sell_order_id
JOIN instruments i  ON i.instrument_id = t.instrument_id
WHERE bo.account_id = 1 OR so.account_id = 1
ORDER BY t.executed_at DESC;

-- 5. Top 5 accounts by trade value in the last 30 days (CTE, UNION ALL, RANK)
WITH account_activity AS (
    SELECT account_id, SUM(trade_value) AS total_value
    FROM (
        SELECT bo.account_id, t.quantity * t.price AS trade_value, t.executed_at
        FROM trades t JOIN orders bo ON bo.order_id = t.buy_order_id
        UNION ALL
        SELECT so.account_id, t.quantity * t.price, t.executed_at
        FROM trades t JOIN orders so ON so.order_id = t.sell_order_id
    ) all_sides
    WHERE executed_at >= now() - INTERVAL '30 days'
    GROUP BY account_id
)
SELECT aa.account_id, u.name, aa.total_value,
       RANK() OVER (ORDER BY aa.total_value DESC) AS activity_rank
FROM account_activity aa
JOIN accounts a ON a.account_id = aa.account_id
JOIN users u    ON u.user_id = a.user_id
ORDER BY activity_rank, aa.account_id
LIMIT 5;

-- 6. Users who never placed an order from any of their accounts (NOT EXISTS)
-- The subquery checks all of the user's accounts, so a user with one
-- active and one unused account is not listed.
SELECT u.user_id, u.name, u.email,
       (SELECT COUNT(*) FROM accounts a WHERE a.user_id = u.user_id) AS account_count
FROM users u
WHERE NOT EXISTS (
    SELECT 1
    FROM orders o
    JOIN accounts a ON a.account_id = o.account_id
    WHERE a.user_id = u.user_id
)
ORDER BY u.user_id;
