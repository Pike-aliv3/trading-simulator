-- Trading Simulator: tables
-- All timestamps are TIMESTAMPTZ so times stay correct whatever time
-- zone the database or the backend runs in.

-- No login in this project, so there is no password column.
CREATE TABLE users (
    user_id       SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(255) NOT NULL UNIQUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A user can have several accounts (1:N), each with its own cash.
CREATE TABLE accounts (
    account_id    SERIAL PRIMARY KEY,
    user_id       INT NOT NULL REFERENCES users(user_id),
    cash_balance  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cash_balance >= 0),
    reserved_cash NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (reserved_cash >= 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (reserved_cash <= cash_balance)
);

CREATE TABLE instruments (
    instrument_id SERIAL PRIMARY KEY,
    ticker        VARCHAR(10) NOT NULL UNIQUE,
    company_name  VARCHAR(150) NOT NULL,
    sector        VARCHAR(50),
    last_price    NUMERIC(12,2) NOT NULL CHECK (last_price > 0),
    listed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
    order_id           BIGSERIAL PRIMARY KEY,
    account_id         INT NOT NULL REFERENCES accounts(account_id),
    instrument_id      INT NOT NULL REFERENCES instruments(instrument_id),
    side               VARCHAR(4) NOT NULL CHECK (side IN ('BUY', 'SELL')),
    order_type         VARCHAR(6) NOT NULL CHECK (order_type IN ('LIMIT', 'MARKET')),
    limit_price        NUMERIC(12,2) CHECK (limit_price > 0),
    quantity           INT NOT NULL CHECK (quantity > 0),
    remaining_quantity INT NOT NULL CHECK (remaining_quantity >= 0),
    status             VARCHAR(16) NOT NULL DEFAULT 'OPEN'
                       CHECK (status IN ('OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (remaining_quantity <= quantity),
    CHECK (
        (order_type = 'LIMIT'  AND limit_price IS NOT NULL) OR
        (order_type = 'MARKET' AND limit_price IS NULL)
    ),
    -- status has to match remaining_quantity
    CHECK (
        (status = 'OPEN'             AND remaining_quantity = quantity) OR
        (status = 'PARTIALLY_FILLED' AND remaining_quantity > 0 AND remaining_quantity < quantity) OR
        (status IN ('FILLED', 'CANCELLED') AND remaining_quantity = 0)
    ),
    -- target for the composite foreign keys on trades
    UNIQUE (order_id, instrument_id)
);

CREATE TABLE trades (
    trade_id      BIGSERIAL PRIMARY KEY,
    buy_order_id  BIGINT NOT NULL,
    sell_order_id BIGINT NOT NULL,
    instrument_id INT NOT NULL REFERENCES instruments(instrument_id),
    price         NUMERIC(12,2) NOT NULL CHECK (price > 0),
    quantity      INT NOT NULL CHECK (quantity > 0),
    executed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (buy_order_id <> sell_order_id),
    -- instrument_id is stored to save a join. These keys make sure it
    -- is the same instrument as both orders.
    FOREIGN KEY (buy_order_id,  instrument_id) REFERENCES orders(order_id, instrument_id),
    FOREIGN KEY (sell_order_id, instrument_id) REFERENCES orders(order_id, instrument_id)
);

CREATE TABLE holdings (
    account_id    INT NOT NULL REFERENCES accounts(account_id),
    instrument_id INT NOT NULL REFERENCES instruments(instrument_id),
    quantity      INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    avg_cost      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (avg_cost >= 0),
    PRIMARY KEY (account_id, instrument_id)
);

CREATE TABLE cash_ledger (
    ledger_id        BIGSERIAL PRIMARY KEY,
    account_id       INT NOT NULL REFERENCES accounts(account_id),
    txn_type         VARCHAR(12) NOT NULL
                     CHECK (txn_type IN ('DEPOSIT', 'WITHDRAWAL', 'TRADE_BUY', 'TRADE_SELL')),
    amount           NUMERIC(14,2) NOT NULL,
    balance_after    NUMERIC(14,2) NOT NULL CHECK (balance_after >= 0),
    related_trade_id BIGINT REFERENCES trades(trade_id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- money in is positive, money out is negative
    CHECK (
        (txn_type IN ('DEPOSIT', 'TRADE_SELL')    AND amount > 0) OR
        (txn_type IN ('WITHDRAWAL', 'TRADE_BUY')  AND amount < 0)
    ),
    -- trade rows must point to their trade, deposits/withdrawals must not
    CHECK ((txn_type IN ('TRADE_BUY', 'TRADE_SELL')) = (related_trade_id IS NOT NULL)),
    -- one buyer row and one seller row per trade
    UNIQUE (related_trade_id, txn_type)
);

-- Price history is the view v_price_history over trades (views.sql).

CREATE TABLE watchlists (
    watchlist_id SERIAL PRIMARY KEY,
    user_id      INT NOT NULL REFERENCES users(user_id),
    name         VARCHAR(100) NOT NULL CHECK (btrim(name) <> ''),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, name)
);

CREATE TABLE watchlist_items (
    watchlist_id  INT NOT NULL REFERENCES watchlists(watchlist_id) ON DELETE CASCADE,
    instrument_id INT NOT NULL REFERENCES instruments(instrument_id),
    added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (watchlist_id, instrument_id)
);
