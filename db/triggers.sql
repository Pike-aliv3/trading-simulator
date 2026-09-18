-- Triggers
-- Run before matching_engine.sql: place_order relies on the trade
-- trigger to update instruments.last_price.

-- Keep orders.updated_at current on every update.
CREATE OR REPLACE FUNCTION trg_fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_set_updated_at ON orders;
CREATE TRIGGER trg_orders_set_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION trg_fn_set_updated_at();

-- A new trade sets the instrument's last price.
CREATE OR REPLACE FUNCTION trg_fn_after_trade_insert()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE instruments SET last_price = NEW.price WHERE instrument_id = NEW.instrument_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trades_after_insert ON trades;
CREATE TRIGGER trg_trades_after_insert
AFTER INSERT ON trades
FOR EACH ROW
EXECUTE FUNCTION trg_fn_after_trade_insert();

-- Trades and ledger rows can't be changed or deleted once written.
-- This is also what makes it safe to store cash_ledger.balance_after.
CREATE OR REPLACE FUNCTION trg_fn_prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% rows are immutable: % on % is not allowed',
        TG_TABLE_NAME, TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trades_prevent_update ON trades;
CREATE TRIGGER trg_trades_prevent_update
BEFORE UPDATE ON trades
FOR EACH ROW
EXECUTE FUNCTION trg_fn_prevent_mutation();

DROP TRIGGER IF EXISTS trg_trades_prevent_delete ON trades;
CREATE TRIGGER trg_trades_prevent_delete
BEFORE DELETE ON trades
FOR EACH ROW
EXECUTE FUNCTION trg_fn_prevent_mutation();

DROP TRIGGER IF EXISTS trg_cash_ledger_prevent_update ON cash_ledger;
CREATE TRIGGER trg_cash_ledger_prevent_update
BEFORE UPDATE ON cash_ledger
FOR EACH ROW
EXECUTE FUNCTION trg_fn_prevent_mutation();

DROP TRIGGER IF EXISTS trg_cash_ledger_prevent_delete ON cash_ledger;
CREATE TRIGGER trg_cash_ledger_prevent_delete
BEFORE DELETE ON cash_ledger
FOR EACH ROW
EXECUTE FUNCTION trg_fn_prevent_mutation();
