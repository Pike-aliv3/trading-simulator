-- Sample data. Run after schema.sql on an empty database.

BEGIN;

-- fixed seed so every rebuild gives the same data (times stay relative to now())
SELECT setseed(0.19);

-- 1. Instruments, listed a year ago
INSERT INTO instruments (ticker, company_name, sector, last_price, listed_at)
SELECT ticker, company_name, sector, last_price, now() - interval '365 days' FROM (VALUES
    ('NEXG',  'NexGen Semiconductors',    'Technology', 1450.00),
    ('AURB',  'Aurora Biosciences',       'Pharma',      780.50),
    ('BLTX',  'Bolt Logistics',           'Transport',   310.25),
    ('SVFN',  'Silverline Finance',       'Banking',     620.00),
    ('GRNH',  'GreenHarvest Agro',        'Consumer',    210.75),
    ('OCTM',  'OctaMotors',               'Auto',        995.00),
    ('PLSE',  'Pulse Energy',             'Energy',      455.60),
    ('CVRT',  'Covert Systems',           'Technology', 2100.00),
    ('MTRX',  'Matrix Retail',            'Consumer',    150.30),
    ('ZNTH',  'Zenith Pharmaceuticals',   'Pharma',      890.00),
    ('QRKS',  'Quarks Robotics',          'Technology', 3200.00),
    ('HRZN',  'Horizon Steel',            'Industrial',  410.00),
    ('LMNR',  'Luminar Media',            'Media',       275.90),
    ('TRDW',  'Tradewind Shipping',       'Transport',   340.15),
    ('APXB',  'Apex Bank',                'Banking',     540.45)
) AS v (ticker, company_name, sector, last_price);

-- 2. Users, accounts and their first deposit
DO $$
DECLARE
    first_names TEXT[] := ARRAY['Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Reyansh',
        'Krishna','Ishaan','Rohan','Ananya','Diya','Saanvi','Aadhya','Myra','Anika','Ira',
        'Riya','Sara','Kiara','Dev','Kabir','Yash','Nikhil','Rahul'];
    last_names TEXT[] := ARRAY['Sharma','Verma','Gupta','Patel','Iyer','Reddy','Nair','Rao',
        'Mehta','Kapoor','Joshi','Singh','Bose','Chatterjee','Pillai'];
    i INT;
    v_name TEXT;
    v_email TEXT;
    v_user_id INT;
    v_account_id INT;
    v_cash NUMERIC(14,2);
    v_opened TIMESTAMPTZ;
BEGIN
    FOR i IN 1..50 LOOP
        v_name := first_names[1 + (i % array_length(first_names,1))] || ' ' ||
                  last_names[1 + (i % array_length(last_names,1))];
        v_email := 'trader' || i || '@example.com';

        -- opened 61-90 days ago, before the trades in step 4
        v_opened := now() - interval '61 days' - (random() * interval '29 days');

        INSERT INTO users (name, email, created_at)
        VALUES (v_name, v_email, v_opened)
        RETURNING user_id INTO v_user_id;

        v_cash := round((50000 + random() * 450000)::numeric, 2);

        INSERT INTO accounts (user_id, cash_balance, reserved_cash, created_at)
        VALUES (v_user_id, v_cash, 0, v_opened)
        RETURNING account_id INTO v_account_id;

        INSERT INTO cash_ledger (account_id, txn_type, amount, balance_after, created_at)
        VALUES (v_account_id, 'DEPOSIT', v_cash, v_cash, v_opened);
    END LOOP;

    -- every 5th user gets a second account (accounts 51-60)
    FOR i IN 1..10 LOOP
        v_cash := round((20000 + random() * 80000)::numeric, 2);

        SELECT created_at + (random() * (now() - interval '60 days' - created_at))
          INTO v_opened FROM users WHERE user_id = i * 5;

        INSERT INTO accounts (user_id, cash_balance, reserved_cash, created_at)
        VALUES (i * 5, v_cash, 0, v_opened)
        RETURNING account_id INTO v_account_id;

        INSERT INTO cash_ledger (account_id, txn_type, amount, balance_after, created_at)
        VALUES (v_account_id, 'DEPOSIT', v_cash, v_cash, v_opened);
    END LOOP;
END $$;

-- 3. Starting shares, so there are sellers before any trade
DO $$
DECLARE
    acct_ids INT[];
    inst RECORD;
    j INT;
    chosen_acct INT;
    alloc_qty INT;
BEGIN
    SELECT array_agg(account_id) INTO acct_ids FROM accounts;

    FOR inst IN SELECT instrument_id, last_price FROM instruments LOOP
        FOR j IN 1..8 LOOP
            chosen_acct := acct_ids[1 + floor(random() * array_length(acct_ids,1))::int];
            alloc_qty := 100 + floor(random() * 900)::int;

            INSERT INTO holdings (account_id, instrument_id, quantity, avg_cost)
            VALUES (chosen_acct, inst.instrument_id, alloc_qty, inst.last_price)
            ON CONFLICT (account_id, instrument_id) DO UPDATE
                SET avg_cost = ((holdings.quantity * holdings.avg_cost)
                                 + (EXCLUDED.quantity * EXCLUDED.avg_cost))
                                / (holdings.quantity + EXCLUDED.quantity),
                    quantity = holdings.quantity + EXCLUDED.quantity;
        END LOOP;
    END LOOP;
