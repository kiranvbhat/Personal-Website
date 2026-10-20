# Guestbook server

The guestbook's pages (`guestbook.html`, `guestbook-sign.html`, `assets/js/guestbook.js`) need somewhere to store entries, and GitHub Pages
can only serve files. So entries are stored by this small server, a **Cloudflare Worker** (a function Cloudflare
runs for each request) with a **D1 database** (SQLite). Both are free for a site this size.

- `src/index.js`: the server. The settings (posts per day, message length, and so on) are at the top.
- `migrations/`: the database's setup, as numbered steps (`0001_create_tables.sql`, `0002_replies.sql`, ...).
  Cloudflare remembers which steps a database has had, so each runs only once.
- `wrangler.toml`: Cloudflare settings. Wrangler is Cloudflare's command-line tool.

The admin page is `/guestbook-admin` on the site (not linked anywhere). Log in with the admin password to reply to
or delete entries.

## First-time setup

You need a free Cloudflare account (https://dash.cloudflare.com/sign-up). Then, in a terminal:

```sh
cd guestbook-worker
nvm use              # Wrangler needs Node 22 (.nvmrc says so); `nvm install 22` if you don't have it
npm install          # installs Wrangler into node_modules/
npx wrangler login   # opens your browser to connect Wrangler to your Cloudflare account
```

1. **Create the database:**

   ```sh
   npx wrangler d1 create guestbook
   ```

   It prints a `database_id`. Paste it into `wrangler.toml` in place of the zeros.

2. **Create the tables:**

   ```sh
   npm run db:remote
   ```

3. **Put the server online:**

   ```sh
   npm run deploy
   ```

   It prints the server's address, like `https://kiranvbhat-guestbook.YOUR-NAME.workers.dev`.

4. **Set the two secrets.** Each command asks you to type the value. They're stored on Cloudflare, never in this
   repo.

   ```sh
   npx wrangler secret put ADMIN_PASSWORD   # the password for the admin page; make it long
   npx wrangler secret put SECRET           # paste a long random string, from: openssl rand -hex 32
   ```

   `SECRET` is used to sign the robot checks and admin logins and to scramble IP addresses. Changing it later logs
   you out and resets the per-visitor limits, but doesn't touch entries.

5. **Point the site at it:** in `_config.yml`, set `guestbook_api:` to the address from step 3, then commit and
   push. The guestbook pages switch from "coming soon" to the real guestbook.

## Changing the server later

Edit `src/index.js`, then `npm run deploy` again. Changes to the site itself (the page, `guestbook.js`, the CSS)
go live the usual way, by pushing.

To change the database (say, a new column), add the next numbered file to `migrations/`, then run
`npm run db:remote` **before** deploying the server code that needs it.

## Testing on your computer

Everything runs locally, without touching the real guestbook:

```sh
npm run db:local     # sets up a local test database (in .wrangler/); run again after adding a migration
npm run dev          # runs the server at http://127.0.0.1:8787
```

The local server reads its secrets from `.dev.vars` (not committed; it has a test password, `test-password`). Then
point a local copy of the site at it: in the main folder, make a file `_config.local.yml` (not committed) with

```yaml
guestbook_api: http://127.0.0.1:8787
```

and add `--config _config.yml,_config.local.yml` to the `jekyll serve` command from the main README, for example
`... bundle exec jekyll serve --config _config.yml,_config.local.yml --host 0.0.0.0 --force_polling"`. Open
http://localhost:4000/guestbook. (The server only accepts requests from the pages listed in
`ALLOWED_ORIGINS` in `wrangler.toml`, which include localhost:4000.)

## How spam is kept out

- A **hidden field** that people never see. Bots fill in every field, and anything that fills it in is ignored.
- A **math question** ("What is seven plus 3?"). The answer is never sent to the page: the server signs a token
  with the answer mixed in, and checks a guess by signing it again. Each question works once and expires after
  2 hours.
- A **minimum time**: forms sent within 3 seconds of loading the question are rejected.
- A **per-visitor limit** of 3 posts a day, by IP address. Addresses are stored only as a scrambled hash (using
  `SECRET`) and forgotten after two days. For IPv6, the whole /64 block counts as one visitor. Several people
  sharing one network (a school, a café) share the limit too.
- **No HTML.** Messages can only be formatted with a few tags like `[b]bold[/b]` and `[url=...]links[/url]`, which
  the page turns into formatting itself (`assets/js/guestbook-format.js`); everything else shows as plain text,
  so nobody can post HTML or scripts. Links (in messages and homepages) must be ordinary `http(s)` addresses and
  get `rel="nofollow ugc"`, so spammers get nothing from search engines.

Entries go live right away. To review them first instead, entries would need a "hidden until approved" column,
and the admin page an approve button.
