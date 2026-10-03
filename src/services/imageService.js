const crypto = require("crypto");
const redis = require("../config/redis");
const cloudinary = require("../config/cloudinary");
const {
  IMAGES_KEY,
  IMAGES_PENDING_KEY,
  IMAGES_HINTS_KEY,
  IMAGES_FAILS_KEY,
  IMAGE_MAX_ATTEMPTS,
  imageLockKey,
} = require("../config/constants");

/*
 * Shared illustration images.
 *
 *  - One image per normalized term, shared by every user.
 *  - Redis hash IMAGES_KEY:           term -> Cloudinary URL
 *  - Redis set  IMAGES_PENDING_KEY:   "w:<term>" waiting to be generated
 *  - Redis hash IMAGES_HINTS_KEY:     term -> English hint used in the prompt
 *  - Redis hash IMAGES_FAILS_KEY:     term -> number of failed attempts
 */

const CHUNK = 500;
const BETWEEN_MS = 2000; // pause between two generations (rate limit friendly)
const IDLE_POLL_MS = 120000; // how often the idle worker checks the queue
const FAIL_DELAY_MS = 15000;
const RATE_LIMIT_DELAY_MS = 10 * 60 * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ helpers ------------------------------ */

function normalizeTerm(term) {
  return String(term || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function publicIdFor(term) {
  const slug = term.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const hash = crypto.createHash("sha1").update(term).digest("hex").slice(0, 6);
  return `vocab/${slug || "word"}_${hash}`;
}

// attempt = number of previous failures. The provider's safety filter sometimes
// blocks harmless words (false positives), so each retry uses a safer prompt.
function buildPrompt(term, hint, attempt = 0) {
  if (attempt >= 2) {
    return (
      `A cute, simple, child-friendly cartoon icon illustrating the everyday concept "${term}". ` +
      `Safe for all ages, white background, no text, no letters.`
    );
  }
  if (attempt === 1) {
    return (
      `A family-friendly children's picture-book illustration of the word "${term}". ` +
      `Safe for all ages, clean white background, one central subject, no text, no letters.`
    );
  }
  const meaning = hint ? ` Meaning: ${String(hint).slice(0, 150)}.` : "";
  return (
    `A simple, clear, family-friendly flat vector illustration that represents the word "${term}".` +
    `${meaning} Clean white background, bold shapes, friendly colors, ` +
    `one central subject, no text, no letters, no watermark.`
  );
}

async function hmgetChunked(key, fields) {
  const out = {};
  for (let i = 0; i < fields.length; i += CHUNK) {
    const chunk = fields.slice(i, i + CHUNK);
    const res = await redis.hmget(key, ...chunk);
    if (!res) continue;
    for (const f of chunk) {
      if (res[f] !== null && res[f] !== undefined) out[f] = res[f];
    }
  }
  return out;
}

/* --------------------------- cache lookups --------------------------- */

// Returns { <normalizedTerm>: url }. Never throws: a Redis hiccup must not
// break the vocabulary list.
async function getImageUrls(terms) {
  const fields = [...new Set(terms.map(normalizeTerm).filter(Boolean))];
  if (fields.length === 0) return {};
  try {
    const raw = await hmgetChunked(IMAGES_KEY, fields);
    const out = {};
    for (const f of Object.keys(raw)) out[f] = String(raw[f]);
    return out;
  } catch (e) {
    console.error("[images] getImageUrls failed:", e.message);
    return {};
  }
}

/* ------------------------------ queueing ----------------------------- */

/**
 * Queue terms that have no image yet.
 * items: [{ term, hint? }]
 * opts:  { force?: boolean (ignore failure counter & reset it), dryRun?: boolean }
 */
async function enqueueTerms(items, opts = {}) {
  const hints = new Map();
  for (const it of items) {
    const term = normalizeTerm(it && it.term);
    if (!term) continue;
    const hint = String((it && it.hint) || "").trim();
    if (!hints.has(term) || (!hints.get(term) && hint)) hints.set(term, hint);
  }

  const terms = [...hints.keys()];
  const stats = { total: terms.length, alreadyHave: 0, failedSkipped: 0, queued: 0 };
  if (terms.length === 0) return stats;

  const have = await hmgetChunked(IMAGES_KEY, terms);
  const fails = await hmgetChunked(IMAGES_FAILS_KEY, terms);

  const toQueue = [];
  for (const t of terms) {
    if (have[t]) {
      stats.alreadyHave++;
    } else if (!opts.force && Number(fails[t] || 0) >= IMAGE_MAX_ATTEMPTS) {
      stats.failedSkipped++;
    } else {
      toQueue.push(t);
    }
  }
  stats.queued = toQueue.length;
  if (opts.dryRun || toQueue.length === 0) return stats;

  for (let i = 0; i < toQueue.length; i += CHUNK) {
    const chunk = toQueue.slice(i, i + CHUNK);
    await redis.sadd(IMAGES_PENDING_KEY, ...chunk.map((t) => `w:${t}`));

    const hintObj = {};
    for (const t of chunk) if (hints.get(t)) hintObj[t] = hints.get(t);
    if (Object.keys(hintObj).length > 0) await redis.hset(IMAGES_HINTS_KEY, hintObj);

    if (opts.force) await redis.hdel(IMAGES_FAILS_KEY, ...chunk);
  }
  return stats;
}

async function pendingCount() {
  return Number((await redis.scard(IMAGES_PENDING_KEY)) || 0);
}

/* --------------------------- AI generation --------------------------- */

async function generateWithCloudflare(prompt) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) {
    const err = new Error("CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN are missing");
    err.rateLimited = true; // "blocked": keep the term queued, do not count a failure
    throw err;
  }
  const model = process.env.CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell";
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, steps: 4 }),
      signal: AbortSignal.timeout(60000),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Cloudflare HTTP ${res.status} ${text.slice(0, 200)}`);
    // "Blocked" = quota used up (429 / daily allocation) or bad credentials
    // (401/403). None of these are the word's fault, so the term stays queued.
    err.rateLimited =
      res.status === 429 ||
      res.status === 401 ||
      res.status === 403 ||
      /4006|daily|allocation/i.test(text);
    throw err;
  }
  const json = await res.json();
  const b64 = json && json.result && json.result.image;
  if (!b64) throw new Error("Cloudflare returned no image");
  return Buffer.from(b64, "base64");
}

async function generateWithPollinations(prompt) {
  const url =
    `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=512&height=512&nologo=true&model=flux&seed=${Math.floor(Math.random() * 1e6)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(90000) });
  if (!res.ok) {
    const err = new Error(`Pollinations HTTP ${res.status}`);
    err.rateLimited = res.status === 429 || res.status === 402; // 402 = payment required
    throw err;
  }
  const type = res.headers.get("content-type") || "";
  if (!type.startsWith("image/")) throw new Error("Pollinations returned non-image");
  return Buffer.from(await res.arrayBuffer());
}

