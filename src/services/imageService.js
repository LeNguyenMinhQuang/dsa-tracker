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
  USERS_KEY,
  userKey,
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

const IMAGES_SETTINGS_KEY = "dsa-tracker:images:settings"; // hash: provider
const CHUNK = 500;
const BETWEEN_MS = 2000; // pause between two generations (rate limit friendly)
const FAIL_DELAY_MS = 15000;

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
  const meaning = String(hint || "")
    .trim()
    .slice(0, 150);
  if (!meaning) {
    // No Vietnamese meaning available: same prompt without the meaning lines
    return (
      `Create a clear educational illustration for the English vocabulary word "${term}".\n\n` +
      `Use a concrete, realistic, immediately understandable scene. If it is an action, clearly show the action taking place. ` +
      `If it is an object, clearly show the object. If it is an emotion, condition, or abstract concept, show a natural real-world situation that strongly communicates it. ` +
      `Do NOT rely on written words, labels, captions, signs, letters, numbers, or symbols. ` +
      `No metaphors, puns, visual wordplay, or abstract symbolism. ` +
      `Simple composition: one main subject, one clear situation, minimal background. ` +
      `Natural human anatomy and realistic object proportions. Friendly, polished, modern educational illustration style. ` +
      `No text anywhere in the image. Square 1:1 composition, important subject centered and prominent. ` +
      `The image is for an English vocabulary flashcard.`
    );
  }
  return (
    `Create a clear educational illustration for the English vocabulary word "${term}", meaning "${meaning}".\n\n` +
    `The image must visually communicate exactly this meaning: "${meaning}".\n\n` +
    `Important requirements:\n` +
    `* Represent the specific meaning given above, NOT another meaning of the English word.\n` +
    `* Use a concrete, realistic, immediately understandable scene.\n` +
    `* If it is an action, clearly show the action taking place.\n` +
    `* If it is an object, clearly show the object.\n` +
    `* If it is an emotion, condition, or abstract concept, show a natural real-world situation that strongly communicates it.\n` +
    `* Use visual context when necessary to distinguish this meaning from other meanings.\n` +
    `* Do NOT rely on written words, labels, captions, signs, letters, numbers, or symbols.\n` +
    `* Do NOT create metaphors, puns, visual wordplay, or abstract symbolism.\n` +
    `* Keep the composition simple: one main subject, one clear situation, minimal background.\n` +
    `* Make the intended meaning recognizable within a few seconds.\n` +
    `* Natural human anatomy and realistic object proportions.\n` +
    `* Friendly, polished, modern educational illustration style.\n` +
    `* Visually memorable but not overly artistic or decorative.\n` +
    `* No text anywhere in the image.\n` +
    `* Square 1:1 composition.\n` +
    `* Center the important subject and make it visually prominent.\n` +
    `* The image is for an English vocabulary flashcard.\n\n` +
    `The most important goal is semantic accuracy: the image must make the learner think of "${meaning}", not another meaning of "${term}".`
  );
}

// The hint is the Vietnamese meaning of the word (first definition)
function meaningHint(word) {
  const m = ((word && word.meanings) || []).find((x) => x && x.definition);
  return m ? String(m.definition).trim() : "";
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
  const stats = {
    total: terms.length,
    alreadyHave: 0,
    failedSkipped: 0,
    queued: 0,
  };
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
    if (Object.keys(hintObj).length > 0)
      await redis.hset(IMAGES_HINTS_KEY, hintObj);

    if (opts.force) await redis.hdel(IMAGES_FAILS_KEY, ...chunk);
  }
  return stats;
}

async function pendingCount() {
  return Number((await redis.scard(IMAGES_PENDING_KEY)) || 0);
}

// Every word of every user profile: [{ term, hint }]
async function collectAllWordItems() {
  const users = (await redis.get(USERS_KEY)) || [];
  const items = [];
  const perUser = [];
  for (const u of users) {
    const data = await redis.get(userKey(u.id));
    const words = Object.values((data && data.words) || {});
    for (const w of words) {
      items.push({ term: w.term, hint: meaningHint(w) });
    }
    perUser.push({ name: u.name, words: words.length });
  }
  return { items, perUser };
}

// Queue every word (of every user) that has no image yet.
// Shared by scripts/backfillImages.js and the admin settings panel.
async function backfillAll({ force = false, dryRun = false } = {}) {
  const { items, perUser } = await collectAllWordItems();
  const stats = await enqueueTerms(items, { force, dryRun });
  return { ...stats, users: perUser };
}

/* ------------------------------ deletion ----------------------------- */

