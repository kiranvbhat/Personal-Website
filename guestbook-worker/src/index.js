// The guestbook's server: a Cloudflare Worker (a small function Cloudflare runs for each request) with a D1
// (SQLite) database. The site's guestbook page (assets/js/guestbook.js) talks to it. See ../README.md for setup.
//
//   GET    /entries?page=N    one page of entries, newest first
//   GET    /challenge         a math question for the robot check, with a signed token
//   POST   /entries           sign the guestbook
//   POST   /admin/login       trade the admin password for a token (good for 12 hours)
//   PUT    /admin/entries/ID/reply  reply to an entry, or remove the reply with an empty one (needs the admin token)
//   DELETE /admin/entries/ID  delete an entry (needs the admin token)
//
// Spam defenses: a hidden field only bots fill in, the math question, a minimum time to fill in the form, and a
// limit on posts per visitor (by IP address, stored only as a scrambled hash and forgotten after a day).
// Messages are stored as typed. They can have formatting tags like [b]bold[/b], which the page turns into formatting
// itself from a short list (assets/js/guestbook-format.js), so nobody can post HTML or scripts.

const PAGE_SIZE = 10;
const POSTS_PER_DAY = 3;          // per visitor
const LOGIN_TRIES_PER_HOUR = 10;  // wrong admin passwords allowed per visitor
const MIN_FILL_SECONDS = 3;       // faster than this is a bot
const CHALLENGE_HOURS = 2;        // how long a math question stays answerable
const ADMIN_HOURS = 12;           // how long an admin login lasts
const LIMITS = { name: 40, message: 2000, homepage: 200, reply: 2000 };
const DAY = 24 * 60 * 60 * 1000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((o) => o.trim());
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    let response;
    try {
      response = await route(request, env);
    } catch (error) {
      console.error(error);
      response = json({ error: "Something broke on our end. Please try again later!" }, 500);
    }
    for (const [name, value] of Object.entries(cors)) response.headers.set(name, value);
    return response;
  },
};

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  const method = request.method;

  if (method === "GET" && path === "/entries") return listEntries(env, url);
  if (method === "GET" && path === "/challenge") return json(await makeChallenge(env));
  if (method === "POST" && path === "/entries") return signGuestbook(request, env);
  if (method === "POST" && path === "/admin/login") return adminLogin(request, env);
  const deleting = path.match(/^\/admin\/entries\/(\d+)$/);
  if (method === "DELETE" && deleting) return deleteEntry(request, env, Number(deleting[1]));
  const replying = path.match(/^\/admin\/entries\/(\d+)\/reply$/);
  if (method === "PUT" && replying) return replyToEntry(request, env, Number(replying[1]));
  return json({ error: "Not found" }, 404);
}

// ---------- Reading ----------

async function listEntries(env, url) {
  const total = (await env.DB.prepare("SELECT COUNT(*) AS n FROM entries").first()).n;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, parseInt(url.searchParams.get("page"), 10) || 1));
  const { results } = await env.DB.prepare(
    "SELECT id, name, message, homepage, created, reply, replied FROM entries ORDER BY id DESC LIMIT ? OFFSET ?"
  ).bind(PAGE_SIZE, (page - 1) * PAGE_SIZE).all();
  return json({ entries: results, total, page, pages });
}

// ---------- Signing ----------

async function signGuestbook(request, env) {
  const form = await readJson(request);
  if (!form) return json({ error: "That didn't look like a guestbook entry." }, 400);

  // Hidden field: people never see it, so only bots fill it in. Pretend it worked so they don't adapt.
  if (form.website) return json({ ok: true });

  const name = clean(form.name, LIMITS.name);  // optional: blank shows as "Anonymous"
  const message = clean(form.message, LIMITS.message, true);
  let homepage = clean(form.homepage, LIMITS.homepage);
  if (!message) return json({ error: "Your message is empty!" }, 400);
  if (homepage) {
    homepage = cleanUrl(homepage);
    if (!homepage) return json({ error: "That homepage address doesn't look right." }, 400);
  }

  const check = await checkChallenge(env, form.token, form.answer);
  if (check) return json({ error: check }, 400);

  const visitor = await visitorHash(request, env);
  const now = Date.now();
  await env.DB.prepare("DELETE FROM actions WHERE created < ?").bind(now - 2 * DAY).run();  // forget old ones
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM actions WHERE kind = 'post' AND visitor = ? AND created > ?"
  ).bind(visitor, now - DAY).first();
  if (recent.n >= POSTS_PER_DAY) {
    return json({ error: "Whoa, slow down! You've signed a lot today. Come back tomorrow :)" }, 429);
  }

  // The token's nonce is saved with the post, so one solved question can't be used twice.
  const nonce = form.token.split(".")[1];
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO actions (kind, visitor, created, nonce) VALUES ('post', ?, ?, ?)")
        .bind(visitor, now, nonce),
      env.DB.prepare("INSERT INTO entries (name, message, homepage, created) VALUES (?, ?, ?, ?)")
        .bind(name, message, homepage || null, new Date(now).toISOString()),  // a blank name shows as "Anonymous"
    ]);
  } catch (error) {
    if (String(error).includes("UNIQUE")) return json({ error: "That robot check was already used. Try the new one!" }, 400);
    throw error;
  }
  return json({ ok: true });
}

