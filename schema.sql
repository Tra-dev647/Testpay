DROP TABLE IF EXISTS apple_orders;
CREATE TABLE apple_orders (
  id TEXT PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  username TEXT,
  first_name TEXT,
  qty INTEGER NOT NULL CHECK (qty > 0),
  amount INTEGER NOT NULL CHECK (amount > 0),
  md5 TEXT NOT NULL UNIQUE,
  qr TEXT NOT NULL,
  message_id BIGINT,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PAID','FAILED','EXPIRED','CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ
);
CREATE INDEX apple_orders_chat_idx ON apple_orders (chat_id, created_at DESC);
CREATE INDEX apple_orders_status_idx ON apple_orders (status);