async function destroyCloudinary(term) {
  if (!cloudinary.config().cloud_name) return;
  try {
    await cloudinary.uploader.destroy(publicIdFor(term), { invalidate: true });
  } catch (e) {
    console.warn(
      `[images] cloudinary destroy failed for "${term}": ${e.message}`,
    );
  }
}

// Remove the image of ONE word (Redis + Cloudinary). The word is not re-queued
// automatically; use "Generate missing images" to create a new one.
async function deleteImage(term) {
  const t = normalizeTerm(term);
  if (!t) {
    const err = new Error("Term is required");
    err.status = 400;
    throw err;
  }
  const existed = await redis.hget(IMAGES_KEY, t);
  await destroyCloudinary(t);
  await redis.hdel(IMAGES_KEY, t);
  await redis.hdel(IMAGES_HINTS_KEY, t);
  await redis.hdel(IMAGES_FAILS_KEY, t);
  await redis.srem(IMAGES_PENDING_KEY, `w:${t}`);
  return { term: t, deleted: !!existed };
}

// Remove EVERY illustration and clear the generation queue.
// A running worker is stopped first (and awaited) so it cannot write an image
// or re-queue a word after the wipe.
async function deleteAllImages() {
  if (worker.running) {
    worker.stopRequested = true;
    const t0 = Date.now();
    while (worker.running && Date.now() - t0 < 90000) await sleep(300);
  }

  const images = Number((await redis.hlen(IMAGES_KEY)) || 0);
  const queued = Number((await redis.scard(IMAGES_PENDING_KEY)) || 0);

  if (cloudinary.config().cloud_name) {
    try {
      for (let i = 0; i < 50; i++) {
        const r = await cloudinary.api.delete_resources_by_prefix("vocab/", {
          invalidate: true,
        });
        if (!r || !r.partial) break; // partial = more than 1000 left, repeat
      }
    } catch (e) {
      console.warn("[images] cloudinary bulk delete failed:", e.message);
    }
  }
  await redis.del(IMAGES_KEY);
  await redis.del(IMAGES_PENDING_KEY);
  await redis.del(IMAGES_HINTS_KEY);
  await redis.del(IMAGES_FAILS_KEY);

  worker.lastRun = null;
  worker.lastBlocked = null;
  const left = Number((await redis.scard(IMAGES_PENDING_KEY)) || 0);
  console.log(
    `[images] deleted all: ${images} image(s), ${queued} queued word(s) cleared`,
  );
  return { deleted: images, queueCleared: queued, queueLeft: left };
}

/* --------------------------- AI generation --------------------------- */

async function generateWithCloudflare(prompt) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) {
    const err = new Error(
      "CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN are missing",
    );
    err.rateLimited = true; // "blocked": keep the term queued, do not count a failure
    throw err;
  }
  const model =
    process.env.CLOUDFLARE_IMAGE_MODEL ||
    "@cf/black-forest-labs/flux-1-schnell";
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
    const err = new Error(
      `Cloudflare HTTP ${res.status} ${text.slice(0, 200)}`,
    );
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
  if (!type.startsWith("image/"))
    throw new Error("Pollinations returned non-image");
  return Buffer.from(await res.arrayBuffer());
}