END $$;

-- 4. Past trades: filled buy and sell orders plus the trade, with cash,
--    holdings, ledger and last_price updated the same way place_order does
DO $$
DECLARE
    n INT;
    seller_row RECORD;
    buyer_id INT;
    qty INT;
    trade_price NUMERIC(12,2);
    buyer_cash NUMERIC(14,2);
    new_buyer_cash NUMERIC(14,2);
    new_seller_cash NUMERIC(14,2);
    buy_oid BIGINT;
    sell_oid BIGINT;
    new_trade_id BIGINT;
    ts TIMESTAMPTZ;
BEGIN
    FOR n IN 1..120 LOOP
        SELECT h.account_id, h.instrument_id, h.quantity, i.last_price
          INTO seller_row
          FROM holdings h JOIN instruments i ON i.instrument_id = h.instrument_id
          WHERE h.quantity > 0
          ORDER BY random() LIMIT 1;

        IF seller_row IS NULL THEN
            CONTINUE;
        END IF;

        qty := 1 + floor(random() * LEAST(seller_row.quantity, 30))::int;

        SELECT account_id INTO buyer_id FROM accounts
          WHERE account_id <> seller_row.account_id
          ORDER BY random() LIMIT 1;

        trade_price := round((seller_row.last_price * (0.97 + random() * 0.06))::numeric, 2);

        SELECT cash_balance INTO buyer_cash FROM accounts WHERE account_id = buyer_id;
        IF buyer_cash < trade_price * qty THEN
            CONTINUE;
        END IF;

        -- trade n falls in the n-th half-day of the last 60 days, so trades
        -- are inserted in time order and balance_after adds up by date
        ts := now() - interval '60 days' + (n - 1 + random()) * interval '12 hours';

        INSERT INTO orders (account_id, instrument_id, side, order_type, limit_price,
                             quantity, remaining_quantity, status, created_at, updated_at)
        VALUES (buyer_id, seller_row.instrument_id, 'BUY', 'LIMIT', trade_price,
                qty, 0, 'FILLED', ts, ts)
        RETURNING order_id INTO buy_oid;

        INSERT INTO orders (account_id, instrument_id, side, order_type, limit_price,
                             quantity, remaining_quantity, status, created_at, updated_at)
        VALUES (seller_row.account_id, seller_row.instrument_id, 'SELL', 'LIMIT', trade_price,
                qty, 0, 'FILLED', ts, ts)
        RETURNING order_id INTO sell_oid;

        INSERT INTO trades (buy_order_id, sell_order_id, instrument_id, price, quantity, executed_at)
        VALUES (buy_oid, sell_oid, seller_row.instrument_id, trade_price, qty, ts)
        RETURNING trade_id INTO new_trade_id;

        new_buyer_cash := buyer_cash - trade_price * qty;
        UPDATE accounts SET cash_balance = new_buyer_cash WHERE account_id = buyer_id;

        SELECT cash_balance INTO new_seller_cash FROM accounts WHERE account_id = seller_row.account_id;
        new_seller_cash := new_seller_cash + trade_price * qty;
        UPDATE accounts SET cash_balance = new_seller_cash WHERE account_id = seller_row.account_id;

        INSERT INTO cash_ledger (account_id, txn_type, amount, balance_after, related_trade_id, created_at)
        VALUES (buyer_id, 'TRADE_BUY', -(trade_price * qty), new_buyer_cash, new_trade_id, ts);

        INSERT INTO cash_ledger (account_id, txn_type, amount, balance_after, related_trade_id, created_at)
        VALUES (seller_row.account_id, 'TRADE_SELL', trade_price * qty, new_seller_cash, new_trade_id, ts);

        UPDATE holdings SET quantity = quantity - qty
          WHERE account_id = seller_row.account_id AND instrument_id = seller_row.instrument_id;

        INSERT INTO holdings (account_id, instrument_id, quantity, avg_cost)
        VALUES (buyer_id, seller_row.instrument_id, qty, trade_price)
        ON CONFLICT (account_id, instrument_id) DO UPDATE
            SET avg_cost = ((holdings.quantity * holdings.avg_cost)
                             + (EXCLUDED.quantity * EXCLUDED.avg_cost))
                            / (holdings.quantity + EXCLUDED.quantity),
                quantity = holdings.quantity + EXCLUDED.quantity;

        UPDATE instruments SET last_price = trade_price WHERE instrument_id = seller_row.instrument_id;
    END LOOP;
