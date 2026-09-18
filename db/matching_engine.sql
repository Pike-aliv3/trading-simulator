-- Matching engine
-- Run after schema.sql, seed.sql, views.sql and triggers.sql.
--   compute_fill_plan  works out what an order would match (read-only)
--   place_order        checks, reserves and applies the matches
--   cancel_order       takes an order off the book and frees its cash

-- compute_fill_plan
-- opposite_book: resting orders this order may match (other side, same
-- instrument, still open, price ok, different account).
-- running: running total of their quantity in price-time priority
-- (window function). From that we take each order in full until the
-- incoming quantity runs out; the last one may be taken only in part.
-- order_id breaks ties between orders created at the same instant.
CREATE OR REPLACE FUNCTION compute_fill_plan(
    p_instrument_id INT,
    p_side          VARCHAR(4),
    p_account_id    INT,
    p_quantity      INT,
    p_limit_price   NUMERIC(12,2)
)
RETURNS TABLE (
    resting_order_id BIGINT,
    fill_qty         INT,
    fill_price        NUMERIC(12,2)
) AS $$
BEGIN
    RETURN QUERY
    WITH opposite_book AS (
        SELECT o.order_id,
               o.remaining_quantity,
               o.limit_price,
               o.created_at,
               CASE WHEN p_side = 'BUY' THEN o.limit_price ELSE -o.limit_price END AS sort_key
        FROM orders o
        WHERE o.instrument_id = p_instrument_id
          AND o.status IN ('OPEN', 'PARTIALLY_FILLED')
          AND o.account_id <> p_account_id
          AND (
                (p_side = 'BUY'  AND o.side = 'SELL' AND o.limit_price <= p_limit_price)
             OR (p_side = 'SELL' AND o.side = 'BUY'  AND o.limit_price >= p_limit_price)
          )
    ),
    running AS (
        SELECT order_id, remaining_quantity, limit_price,
               SUM(remaining_quantity) OVER (
                   ORDER BY sort_key ASC, created_at ASC, order_id ASC
                   ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
               ) AS running_total
        FROM opposite_book
    )
    SELECT order_id,
           LEAST(remaining_quantity, GREATEST(p_quantity - (running_total - remaining_quantity), 0))::INT AS fill_qty,
           limit_price
    FROM running
    WHERE running_total - remaining_quantity < p_quantity
      AND LEAST(remaining_quantity, GREATEST(p_quantity - (running_total - remaining_quantity), 0)) > 0
    ORDER BY running_total;   -- best priority first
END;
$$ LANGUAGE plpgsql STABLE;