async function generateWithHuggingFace(prompt) {
  const token = process.env.HF_TOKEN;
  if (!token) {
    const err = new Error("HF_TOKEN is missing");
    err.rateLimited = true;
    throw err;
  }
  const model =
    process.env.HF_IMAGE_MODEL || "black-forest-labs/FLUX.1-schnell";
  const url =
    process.env.HF_IMAGE_URL ||
    `https://router.huggingface.co/hf-inference/models/${model}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify({ inputs: prompt }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(
      `HuggingFace HTTP ${res.status} ${text.slice(0, 200)}`,
    );
    err.rateLimited =
      [401, 402, 403, 429].includes(res.status) ||
      /credit|quota|rate/i.test(text);
    throw err;
  }
  const type = res.headers.get("content-type") || "";
  if (!type.startsWith("image/"))
    throw new Error("HuggingFace returned non-image");
  return Buffer.from(await res.arrayBuffer());
}

async function generateWithOpenAI(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    const err = new Error("OPENAI_API_KEY is missing");
    err.rateLimited = true;
    throw err;
  }
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt,
      size: "1024x1024",
      quality: process.env.OPENAI_IMAGE_QUALITY || "low",
      n: 1,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`OpenAI HTTP ${res.status} ${text.slice(0, 200)}`);
    err.rateLimited =
      [401, 402, 403, 429].includes(res.status) ||
      /quota|billing|insufficient/i.test(text);
    throw err;
  }
  const json = await res.json();
  const b64 = json && json.data && json.data[0] && json.data[0].b64_json;
  if (!b64) throw new Error("OpenAI returned no image");
  return Buffer.from(b64, "base64");
}

// id -> { fn, label, configured() }
const PROVIDERS = {
  cloudflare: {
    fn: generateWithCloudflare,
    label: "Cloudflare Workers AI (Flux)",
    needs: "CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN",
    configured: () =>
      !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN),
  },
  pollinations: {
    fn: generateWithPollinations,
    label: "Pollinations (free, no key)",
    needs: "",
    configured: () => true,
  },
  huggingface: {
    fn: generateWithHuggingFace,
    label: "Hugging Face (Flux)",
    needs: "HF_TOKEN",
    configured: () => !!process.env.HF_TOKEN,
  },
  openai: {
    fn: generateWithOpenAI,
    label: "OpenAI (gpt-image-1, paid)",
    needs: "OPENAI_API_KEY",
    configured: () => !!process.env.OPENAI_API_KEY,
  },
};

// Admin choice stored in Redis: "auto" or one provider id
async function getProviderSetting() {
  try {
    const v = await redis.hget(IMAGES_SETTINGS_KEY, "provider");
    return v && PROVIDERS[v] ? String(v) : "auto";
  } catch (e) {
    return "auto";
  }
}

async function setProviderSetting(id) {
  const v = String(id || "auto");
  if (v !== "auto" && !PROVIDERS[v]) {
    const err = new Error("Unknown image provider");
    err.status = 400;
    throw err;
  }
  await redis.hset(IMAGES_SETTINGS_KEY, { provider: v });
  return v;
}

function providerOptions() {
  return [
    {
      id: "auto",
      label: "Auto (env order, with fallback)",
      configured: true,
      needs: "",
    },
    ...Object.entries(PROVIDERS).map(([id, p]) => ({
      id,
      label: p.label,
      configured: p.configured(),
      needs: p.needs,
    })),
  ];
}

// A specific provider chosen by the admin is used alone (no silent fallback).
// "auto" tries env IMAGE_PROVIDERS (default "cloudflare,pollinations") in order.
async function generateImageBuffer(prompt) {
  const setting = await getProviderSetting();
  const order =
    setting !== "auto"
      ? [setting]
      : (process.env.IMAGE_PROVIDERS || "cloudflare,pollinations")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

  let lastErr = null;
  let anyRateLimited = false;
  for (const name of order) {
    const p = PROVIDERS[name];
    if (!p) continue;
    try {
      return await p.fn(prompt);
    } catch (e) {
      lastErr = e;
      if (e.rateLimited) anyRateLimited = true;
      console.warn(`[images] provider "${name}" failed: ${e.message}`);
    }
  }
  const err = new Error(
    lastErr ? lastErr.message : "No image provider configured",
  );
  // If any provider is blocked (quota / credentials), the term is not at fault
  err.rateLimited = anyRateLimited;
  throw err;
}

/* ------------------------------ Cloudinary --------------------------- */

function uploadBuffer(buffer, publicId) {
  if (!cloudinary.config().cloud_name) {
    const err = new Error(
      "Cloudinary is not configured (check Cloudinary env variables)",
    );
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
        if (!result || !result.secure_url)
          return reject(new Error("Cloudinary returned no URL"));
        resolve(result);
      },
    );
    stream.end(buffer);
  });
}

/* ------------------- per-word generate / upload (admin) -------------------- */

async function storeImage(term, buffer) {
  const result = await uploadBuffer(buffer, publicIdFor(term));
  await redis.hset(IMAGES_KEY, { [term]: result.secure_url });
  await redis.hdel(IMAGES_HINTS_KEY, term);
  await redis.hdel(IMAGES_FAILS_KEY, term);
  await redis.srem(IMAGES_PENDING_KEY, `w:${term}`);
  return result.secure_url;
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// Generate (or regenerate) the image of ONE word right now, replacing any
// existing one. hint = Vietnamese meaning shown in the edit dialog.
async function generateForTerm(term, hint) {
  const t = normalizeTerm(term);
  if (!t) throw httpError(400, "Term is required");
  const lock = imageLockKey(t);
  const locked = await redis.set(lock, "1", { nx: true, ex: 180 });
  if (!locked)
    throw httpError(
      409,
      "This word is already being generated, try again in a moment",
    );
  try {
    let buffer;
    try {
      buffer = await generateImageBuffer(buildPrompt(t, hint, 0));
    } catch (e) {
      throw httpError(502, "Image generation failed: " + e.message);
    }
    let url;
    try {
      url = await storeImage(t, buffer);
    } catch (e) {
      throw httpError(502, "Upload failed: " + e.message);
    }
    return { term: t, url };
  } finally {
    await redis.del(lock).catch(() => {});
  }
}

// Store an image chosen by the admin (data URL, already resized by the browser)
async function uploadForTerm(term, dataUrl) {
  const t = normalizeTerm(term);
  if (!t) throw httpError(400, "Term is required");
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(
    String(dataUrl || ""),
  );
  if (!m)
    throw httpError(400, "Invalid image (png, jpg, webp or gif expected)");
  const buffer = Buffer.from(m[2], "base64");
  if (buffer.length > 3 * 1024 * 1024)
    throw httpError(413, "Image is too large (max 3 MB)");
  try {
    return { term: t, url: await storeImage(t, buffer) };
  } catch (e) {
    throw httpError(502, "Upload failed: " + e.message);
  }
}

/* ------------------------------- worker ------------------------------ */

// Returns "idle" | "done" | "skipped" | "failed" | "ratelimited"
async function processOne() {
  const member = await redis.spop(IMAGES_PENDING_KEY);
  if (!member) return "idle";
  const term = String(member).replace(/^w:/, "");
  if (!term) return "skipped";
  worker.currentTerm = term;

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
      worker.lastBlocked = { message: e.message, at: Date.now() };
      return "ratelimited";
    }
    const attempts = await redis.hincrby(IMAGES_FAILS_KEY, term, 1);
    console.error(
      `[images] ✗ ${term} (attempt ${attempts}/${IMAGE_MAX_ATTEMPTS}): ${e.message}`,
    );
    if (attempts < IMAGE_MAX_ATTEMPTS)
      await redis.sadd(IMAGES_PENDING_KEY, `w:${term}`);
    return "failed";
  } finally {
    await redis.del(lock).catch(() => {});
    worker.currentTerm = null;
  }
}

// Process the queue until it is empty, rate limited, or `limit` is reached.
// Used by the backfill script and usable from a cron / serverless function.
async function processPending({
  limit = Infinity,
  delayMs = BETWEEN_MS,
  onResult,
} = {}) {
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

/*
 * Manual worker: NOTHING runs on its own. An admin presses "Generate missing
 * images" (Settings > Admin) and the queue is processed until it is empty or
 * the provider quota is used up. Then the worker stops again.
 */
const worker = {
  running: false,
  stopRequested: false,
  currentTerm: null,
  run: null, // { startedAt, done, failed, skipped }
  lastRun: null, // summary of the previous run
  lastBlocked: null,
};

async function runQueue() {
  const run = { startedAt: Date.now(), done: 0, failed: 0, skipped: 0 };
  worker.run = run;
  worker.lastBlocked = null;
  let stopped = "idle";
  try {
    while (true) {
      if (worker.stopRequested) {
        stopped = "cancelled";
        break;
      }
      const r = await processOne();
      if (r === "idle") break;
      if (r === "ratelimited") {
        stopped = "ratelimited";
        break;
      }
      run[r]++;
      if (r === "failed") await sleep(FAIL_DELAY_MS);
      else if (r !== "skipped") await sleep(BETWEEN_MS);
    }
  } catch (e) {
    console.error("[images] run error:", e.message);
    stopped = "error";
    worker.lastBlocked = { message: e.message, at: Date.now() };
  } finally {
    worker.lastRun = { ...run, stopped, endedAt: Date.now() };
    worker.run = null;
    worker.running = false;
    worker.stopRequested = false;
  }
}

// Start processing the queue (no-op when already running). Returns true if a
// new run was started.
function start() {
  if (worker.running) return false;
  worker.running = true;
  worker.stopRequested = false;
  runQueue();
  return true;
}

function stop() {
  if (worker.running) worker.stopRequested = true;
  return worker.running;
}

// Kept for compatibility with the old background worker: does nothing now
function startWorker() {}
function wake() {}
function resume() {
  return start();
}

async function getStatus() {
  const [pending, images] = await Promise.all([
    pendingCount(),
    redis.hlen(IMAGES_KEY),
  ]);
  return {
    pending,
    images: Number(images || 0),
    running: worker.running,
    stopping: worker.stopRequested,
    provider: await getProviderSetting(),
    providers: providerOptions(),
    currentTerm: worker.currentTerm,
    run: worker.run,
    lastRun: worker.lastRun,
    lastBlocked: worker.lastBlocked,
  };
}

module.exports = {
  normalizeTerm,
  getImageUrls,
  meaningHint,
  deleteImage,
  deleteAllImages,
  generateForTerm,
  uploadForTerm,
  setProviderSetting,
  enqueueTerms,
  pendingCount,
  collectAllWordItems,
  backfillAll,
  getStatus,
  start,
  stop,
  resume,
  processOne,
  processPending,
  startWorker,
  wake,
};
