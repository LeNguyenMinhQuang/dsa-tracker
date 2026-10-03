/*
 * Backfill illustrations for words that already exist in every user profile.
 * (The same action is available to admins in the app: Settings > Admin.)
 *
 * Usage (from the project root):
 *   node scripts/backfillImages.js --dry            # only count, change nothing
 *   node scripts/backfillImages.js                  # queue words that have no image
 *   node scripts/backfillImages.js --process        # queue + generate until done / quota hit
 *   node scripts/backfillImages.js --process --limit=50
 *   node scripts/backfillImages.js --retry-failed   # also re-queue words that failed 3 times
 *
 * Safe to run repeatedly: words that already have an image are skipped, and
 * identical words across users are generated only once.
 */
require("dotenv").config({ quiet: true });

const imageService = require("../src/services/imageService");

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

async function main() {
  const stats = await imageService.backfillAll({
    force: has("--retry-failed"),
    dryRun: has("--dry"),
  });

  console.log(`Found ${stats.users.length} user profile(s).`);
  stats.users.forEach((u) => console.log(`  - ${u.name}: ${u.words} word(s)`));

  console.log("\nDistinct words:       ", stats.total);
  console.log("Already have image:   ", stats.alreadyHave);
  console.log("Skipped (failed 3x):  ", stats.failedSkipped);
  console.log(has("--dry") ? "Would queue:         " : "Queued:               ", stats.queued);

  if (has("--dry")) return;

  const pending = await imageService.pendingCount();
  console.log("Pending in queue:     ", pending);

  if (!has("--process")) {
    console.log("\nQueued only. Start the server (worker) or re-run with --process to generate images.");
    return;
  }

  console.log("\nGenerating images (Ctrl+C to stop, run again to resume)...");
  const result = await imageService.processPending({
    limit: LIMIT,
    onResult: (r, s) => {
      const total = s.done + s.failed + s.skipped;
      if (total % 10 === 0) console.log(`  progress: ${s.done} done, ${s.failed} failed, ${s.skipped} skipped`);
    },
  });

  const left = await imageService.pendingCount();
  console.log(
    `\nFinished (${result.stopped}): ${result.done} done, ${result.failed} failed, ${result.skipped} skipped. Still pending: ${left}.`,
  );
  if (result.stopped === "ratelimited") {
    console.log(
      "Stopped: provider quota reached or credentials/config invalid (see the log above).\n" +
        "Words are still queued. Fix the cause (or wait for the daily quota) and run the same command again.",
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