// Trims, removes control characters (keeping line breaks in messages) and the characters that flip text direction
// (which can disguise text), and cuts to a maximum length.
function clean(value, max, multiline = false) {
  if (typeof value !== "string") return "";
  let text = value.replace(/\r\n?/g, "\n").replace(/[‪-‮⁦-⁩]/g, "");
  text = multiline
    ? text.replace(/[^\P{Cc}\n]/gu, "").replace(/\n{3,}/g, "\n\n")
    : text.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ");
  return text.trim().slice(0, max);
}

// Homepages must be ordinary web addresses. "mysite.com" becomes "https://mysite.com".
function cleanUrl(value) {
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : "https://" + value;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.href;
  } catch {
    return null;
  }
}

// ---------- The math question ----------

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

// A question like "What is seven plus 3?". The answer isn't sent; the token is signed with the answer mixed in, so
// checking an answer means signing it again and comparing. The token also records when it was made.
async function makeChallenge(env) {
  const a = 1 + Math.floor(Math.random() * 10), b = 1 + Math.floor(Math.random() * 9);
  const plus = Math.random() < 0.6 || a <= b;
  const answer = plus ? a + b : a - b;
  const show = (n) => (Math.random() < 0.5 ? WORDS[n] : String(n));
  const question = "What is " + show(a) + (plus ? " plus " : " minus ") + show(b) + "?";
  const issued = Date.now();
  const nonce = randomId();
  const signature = await sign(env, "challenge." + issued + "." + nonce + "." + answer);
  return { question, token: issued + "." + nonce + "." + signature };
}

// Returns an error message, or null if the answer is right.
async function checkChallenge(env, token, answer) {
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3) return "Please answer the robot check.";
  const [issued, nonce, signature] = parts;
  const age = Date.now() - Number(issued);
  if (!(age >= 0) || age > CHALLENGE_HOURS * 60 * 60 * 1000) return "That robot check expired. Try the new one!";
  if (age < MIN_FILL_SECONDS * 1000) return "Whoa, that was fast! Take a second and try again.";
  const guess = parseInt(String(answer).trim(), 10);
  if (Number.isNaN(guess)) return "Please answer the robot check with a number.";
  const expected = await sign(env, "challenge." + issued + "." + nonce + "." + guess);
  if (!safeEqual(expected, signature)) return "Oops, wrong answer to the math question! Try the new one.";
  return null;
}

// ---------- Admin ----------

async function adminLogin(request, env) {
  const visitor = await visitorHash(request, env);
  const now = Date.now();
  const tries = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM actions WHERE kind = 'login' AND visitor = ? AND created > ?"
  ).bind(visitor, now - 60 * 60 * 1000).first();
  if (tries.n >= LOGIN_TRIES_PER_HOUR) return json({ error: "Too many tries. Wait an hour." }, 429);

  const form = await readJson(request);
  const password = form && typeof form.password === "string" ? form.password : "";
  // Compare hashes, so the comparison takes the same time whatever was typed.
  if (!env.ADMIN_PASSWORD || !safeEqual(await sign(env, "pw." + password), await sign(env, "pw." + env.ADMIN_PASSWORD))) {
    await env.DB.prepare("INSERT INTO actions (kind, visitor, created) VALUES ('login', ?, ?)").bind(visitor, now).run();
    return json({ error: "Wrong password." }, 401);
  }
  const expires = now + ADMIN_HOURS * 60 * 60 * 1000;
  return json({ token: expires + "." + (await sign(env, "admin." + expires)) });
}

async function isAdmin(request, env) {
  const header = request.headers.get("Authorization") || "";
  const [expires, signature] = header.replace(/^Bearer /, "").split(".");
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  return safeEqual(await sign(env, "admin." + expires), signature);
}

async function replyToEntry(request, env, id) {
  if (!(await isAdmin(request, env))) return json({ error: "Please log in again." }, 401);
  const form = await readJson(request);
  const reply = clean(form && form.reply, LIMITS.reply, true);
  await env.DB.prepare("UPDATE entries SET reply = ?, replied = ? WHERE id = ?")
    .bind(reply || null, reply ? new Date().toISOString() : null, id).run();
  return json({ ok: true });
}

async function deleteEntry(request, env, id) {
  if (!(await isAdmin(request, env))) return json({ error: "Please log in again." }, 401);
  await env.DB.prepare("DELETE FROM entries WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

// ---------- Helpers ----------

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function readJson(request) {
  try {
    const data = await request.json();
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

// A scrambled stand-in for the visitor's IP address, so the database never holds real addresses. For IPv6, only the
// first half counts: one home connection gets a whole block of addresses that share it.
async function visitorHash(request, env) {
  let ip = request.headers.get("CF-Connecting-IP") || "unknown";
  if (ip.includes(":")) ip = ipv6Prefix(ip);
  return sign(env, "ip." + ip);
}

function ipv6Prefix(ip) {
  const [head, tail = ""] = ip.split("::");
  const left = head ? head.split(":") : [], right = tail ? tail.split(":") : [];
  const groups = left.concat(Array(Math.max(0, 8 - left.length - right.length)).fill("0"), right);
  return groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

async function sign(env, text) {
  if (!env.SECRET) throw new Error("The SECRET setting is missing (see README.md).");
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(env.SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Compares two strings without stopping at the first difference (so timing doesn't leak how close a guess was).
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function randomId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
}
