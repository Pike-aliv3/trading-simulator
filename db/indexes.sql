-- Indexes
-- Primary keys and UNIQUE constraints already get an index, so they
-- are not repeated here.

-- Order book lookup used by compute_fill_plan on every order.
-- Partial index: only orders still on the book can be matched.
CREATE INDEX IF NOT EXISTS idx_orders_book
    ON orders (instrument_id, side, limit_price, created_at)
    WHERE status IN ('OPEN', 'PARTIALLY_FILLED');

-- An account's orders, newest first.
CREATE INDEX IF NOT EXISTS idx_orders_account
    ON orders (account_id, created_at DESC);

-- Trades of an order. Foreign keys are not indexed automatically.
CREATE INDEX IF NOT EXISTS idx_trades_buy_order  ON trades (buy_order_id);
CREATE INDEX IF NOT EXISTS idx_trades_sell_order ON trades (sell_order_id);

-- Price history of an instrument, newest first (also used by query 3).
CREATE INDEX IF NOT EXISTS idx_trades_instrument
    ON trades (instrument_id, executed_at DESC);

-- An account's cash statement, newest first.
CREATE INDEX IF NOT EXISTS idx_cash_ledger_account
    ON cash_ledger (account_id, created_at DESC);