const PROVIDERS = {
  cloudflare: generateWithCloudflare,
  pollinations: generateWithPollinations,
};

// Tries providers in order (env IMAGE_PROVIDERS, default "cloudflare,pollinations")
async function generateImageBuffer(prompt) {
  const order = (process.env.IMAGE_PROVIDERS || "cloudflare,pollinations")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let lastErr = null;
  let anyRateLimited = false;
  for (const name of order) {
    const fn = PROVIDERS[name];
    if (!fn) continue;
    try {
      return await fn(prompt);
    } catch (e) {
      lastErr = e;
      if (e.rateLimited) anyRateLimited = true;
      console.warn(`[images] provider "${name}" failed: ${e.message}`);
    }
  }
  const err = new Error(lastErr ? lastErr.message : "No image provider configured");
  // If any provider is blocked (quota / credentials), the term is not at fault
  err.rateLimited = anyRateLimited;
  throw err;
}

/* ------------------------------ Cloudinary --------------------------- */

function uploadBuffer(buffer, publicId) {
  if (!cloudinary.config().cloud_name) {
    const err = new Error("Cloudinary is not configured (check Cloudinary env variables)");
    err.rateLimited = true; // config problem: keep the term queued
    return Promise.reject(err);
  }
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        overwrite: true,
        resource_type: "image",
        format: "webp",
        // incoming transformation: stored already small, so no transformation
        // credits are consumed when the image is displayed
        transformation: [
          { width: 512, height: 512, crop: "limit" },
          { quality: "auto" },
        ],
      },
      (err, result) => {
        if (err) return reject(err);
        if (!result || !result.secure_url) return reject(new Error("Cloudinary returned no URL"));
        resolve(result);
      },
    );
    stream.end(buffer);
  });
}

