CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    is_active     INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login    TEXT
);

-- Admin-managed dropdown values.
CREATE TABLE IF NOT EXISTS options (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    kind       TEXT    NOT NULL,              -- category | driving_force | emotion | payment_method
    label      TEXT    NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active  INTEGER NOT NULL DEFAULT 1,
    UNIQUE (kind, label)
);

CREATE TABLE IF NOT EXISTS expenses (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    date              TEXT    NOT NULL,       -- ISO yyyy-mm-dd
    item              TEXT    NOT NULL,
    amount            REAL    NOT NULL CHECK (amount > 0),
    category_id       INTEGER NOT NULL REFERENCES options (id),
    driving_force_id  INTEGER NOT NULL REFERENCES options (id),
    emotion_id        INTEGER NOT NULL REFERENCES options (id),
    payment_method_id INTEGER REFERENCES options (id),
    notes             TEXT    NOT NULL DEFAULT '',
    created_at        TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses (user_id, date);

CREATE TABLE IF NOT EXISTS months (
    user_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    year         INTEGER NOT NULL,
    month        INTEGER NOT NULL,
    vision       TEXT    NOT NULL DEFAULT '',
    tasks        TEXT    NOT NULL DEFAULT '[]',  -- JSON list of {"text": str, "done": bool}
    income       REAL,
    achievements TEXT    NOT NULL DEFAULT '',
    notes        TEXT    NOT NULL DEFAULT '',
    PRIMARY KEY (user_id, year, month)
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Money coming in, from any source (salary, freelance, interest, ...).
CREATE TABLE IF NOT EXISTS incomes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    date       TEXT    NOT NULL,
    source_id  INTEGER NOT NULL REFERENCES options (id),
    amount     REAL    NOT NULL CHECK (amount > 0),
    notes      TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_incomes_user_date ON incomes (user_id, date);

-- Money put into (or taken out of) an investment. "name" identifies the holding, e.g. "SBI FD".
CREATE TABLE IF NOT EXISTS investments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    date       TEXT    NOT NULL,
    type_id    INTEGER NOT NULL REFERENCES options (id),
    name       TEXT    NOT NULL,
    action     TEXT    NOT NULL CHECK (action IN ('invest', 'withdraw')),
    amount     REAL    NOT NULL CHECK (amount > 0),
    notes      TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_investments_user_date ON investments (user_id, date);

-- Optional "what is it worth today" value the user types in per holding.
CREATE TABLE IF NOT EXISTS holding_values (
    user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name          TEXT    NOT NULL COLLATE NOCASE,
    current_value REAL    NOT NULL CHECK (current_value >= 0),
    updated_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, name)
);
