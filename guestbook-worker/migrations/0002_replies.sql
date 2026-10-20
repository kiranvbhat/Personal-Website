-- Part 2: replies from the admin page. `replied` is when (ISO date and time, UTC).
ALTER TABLE entries ADD COLUMN reply TEXT;
ALTER TABLE entries ADD COLUMN replied TEXT;