/* ------------------------------- worker ------------------------------ */

// Returns "idle" | "done" | "skipped" | "failed" | "ratelimited"
async function processOne() {
  const member = await redis.spop(IMAGES_PENDING_KEY);
  if (!member) return "idle";
  const term = String(member).replace(/^w:/, "");
  if (!term) return "skipped";

  // Another user (or an earlier run) may already have produced it
  if (await redis.hget(IMAGES_KEY, term)) {
    await redis.hdel(IMAGES_HINTS_KEY, term);
    return "skipped";
  }

  // Avoid two workers generating the same term at once
  const lock = imageLockKey(term);
  const locked = await redis.set(lock, "1", { nx: true, ex: 180 });
  if (!locked) return "skipped";

  try {
    const hint = await redis.hget(IMAGES_HINTS_KEY, term);
    const attempt = Number((await redis.hget(IMAGES_FAILS_KEY, term)) || 0);
    const buffer = await generateImageBuffer(buildPrompt(term, hint, attempt));
    const result = await uploadBuffer(buffer, publicIdFor(term));
    await redis.hset(IMAGES_KEY, { [term]: result.secure_url });
    await redis.hdel(IMAGES_HINTS_KEY, term);
    await redis.hdel(IMAGES_FAILS_KEY, term);
    console.log(`[images] ✓ ${term}`);
    return "done";
  } catch (e) {
    if (e.rateLimited) {
      // Quota exhausted / bad credentials / missing config: keep the term
      // queued and do not count it as a failure
      await redis.sadd(IMAGES_PENDING_KEY, `w:${term}`);
      console.warn(`[images] blocked while generating "${term}": ${e.message}`);
      return "ratelimited";
    }
    const attempts = await redis.hincrby(IMAGES_FAILS_KEY, term, 1);
    console.error(`[images] ✗ ${term} (attempt ${attempts}/${IMAGE_MAX_ATTEMPTS}): ${e.message}`);
    if (attempts < IMAGE_MAX_ATTEMPTS) await redis.sadd(IMAGES_PENDING_KEY, `w:${term}`);
    return "failed";
  } finally {
    await redis.del(lock).catch(() => {});
  }
}

// Process the queue until it is empty, rate limited, or `limit` is reached.
// Used by the backfill script and usable from a cron / serverless function.
async function processPending({ limit = Infinity, delayMs = BETWEEN_MS, onResult } = {}) {
  const stats = { done: 0, failed: 0, skipped: 0, stopped: "idle" };
  let n = 0;
  while (true) {
    if (n >= limit) {
      stats.stopped = "limit";
      break;
    }
    n++;
    const r = await processOne();
    if (r === "idle") break;
    if (r === "ratelimited") {
      stats.stopped = "ratelimited";
      break;
    }
    stats[r]++;
    if (onResult) onResult(r, stats);
    if (r !== "skipped") await sleep(delayMs);
  }
  return stats;
}

const worker = { started: false, busy: false, timer: null, pausedUntil: 0 };

function schedule(ms) {
  clearTimeout(worker.timer);
  worker.timer = setTimeout(tick, ms);
}

async function tick() {
  if (worker.busy) return;
  worker.busy = true;
  let delay = IDLE_POLL_MS;
  try {
    const r = await processOne();
    if (r === "idle") delay = IDLE_POLL_MS;
    else if (r === "failed") delay = FAIL_DELAY_MS;
    else if (r === "ratelimited") {
      delay = RATE_LIMIT_DELAY_MS;
      worker.pausedUntil = Date.now() + RATE_LIMIT_DELAY_MS;
    } else if (r === "skipped") delay = 0;
    else delay = BETWEEN_MS;
  } catch (e) {
    console.error("[images] worker error:", e.message);
    delay = FAIL_DELAY_MS;
  } finally {
    worker.busy = false;
  }
  schedule(delay);
}

function startWorker() {
  if (worker.started) return;
  worker.started = true;
  schedule(3000);
}

// Called right after new terms were queued so the worker reacts immediately
function wake() {
  if (!worker.started || worker.busy) return;
  if (Date.now() < worker.pausedUntil) return;
  schedule(500);
}

module.exports = {
  normalizeTerm,
  getImageUrls,
  enqueueTerms,
  pendingCount,
  processOne,
  processPending,
  startWorker,
  wake,
};
