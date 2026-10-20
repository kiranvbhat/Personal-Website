-- The guestbook database (Cloudflare D1, which is SQLite), part 1: the tables.
-- Changes to the database go in new numbered files in this folder; `npm run db:remote` applies the ones the real
-- database doesn't have yet (and `npm run db:local` the local test one), each only once.

-- Guestbook entries. The id is also the entry number shown on the page; AUTOINCREMENT means numbers of deleted
-- entries are never reused.
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  location TEXT,  -- no longer asked for
  homepage TEXT,
  created TEXT NOT NULL  -- ISO date and time, UTC
);

-- Recent posts and wrong admin passwords, for the per-visitor limits. `visitor` is a scrambled hash of the IP
-- address (never the address itself), and rows are deleted after two days. `nonce` is the robot check's id, so a
-- solved check can't be used twice.
CREATE TABLE IF NOT EXISTS actions (
  kind TEXT NOT NULL,     -- 'post' or 'login'
  visitor TEXT NOT NULL,
  created INTEGER NOT NULL,  -- milliseconds since 1970
  nonce TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS actions_by_visitor ON actions (kind, visitor, created);
