-- Views

-- Open quantity at each price level, per instrument and side.
CREATE OR REPLACE VIEW v_order_book AS
SELECT instrument_id, side, limit_price,
       SUM(remaining_quantity) AS total_quantity,
       COUNT(*)                AS order_count,
       MIN(created_at)         AS earliest_order_at
FROM orders
WHERE status IN ('OPEN', 'PARTIALLY_FILLED')
  AND order_type = 'LIMIT'
GROUP BY instrument_id, side, limit_price;

-- One row per holding, valued at the instrument's last price.
CREATE OR REPLACE VIEW v_portfolio AS
SELECT h.account_id, h.instrument_id, i.ticker, h.quantity, h.avg_cost, i.last_price,
       h.quantity * i.last_price              AS market_value,
       h.quantity * h.avg_cost                AS cost_basis,
       h.quantity * (i.last_price - h.avg_cost) AS unrealized_pnl
FROM holdings h
JOIN instruments i ON i.instrument_id = h.instrument_id
WHERE h.quantity > 0;

-- Cash, holdings value and net worth per account (built on v_portfolio).
CREATE OR REPLACE VIEW v_account_summary AS
SELECT a.account_id, u.name, a.cash_balance, a.reserved_cash,
       COALESCE(SUM(p.market_value), 0)                    AS holdings_value,
       a.cash_balance + COALESCE(SUM(p.market_value), 0)   AS net_worth
FROM accounts a
JOIN users u ON u.user_id = a.user_id
LEFT JOIN v_portfolio p ON p.account_id = a.account_id
GROUP BY a.account_id, u.name, a.cash_balance, a.reserved_cash;

-- Every trade is a price tick, so price history is just a view on trades.
CREATE OR REPLACE VIEW v_price_history AS
SELECT trade_id, instrument_id, price, quantity AS volume, executed_at AS recorded_at
FROM trades;