END $$;

-- 5. Open orders on the book: up to 6 bids (1-5% below last price) and
--    6 asks (1-5% above) per instrument, on a 0.50 tick. Buyers need the
--    free cash (reserved); sellers need shares not already offered.
DO $$
DECLARE
    inst RECORD;
    k INT;
    acct_id INT;
    qty INT;
    price NUMERIC(12,2);
    ts TIMESTAMPTZ;
BEGIN
    FOR inst IN SELECT instrument_id, last_price FROM instruments ORDER BY instrument_id LOOP
        -- bids
        FOR k IN 1..6 LOOP
            qty   := 5 + floor(random() * 36)::int;
            price := round(inst.last_price * (0.95 + random() * 0.04) * 2) / 2;
            ts    := now() - (random() * interval '5 days');

            SELECT account_id INTO acct_id
              FROM accounts
             WHERE cash_balance - reserved_cash >= price * qty
             ORDER BY random() LIMIT 1;
            CONTINUE WHEN acct_id IS NULL;

            UPDATE accounts SET reserved_cash = reserved_cash + price * qty
             WHERE account_id = acct_id;

            INSERT INTO orders (account_id, instrument_id, side, order_type, limit_price,
                                quantity, remaining_quantity, status, created_at, updated_at)
            VALUES (acct_id, inst.instrument_id, 'BUY', 'LIMIT', price, qty, qty, 'OPEN', ts, ts);
        END LOOP;

        -- asks
        FOR k IN 1..6 LOOP
            qty   := 5 + floor(random() * 36)::int;
            price := round(inst.last_price * (1.01 + random() * 0.04) * 2) / 2;
            ts    := now() - (random() * interval '5 days');

            SELECT h.account_id INTO acct_id
              FROM holdings h
             WHERE h.instrument_id = inst.instrument_id
               AND h.quantity - COALESCE((SELECT SUM(o.remaining_quantity) FROM orders o
                                           WHERE o.account_id = h.account_id
                                             AND o.instrument_id = h.instrument_id
                                             AND o.side = 'SELL' AND o.status = 'OPEN'), 0) >= qty
             ORDER BY random() LIMIT 1;
            CONTINUE WHEN acct_id IS NULL;

            INSERT INTO orders (account_id, instrument_id, side, order_type, limit_price,
                                quantity, remaining_quantity, status, created_at, updated_at)
            VALUES (acct_id, inst.instrument_id, 'SELL', 'LIMIT', price, qty, qty, 'OPEN', ts, ts);
        END LOOP;
    END LOOP;
END $$;

-- 6. Watchlists
DO $$
DECLARE
    n INT;
    k INT;
    v_user_id INT;
    wl_id INT;
    inst_id INT;
BEGIN
    FOR n IN 1..30 LOOP
        SELECT user_id INTO v_user_id FROM users ORDER BY random() LIMIT 1;

        INSERT INTO watchlists (user_id, name)
        VALUES (v_user_id, 'Watchlist ' || n)
        ON CONFLICT (user_id, name) DO NOTHING
        RETURNING watchlist_id INTO wl_id;

        IF wl_id IS NULL THEN
            CONTINUE;
        END IF;

        FOR k IN 1..(2 + floor(random() * 4)::int) LOOP
            SELECT instrument_id INTO inst_id FROM instruments ORDER BY random() LIMIT 1;

            INSERT INTO watchlist_items (watchlist_id, instrument_id)
            VALUES (wl_id, inst_id)
            ON CONFLICT DO NOTHING;
        END LOOP;
    END LOOP;
END $$;

-- 7. New users who haven't traded (51-55). 51-53 have an account and a
--    deposit, 54-55 have no account yet. Query 6 should list these.
DO $$
DECLARE
    i INT;
    v_user_id INT;
    v_account_id INT;
    v_cash NUMERIC(14,2);
    names TEXT[] := ARRAY['Meera Krishnan', 'Arnav Desai', 'Tara Menon', 'Kunal Bhatt', 'Nisha Ahuja'];
BEGIN
    FOR i IN 1..5 LOOP
        INSERT INTO users (name, email, created_at)
        VALUES (names[i], 'trader' || (50 + i) || '@example.com', now() - (i * interval '6 hours'))
        RETURNING user_id INTO v_user_id;

        IF i <= 3 THEN
            v_cash := round((25000 + random() * 75000)::numeric, 2);

            INSERT INTO accounts (user_id, cash_balance, reserved_cash, created_at)
            VALUES (v_user_id, v_cash, 0, now() - (i * interval '6 hours') + interval '1 hour')
            RETURNING account_id INTO v_account_id;

            INSERT INTO cash_ledger (account_id, txn_type, amount, balance_after, created_at)
            VALUES (v_account_id, 'DEPOSIT', v_cash, v_cash, now() - (i * interval '6 hours') + interval '1 hour');
        END IF;
    END LOOP;
END $$;

COMMIT;
