import { chromium, type BrowserContext, type Page } from "playwright";
import { createClient } from "@supabase/supabase-js";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

// ---------------------------------------------------------------------------
// Supabase admin client for the runner (uses service role key)
// ---------------------------------------------------------------------------
export function createRunnerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env"
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Session directory
// ---------------------------------------------------------------------------
const SESSIONS_ROOT =
  process.env.SYNC_SESSIONS_DIR ||
  path.join(os.homedir(), ".social-media-pulse", "sessions");

export function getSessionDir(platform: string): string {
  const dir = path.join(SESSIONS_ROOT, platform);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------
// Job log helper — appends a log entry to sync_jobs.log via Supabase
// ---------------------------------------------------------------------------
export interface SyncJob {
  id: string;
  platform: string;
  status: string;
  log: Array<{ ts: string; message: string }>;
  error_message: string | null;
  raw_data: unknown;
  records_synced: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

const supabase = () => createRunnerClient();

export async function appendJobLog(jobId: string, message: string) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${message}`);

  const { data: job } = await supabase()
    .from("sync_jobs")
    .select("log")
    .eq("id", jobId)
    .single();

  const rawLog = (job as unknown as { log: unknown } | null)?.log;
  let currentLog: Array<{ ts: string; message: string }> = [];
  if (Array.isArray(rawLog)) {
    currentLog = rawLog;
  } else if (typeof rawLog === "string") {
    try { currentLog = JSON.parse(rawLog); } catch { currentLog = []; }
  }
  currentLog.push({ ts, message });

  await supabase()
    .from("sync_jobs")
    .update({ log: currentLog } as never)
    .eq("id", jobId);
}

export async function updateJobStatus(
  jobId: string,
  status: string,
  extra: Record<string, unknown> = {}
) {
  await supabase()
    .from("sync_jobs")
    .update({ status, ...extra } as never)
    .eq("id", jobId);
}

// ---------------------------------------------------------------------------
// Screenshot helper
// ---------------------------------------------------------------------------
const SCREENSHOTS_DIR = path.join(SESSIONS_ROOT, "_screenshots");

export async function takeScreenshot(page: Page, label: string): Promise<string> {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  const filename = `${label}-${Date.now()}.png`;
  const filepath = path.join(SCREENSHOTS_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`Screenshot saved: ${filepath}`);
  return filepath;
}

// ---------------------------------------------------------------------------
// Chrome profile path (macOS)
// ---------------------------------------------------------------------------
const CHROME_USER_DATA_DIR = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Google",
  "Chrome"
);

// Which Chrome profile to use. "Default" = first profile (u/0).
// Override with env var CHROME_PROFILE if needed (e.g. "Profile 1" for u/1).
const CHROME_PROFILE = process.env.CHROME_PROFILE || "Default";

// ---------------------------------------------------------------------------
// Launch browser using the user's real Chrome profile
// ---------------------------------------------------------------------------
export async function launchBrowser(_platform: string): Promise<{
  browser: null; // persistent context has no separate browser handle
  context: BrowserContext;
  page: Page;
}> {
  // Check that Chrome user data dir exists
  if (!fs.existsSync(CHROME_USER_DATA_DIR)) {
    throw new Error(
      `Chrome user data directory not found at: ${CHROME_USER_DATA_DIR}\n` +
      "Make sure Google Chrome is installed."
    );
  }

  console.log(`Launching Chrome with profile "${CHROME_PROFILE}"...`);
  console.log("IMPORTANT: Close Google Chrome before running this script!\n");

  const context = await chromium.launchPersistentContext(CHROME_USER_DATA_DIR, {
    channel: "chrome",
    headless: false,
    args: [
      `--profile-directory=${CHROME_PROFILE}`,
      "--disable-blink-features=AutomationControlled",
    ],
    viewport: { width: 1440, height: 900 },
  });

  const page = context.pages()[0] || (await context.newPage());
  return { browser: null, context, page };
}

// ---------------------------------------------------------------------------
// Save session — no-op when using Chrome profile (session is Chrome's own)
// ---------------------------------------------------------------------------
export async function saveSession(_context: BrowserContext, _platform: string) {
  // Using the real Chrome profile — cookies/sessions are persisted by Chrome itself
  console.log("Session managed by Chrome profile — no separate save needed");
}

// ---------------------------------------------------------------------------
// Wait for manual login
// ---------------------------------------------------------------------------
export async function waitForLogin(
  page: Page,
  jobId: string,
  opts: {
    checkLoggedIn: (page: Page) => Promise<boolean>;
    timeoutMs?: number;
    pollIntervalMs?: number;
  }
): Promise<boolean> {
  const timeout = opts.timeoutMs || 5 * 60 * 1000; // 5 minutes
  const pollInterval = opts.pollIntervalMs || 2000;
  const start = Date.now();

  await updateJobStatus(jobId, "waiting_for_login");
  await appendJobLog(jobId, "Waiting for manual login in the browser window...");

  while (Date.now() - start < timeout) {
    try {
      const loggedIn = await opts.checkLoggedIn(page);
      if (loggedIn) {
        await appendJobLog(jobId, "Login detected!");
        return true;
      }
    } catch {
      // Page might be navigating, ignore
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  await appendJobLog(jobId, "Login timeout — 5 minutes elapsed");
  return false;
}

// ---------------------------------------------------------------------------
// Scraper interface
// ---------------------------------------------------------------------------
export interface ScrapedDailyData {
  date: string; // YYYY-MM-DD
  downloads?: number;
  listeners?: number;
  plays?: number;
  engaged_listeners?: number;
  followers?: number;
  raw: Record<string, unknown>;
}

export interface ScrapedEpisodeData {
  title: string;
  external_id?: string;
  downloads?: number;
  plays?: number;
  listeners?: number;
  avg_consumption?: number;
  date?: string; // YYYY-MM-DD
  raw: Record<string, unknown>;
}

export interface ScrapeResult {
  daily: ScrapedDailyData[];
  episodes: ScrapedEpisodeData[];
  pageUrl: string;
  scrapedAt: string;
}