-- place_order
-- Only LIMIT orders are matched for now.
-- Locks, always in this order (released at commit/rollback):
--   1. an advisory lock on the instrument, so orders for one instrument
--      are matched one at a time and two buyers can't take the same sell;
--   2. FOR UPDATE on every account involved, in account_id order, so two
--      transactions can't deadlock waiting on each other.
-- A buy reserves quantity * limit_price in reserved_cash. A sell may only
-- use shares not already offered in the account's other open sells.
CREATE OR REPLACE PROCEDURE place_order(
    p_account_id    INT,
    p_instrument_id INT,
    p_side          VARCHAR(4),
    p_order_type    VARCHAR(6),
    p_limit_price   NUMERIC(12,2),
    p_quantity      INT,
    OUT p_order_id  BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_required_cash     NUMERIC(14,2);
    v_available_cash    NUMERIC(14,2);
    v_held_shares       INT;
    v_committed_shares  INT;
    v_fill              RECORD;
    v_total_filled      INT := 0;
    v_new_status        VARCHAR(16);
    v_buyer_id          INT;
    v_seller_id         INT;
    v_buy_order_id      BIGINT;
    v_sell_order_id     BIGINT;
    v_new_trade_id      BIGINT;
    v_buyer_cash        NUMERIC(14,2);
    v_seller_cash       NUMERIC(14,2);
    v_buy_limit_price   NUMERIC(12,2);
    v_fill_value        NUMERIC(14,2);
BEGIN
    -- input checks, before any lock or write
    IF p_order_type IS DISTINCT FROM 'LIMIT' THEN
        RAISE EXCEPTION 'place_order currently only supports LIMIT orders';
    END IF;
    IF p_side IS NULL OR p_side NOT IN ('BUY', 'SELL') THEN
        RAISE EXCEPTION 'side must be BUY or SELL';
    END IF;
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'quantity must be positive';
    END IF;
    IF p_quantity > 1000000 THEN
        RAISE EXCEPTION 'quantity must be at most 1000000';
    END IF;
    IF p_limit_price IS NULL OR p_limit_price <= 0 THEN
        RAISE EXCEPTION 'limit price must be positive';
    END IF;
    IF p_limit_price > 100000 THEN
        RAISE EXCEPTION 'limit price must be at most 100000';
    END IF;
    -- Postgres ignores (12,2) on procedure parameters, so 100.005 would
    -- get through: the order row would store 100.01 but the reservation
    -- would use 100.005, and cancelling it later would fail.
    IF p_limit_price <> round(p_limit_price, 2) THEN
        RAISE EXCEPTION 'limit price must have at most 2 decimal places';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM instruments WHERE instrument_id = p_instrument_id) THEN
        RAISE EXCEPTION 'instrument % does not exist', p_instrument_id;
    END IF;

    -- lock 1: one order at a time per instrument
    PERFORM pg_advisory_xact_lock(1, p_instrument_id);

    -- lock 2: all accounts this order can touch, in account_id order.
    -- The plan is computed here just to find those accounts; it can't
    -- change before we use it below because we hold lock 1.
    PERFORM 1
       FROM accounts
      WHERE account_id IN (
                SELECT p_account_id
                UNION
                SELECT o.account_id
                  FROM compute_fill_plan(p_instrument_id, p_side, p_account_id, p_quantity, p_limit_price) f
                  JOIN orders o ON o.order_id = f.resting_order_id)
      ORDER BY account_id
        FOR UPDATE;

    SELECT cash_balance - reserved_cash INTO v_available_cash
      FROM accounts WHERE account_id = p_account_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'account % does not exist', p_account_id;
    END IF;

    -- reserve cash (buy) or check free shares (sell)
    IF p_side = 'BUY' THEN
        v_required_cash := p_quantity * p_limit_price;

        IF v_available_cash < v_required_cash THEN
            RAISE EXCEPTION 'insufficient available cash: need %, have %', v_required_cash, v_available_cash;
        END IF;

        UPDATE accounts SET reserved_cash = reserved_cash + v_required_cash
          WHERE account_id = p_account_id;
    ELSE
        SELECT quantity INTO v_held_shares
          FROM holdings WHERE account_id = p_account_id AND instrument_id = p_instrument_id;

        SELECT COALESCE(SUM(remaining_quantity), 0) INTO v_committed_shares
          FROM orders
         WHERE account_id = p_account_id AND instrument_id = p_instrument_id
           AND side = 'SELL' AND status IN ('OPEN', 'PARTIALLY_FILLED');

        IF COALESCE(v_held_shares, 0) - v_committed_shares < p_quantity THEN
            RAISE EXCEPTION 'insufficient available shares: need %, have % (% held, % already committed to open sell orders)',
                p_quantity, COALESCE(v_held_shares, 0) - v_committed_shares,
                COALESCE(v_held_shares, 0), v_committed_shares;
        END IF;
    END IF;

    INSERT INTO orders (account_id, instrument_id, side, order_type, limit_price, quantity, remaining_quantity, status)
    VALUES (p_account_id, p_instrument_id, p_side, p_order_type, p_limit_price, p_quantity, p_quantity, 'OPEN')
    RETURNING order_id INTO p_order_id;

    -- apply each fill from the plan
    FOR v_fill IN
        SELECT * FROM compute_fill_plan(p_instrument_id, p_side, p_account_id, p_quantity, p_limit_price)
    LOOP
        IF p_side = 'BUY' THEN
            v_buy_order_id    := p_order_id;
            v_sell_order_id   := v_fill.resting_order_id;
            v_buyer_id        := p_account_id;
            v_buy_limit_price := p_limit_price;
            SELECT account_id INTO v_seller_id FROM orders WHERE order_id = v_fill.resting_order_id;
        ELSE
            v_sell_order_id := p_order_id;
            v_buy_order_id  := v_fill.resting_order_id;
            v_seller_id     := p_account_id;
            SELECT account_id, limit_price INTO v_buyer_id, v_buy_limit_price
              FROM orders WHERE order_id = v_fill.resting_order_id;
        END IF;

        v_fill_value := v_fill.fill_qty * v_fill.fill_price;

        INSERT INTO trades (buy_order_id, sell_order_id, instrument_id, price, quantity)
        VALUES (v_buy_order_id, v_sell_order_id, p_instrument_id, v_fill.fill_price, v_fill.fill_qty)
        RETURNING trade_id INTO v_new_trade_id;
        -- the trade trigger updates instruments.last_price

        UPDATE orders
        SET remaining_quantity = remaining_quantity - v_fill.fill_qty,
            status = CASE WHEN remaining_quantity - v_fill.fill_qty = 0 THEN 'FILLED' ELSE 'PARTIALLY_FILLED' END
        WHERE order_id = v_fill.resting_order_id;

        -- Buyer pays the fill value and releases the reservation (made at
        -- the buy limit price) in one statement. reserved_cash <= cash_balance
        -- is checked after every statement, so two separate updates would
        -- fail for a buyer with little spare cash.
        UPDATE accounts
           SET cash_balance  = cash_balance - v_fill_value,
               reserved_cash = reserved_cash - v_fill.fill_qty * v_buy_limit_price
         WHERE account_id = v_buyer_id
        RETURNING cash_balance INTO v_buyer_cash;

        UPDATE accounts SET cash_balance = cash_balance + v_fill_value
         WHERE account_id = v_seller_id
        RETURNING cash_balance INTO v_seller_cash;

        INSERT INTO cash_ledger (account_id, txn_type, amount, balance_after, related_trade_id)
        VALUES (v_buyer_id, 'TRADE_BUY', -v_fill_value, v_buyer_cash, v_new_trade_id);

        INSERT INTO cash_ledger (account_id, txn_type, amount, balance_after, related_trade_id)
        VALUES (v_seller_id, 'TRADE_SELL', v_fill_value, v_seller_cash, v_new_trade_id);

        -- move shares; buyer's avg_cost is a weighted average
        UPDATE holdings SET quantity = quantity - v_fill.fill_qty
          WHERE account_id = v_seller_id AND instrument_id = p_instrument_id;

        INSERT INTO holdings (account_id, instrument_id, quantity, avg_cost)
        VALUES (v_buyer_id, p_instrument_id, v_fill.fill_qty, v_fill.fill_price)
        ON CONFLICT (account_id, instrument_id) DO UPDATE
            SET avg_cost = ((holdings.quantity * holdings.avg_cost)
                             + (EXCLUDED.quantity * EXCLUDED.avg_cost))
                            / (holdings.quantity + EXCLUDED.quantity),
                quantity = holdings.quantity + EXCLUDED.quantity;

        v_total_filled := v_total_filled + v_fill.fill_qty;
    END LOOP;

    -- final status of the new order
    IF v_total_filled = p_quantity THEN
        v_new_status := 'FILLED';
    ELSIF v_total_filled > 0 THEN
        v_new_status := 'PARTIALLY_FILLED';
    ELSE
        v_new_status := 'OPEN';
    END IF;

    UPDATE orders
    SET remaining_quantity = p_quantity - v_total_filled,
        status = v_new_status
    WHERE order_id = p_order_id;
