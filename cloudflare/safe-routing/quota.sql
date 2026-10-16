-- Apply only to the dedicated Cloudflare D1 quota database, before enabling
-- the Worker. This table contains no route, coordinate, account or raw token.
CREATE TABLE IF NOT EXISTS safe_routing_quota (
  day TEXT NOT NULL,
  client_hash TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  PRIMARY KEY (day, client_hash)
);
