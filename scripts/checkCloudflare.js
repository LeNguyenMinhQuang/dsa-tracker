/*
 * Diagnose Cloudflare Workers AI credentials.
 * Usage (from the project root):  node scripts/checkCloudflare.js
 * Secrets are never printed in full.
 */
require("dotenv").config({ quiet: true });

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
const model = process.env.CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell";
const BASE = "https://api.cloudflare.com/client/v4";

const mask = (s) => (s ? `${s.slice(0, 4)}…${s.slice(-4)} (length ${s.length})` : "(missing)");

async function call(method, url, body) {
  try {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60000),
    });
    let json = null;
    try {
      json = await res.json();
    } catch (_) {}
    return { status: res.status, json };
  } catch (e) {
    return { status: 0, json: { errors: [{ message: e.message }] } };
  }
}

const errText = (r) =>
  r.json && r.json.errors && r.json.errors.length
    ? r.json.errors.map((e) => `${e.code || ""} ${e.message}`.trim()).join("; ")
    : "no details";

(async () => {
  console.log("1) Values read from .env");
  console.log("   CLOUDFLARE_ACCOUNT_ID :", mask(accountId));
  console.log("   CLOUDFLARE_API_TOKEN  :", mask(token));

  if (!accountId || !token) {
    console.log("\n✗ One of the variables is missing in .env.");
    return;
  }

  let hints = [];
  if (!/^[0-9a-f]{32}$/i.test(accountId)) {
    hints.push(
      "Account ID should be exactly 32 hex characters (0-9, a-f). Yours is not: it contains spaces/quotes/other characters or it is a different kind of ID.",
    );
  }
  if (/\s|["']/.test(accountId) || /\s|["']/.test(token)) {
    hints.push("A value contains whitespace or quote characters. Remove them in .env.");
  }
  if (token.length < 35) {
    hints.push("Token looks too short for a Cloudflare API token (usually ~40 characters).");
  }

  console.log("\n2) Is the token itself valid?");
  const userVerify = await call("GET", `${BASE}/user/tokens/verify`);
  const userOk = userVerify.json && userVerify.json.success;
  console.log("   user token verify    :", userOk ? "✓ active" : `✗ ${userVerify.status} ${errText(userVerify)}`);

  const accVerify = await call("GET", `${BASE}/accounts/${accountId}/tokens/verify`);
  const accOk = accVerify.json && accVerify.json.success;
  console.log("   account token verify :", accOk ? "✓ active" : `✗ ${accVerify.status} ${errText(accVerify)}`);

  if (!userOk && !accOk) {
    hints.push(
      "Token is NOT recognized by Cloudflare: it was copied incorrectly, deleted/expired, or it is not an API Token (e.g. Global API Key). Create a new token from the 'Workers AI' template and paste it again.",
    );
  }

  console.log("\n3) Can it run the image model on this account?");
  const run = await call("POST", `${BASE}/accounts/${accountId}/ai/run/${model}`, {
    prompt: "a red apple, flat illustration, white background",
    steps: 4,
  });
  const image = run.json && run.json.result && run.json.result.image;
  if (image) {
    console.log(`   ✓ OK, got an image (${Math.round((image.length * 3) / 4 / 1024)} KB). Credentials are fine.`);
  } else {
    console.log(`   ✗ ${run.status} ${errText(run)}`);
    if ((userOk || accOk) && (run.status === 401 || run.status === 403)) {
      hints.push(
        "Token is valid, but not for this action/account: either CLOUDFLARE_ACCOUNT_ID is the wrong account, or the token lacks the 'Workers AI' permission (Account → Workers AI → Read/Edit) for this account.",
      );
    }
    if (run.status === 429) hints.push("Rate limited / daily free allocation used up: try again later.");
    if (run.status === 404) hints.push("Model name not found: check CLOUDFLARE_IMAGE_MODEL.");
  }

  if (hints.length) {
    console.log("\nLikely causes:");
    hints.forEach((h) => console.log(" -", h));
  }
})();