END;
$$;


-- cancel_order
-- Marks an open order CANCELLED and, for a buy, releases the cash still
-- reserved for it (remaining_quantity * limit_price). Both changes happen
-- in one transaction. A cancelled sell simply stops counting against the
-- account's free shares.
CREATE OR REPLACE PROCEDURE cancel_order(
    p_order_id   BIGINT,
    p_account_id INT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_instrument_id INT;
    v_owner_id      INT;
    v_side          VARCHAR(4);
    v_status        VARCHAR(16);
    v_remaining     INT;
    v_limit_price   NUMERIC(12,2);
    v_release       NUMERIC(14,2);
BEGIN
    SELECT instrument_id INTO v_instrument_id FROM orders WHERE order_id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'order % does not exist', p_order_id;
    END IF;

    -- same instrument lock as place_order
    PERFORM pg_advisory_xact_lock(1, v_instrument_id);

    -- read the order again now that we hold the lock (it may have just filled)
    SELECT account_id, side, status, remaining_quantity, limit_price
      INTO v_owner_id, v_side, v_status, v_remaining, v_limit_price
      FROM orders
     WHERE order_id = p_order_id
       FOR UPDATE;

    -- only the owner can cancel (no login, so it is checked here)
    IF v_owner_id IS DISTINCT FROM p_account_id THEN
        RAISE EXCEPTION 'order % does not belong to account %', p_order_id, p_account_id;
    END IF;

    IF v_status NOT IN ('OPEN', 'PARTIALLY_FILLED') THEN
        RAISE EXCEPTION 'cannot cancel order % because its status is % (only OPEN or PARTIALLY_FILLED orders can be cancelled)',
                        p_order_id, v_status;
    END IF;

    IF v_side = 'BUY' THEN
        v_release := v_remaining * v_limit_price;
        UPDATE accounts
           SET reserved_cash = reserved_cash - v_release
         WHERE account_id = p_account_id;
    END IF;

    UPDATE orders
       SET remaining_quantity = 0,
           status = 'CANCELLED'
     WHERE order_id = p_order_id;
END;
$$;
