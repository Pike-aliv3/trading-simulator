-- Deposits and withdrawals
-- Each one updates cash_balance and writes a ledger row in the same
-- transaction. The account row is locked FOR UPDATE, like in place_order,
-- so a withdrawal and an order on the same account can't overlap.

CREATE OR REPLACE PROCEDURE deposit_cash(
    p_account_id INT,
    p_amount     NUMERIC(14,2)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_balance     NUMERIC(14,2);
    v_new_balance NUMERIC(14,2);
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'amount must be positive';
    END IF;
    IF p_amount > 10000000 THEN
        RAISE EXCEPTION 'amount must be at most 10000000';
    END IF;
    -- (14,2) on a parameter isn't enforced, same as in place_order
    IF p_amount <> round(p_amount, 2) THEN
        RAISE EXCEPTION 'amount must have at most 2 decimal places';
    END IF;

    SELECT cash_balance INTO v_balance
      FROM accounts WHERE account_id = p_account_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'account % does not exist', p_account_id;
    END IF;
    -- NUMERIC(14,2) holds up to 999,999,999,999.99
    IF v_balance + p_amount >= 1000000000000 THEN
        RAISE EXCEPTION 'deposit would take the balance over the maximum an account can hold';
    END IF;

    UPDATE accounts SET cash_balance = cash_balance + p_amount
     WHERE account_id = p_account_id
    RETURNING cash_balance INTO v_new_balance;

    INSERT INTO cash_ledger (account_id, txn_type, amount, balance_after)
    VALUES (p_account_id, 'DEPOSIT', p_amount, v_new_balance);
END;
$$;


-- Only free cash (cash_balance - reserved_cash) can be withdrawn. The
-- CHECK on accounts would block it anyway; this gives a clearer message.
CREATE OR REPLACE PROCEDURE withdraw_cash(
    p_account_id INT,
    p_amount     NUMERIC(14,2)
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_available   NUMERIC(14,2);
    v_new_balance NUMERIC(14,2);
BEGIN
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'amount must be positive';
    END IF;
    IF p_amount > 10000000 THEN
        RAISE EXCEPTION 'amount must be at most 10000000';
    END IF;
    IF p_amount <> round(p_amount, 2) THEN
        RAISE EXCEPTION 'amount must have at most 2 decimal places';
    END IF;

    SELECT cash_balance - reserved_cash INTO v_available
      FROM accounts WHERE account_id = p_account_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'account % does not exist', p_account_id;
    END IF;

    IF v_available < p_amount THEN
        RAISE EXCEPTION 'insufficient available cash: need %, have % (the rest is reserved for open buy orders)',
            p_amount, v_available;
    END IF;

    UPDATE accounts SET cash_balance = cash_balance - p_amount
     WHERE account_id = p_account_id
    RETURNING cash_balance INTO v_new_balance;

    INSERT INTO cash_ledger (account_id, txn_type, amount, balance_after)
    VALUES (p_account_id, 'WITHDRAWAL', -p_amount, v_new_balance);
END;
$$;
