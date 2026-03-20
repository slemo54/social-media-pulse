/**
 * Sync Runner — Picks up pending sync_jobs from Supabase and executes
 * Playwright scrapers in headed mode.
 *
 * Usage:
 *   npx tsx scripts/sync-runner.ts
 *   npx tsx scripts/sync-runner.ts --platform megaphone
 *   npx tsx scripts/sync-runner.ts --platform apple_podcasts
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import * as dotenv from "dotenv";
import * as path from "path";

// Load env from .env.local (Next.js convention)
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

import {
  createRunnerClient,
  appendJobLog,
  updateJobStatus,
  type SyncJob,
} from "./scrapers/base-scraper";
import { scrapeMegaphone } from "./scrapers/megaphone-scraper";
import { scrapeApplePodcasts } from "./scrapers/apple-podcasts-scraper";
import { importScrapedData } from "./scrapers/data-importer";

// ---------------------------------------------------------------------------
// Parse CLI arguments
// ---------------------------------------------------------------------------
function parseArgs(): { platform?: string } {
  const args = process.argv.slice(2);
  const platformIdx = args.indexOf("--platform");
  if (platformIdx !== -1 && args[platformIdx + 1]) {
    return { platform: args[platformIdx + 1] };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Pick up the next pending job
// ---------------------------------------------------------------------------
async function getNextJob(platformFilter?: string): Promise<SyncJob | null> {
  const supabase = createRunnerClient();

  let query = supabase
    .from("sync_jobs")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);

  if (platformFilter) {
    query = query.eq("platform", platformFilter);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch pending jobs:", error.message);
    return null;
  }

  if (!data || data.length === 0) {
    return null;
  }

  return data[0] as unknown as SyncJob;
}

// ---------------------------------------------------------------------------
// Execute a single job
// ---------------------------------------------------------------------------
async function executeJob(job: SyncJob): Promise<void> {
  const startTime = Date.now();

  try {
    // Mark as running
    await updateJobStatus(job.id, "running", {
      started_at: new Date().toISOString(),
    });
    await appendJobLog(job.id, `Starting ${job.platform} sync job`);

    // Run the appropriate scraper
    let result;
    switch (job.platform) {
      case "megaphone":
        result = await scrapeMegaphone(job.id);
        break;
      case "apple_podcasts":
        result = await scrapeApplePodcasts(job.id);
        break;
      default:
        throw new Error(`Unknown platform: ${job.platform}`);
    }

    // Import data
    await updateJobStatus(job.id, "importing");
    await appendJobLog(job.id, "Scraping complete — importing data to database");

    const recordCount = await importScrapedData(job.id, job.platform, result);

    // Mark complete
    const durationSec = Math.round((Date.now() - startTime) / 1000);
    await updateJobStatus(job.id, "completed", {
      completed_at: new Date().toISOString(),
      records_synced: recordCount,
    });
    await appendJobLog(
      job.id,
      `Sync completed: ${recordCount} records imported in ${durationSec}s`
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const durationSec = Math.round((Date.now() - startTime) / 1000);

    await updateJobStatus(job.id, "error", {
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    });
    await appendJobLog(job.id, `Sync failed after ${durationSec}s: ${errorMessage}`);

    // Update data_sources with error
    const supabase = createRunnerClient();
    await supabase
      .from("data_sources")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: "error",
        last_sync_error: errorMessage,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("platform", job.platform);

    // Create error sync_log
    await supabase.from("sync_logs").insert({
      platform: job.platform,
      sync_type: "playwright_scrape",
      status: "error",
      records_synced: 0,
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    } as never);

    console.error(`Job ${job.id} failed:`, errorMessage);
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
async function main() {
  const { platform } = parseArgs();

  console.log("===========================================");
  console.log("  Social Media Pulse — Sync Runner");
  console.log("===========================================");
  if (platform) {
    console.log(`  Filter: ${platform} only`);
  }
  console.log("");

  // Verify env
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    console.error(
      "ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
    console.error("Make sure .env.local exists with these variables.");
    process.exit(1);
  }

  // Process jobs in a loop
  let jobsProcessed = 0;

  while (true) {
    const job = await getNextJob(platform);

    if (!job) {
      if (jobsProcessed === 0) {
        console.log("No pending sync jobs found.");
        console.log("");
        console.log("To create a job:");
        console.log(
          '  1. Click "Sync Megaphone" or "Sync Apple Podcasts" in the web app Settings'
        );
        console.log("  2. Then re-run this script");
        console.log("");
        console.log("Or create a job manually:");
        console.log(
          "  curl -X POST http://localhost:3000/api/sync-jobs -H 'Content-Type: application/json' -d '{\"platform\":\"megaphone\"}'"
        );
      } else {
        console.log(`\nAll jobs processed (${jobsProcessed} total). Exiting.`);
      }
      break;
    }

    console.log(`\nPicked up job ${job.id} for ${job.platform}`);
    await executeJob(job);
    jobsProcessed++;
  }
}

main().catch((err) => {
  console.error("Runner crashed:", err);
  process.exit(1);
});
