-- Drops everything the other scripts create, so the database can be
-- rebuilt from scratch. All data is lost.

DROP VIEW IF EXISTS v_price_history;
DROP VIEW IF EXISTS v_account_summary;
DROP VIEW IF EXISTS v_portfolio;
DROP VIEW IF EXISTS v_order_book;

-- children before parents; CASCADE also drops triggers and indexes
DROP TABLE IF EXISTS watchlist_items CASCADE;
DROP TABLE IF EXISTS watchlists      CASCADE;
DROP TABLE IF EXISTS price_history   CASCADE;   -- old table, now a view
DROP TABLE IF EXISTS cash_ledger     CASCADE;
DROP TABLE IF EXISTS holdings        CASCADE;
DROP TABLE IF EXISTS trades          CASCADE;
DROP TABLE IF EXISTS orders          CASCADE;
DROP TABLE IF EXISTS instruments     CASCADE;
DROP TABLE IF EXISTS accounts        CASCADE;
DROP TABLE IF EXISTS users           CASCADE;

DROP PROCEDURE IF EXISTS place_order;
DROP PROCEDURE IF EXISTS cancel_order;
DROP PROCEDURE IF EXISTS deposit_cash;
DROP PROCEDURE IF EXISTS withdraw_cash;
DROP FUNCTION  IF EXISTS compute_fill_plan;
DROP FUNCTION  IF EXISTS trg_fn_set_updated_at;
DROP FUNCTION  IF EXISTS trg_fn_after_trade_insert;
DROP FUNCTION  IF EXISTS trg_fn_prevent_mutation;
DROP FUNCTION  IF EXISTS trg_fn_prevent_trade_mutation;   -- old name
