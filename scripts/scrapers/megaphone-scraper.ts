import type { Page, BrowserContext } from "playwright";
import {
  launchBrowser,
  saveSession,
  waitForLogin,
  appendJobLog,
  takeScreenshot,
  type ScrapeResult,
  type ScrapedDailyData,
  type ScrapedEpisodeData,
} from "./base-scraper";

const ORG_DASHBOARD_URL =
  "https://cms.megaphone.fm/organizations/91e3bab6-8224-11ee-a290-43b918ae8999/dashboard";

const LOGIN_URL = "https://cms.megaphone.fm/signin";

// ---------------------------------------------------------------------------
// Auth check: are we on the dashboard or redirected to login?
// ---------------------------------------------------------------------------
async function isLoggedIn(page: Page): Promise<boolean> {
  const url = page.url();
  // If we're on the dashboard or any org page, we're logged in
  if (url.includes("/organizations/") && !url.includes("/signin")) {
    return true;
  }
  // Check for common dashboard elements
  try {
    const hasDashboard = await page.locator('[data-testid="dashboard"], .dashboard, nav').first().isVisible({ timeout: 2000 });
    return hasDashboard;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main scrape function
// ---------------------------------------------------------------------------
export async function scrapeMegaphone(jobId: string): Promise<ScrapeResult> {
  const { browser, context, page } = await launchBrowser("megaphone");

  try {
    await appendJobLog(jobId, "Browser opened — navigating to Megaphone CMS");
    await page.goto(ORG_DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await appendJobLog(jobId, `Page loaded — URL: ${page.url()}`);
    await page.waitForTimeout(3000);

    // Check if we need to login
    const loggedIn = await isLoggedIn(page);
    await appendJobLog(jobId, `Login check: ${loggedIn ? "already logged in" : "need login"}`);

    if (!loggedIn) {
      await appendJobLog(jobId, "Not logged in — redirecting to login page");
      if (!page.url().includes("/signin")) {
        await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      }

      const loginSuccess = await waitForLogin(page, jobId, {
        checkLoggedIn: isLoggedIn,
        timeoutMs: 5 * 60 * 1000,
      });

      if (!loginSuccess) {
        throw new Error("Login timeout — please complete login within 5 minutes");
      }
    }

    await saveSession(context, "megaphone");
    await appendJobLog(jobId, "Navigating to dashboard for data collection");

    // Navigate to the dashboard
    await page.goto(ORG_DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000); // Let charts/data load
    await appendJobLog(jobId, `Dashboard URL: ${page.url()}`);

    await takeScreenshot(page, "megaphone-dashboard");

    // ---------------------------------------------------------------------------
    // Strategy 1: Intercept API calls made by the dashboard
    // Megaphone CMS frontend often fetches data from its own API
    // ---------------------------------------------------------------------------
    const apiData = await interceptMegaphoneAPI(page, context, jobId);

    // ---------------------------------------------------------------------------
    // Strategy 2: Scrape from visible DOM elements (tables, charts)
    // ---------------------------------------------------------------------------
    const domData = await scrapeMegaphoneDOM(page, jobId);

    // Merge: prefer API data, fall back to DOM data
    const daily = apiData.daily.length > 0 ? apiData.daily : domData.daily;
    const episodes = apiData.episodes.length > 0 ? apiData.episodes : domData.episodes;

    await appendJobLog(
      jobId,
      `Scraped ${daily.length} daily records, ${episodes.length} episode records`
    );

    return {
      daily,
      episodes,
      pageUrl: ORG_DASHBOARD_URL,
      scrapedAt: new Date().toISOString(),
    };
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Intercept XHR/fetch calls the Megaphone dashboard makes
// ---------------------------------------------------------------------------
async function interceptMegaphoneAPI(
  page: Page,
  _context: BrowserContext,
  jobId: string
): Promise<{ daily: ScrapedDailyData[]; episodes: ScrapedEpisodeData[] }> {
  const daily: ScrapedDailyData[] = [];
  const episodes: ScrapedEpisodeData[] = [];
  const capturedResponses: Array<{ url: string; body: unknown }> = [];

  await appendJobLog(jobId, "Intercepting Megaphone API calls...");

  // Set up response listener
  const responsePromises: Promise<void>[] = [];
  page.on("response", (response) => {
    const url = response.url();
    // Capture analytics/stats API responses
    if (
      url.includes("/api/") &&
      (url.includes("analytics") ||
        url.includes("stats") ||
        url.includes("downloads") ||
        url.includes("episodes") ||
        url.includes("metrics") ||
        url.includes("impressions"))
    ) {
      const p = response
        .json()
        .then((body) => {
          capturedResponses.push({ url, body });
        })
        .catch(() => {
          // Not JSON or failed, skip
        });
      responsePromises.push(p);
    }
  });

  // Trigger a page reload to capture fresh API calls
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);

  // Also try navigating to analytics/episodes sections if they exist
  const analyticsLinks = await page.locator('a[href*="analytics"], a[href*="stats"], a[href*="episodes"]').all();
  for (const link of analyticsLinks.slice(0, 3)) {
    try {
      const href = await link.getAttribute("href");
      if (href) {
        await appendJobLog(jobId, `Navigating to: ${href}`);
        await page.goto(
          href.startsWith("http") ? href : `https://cms.megaphone.fm${href}`,
          { waitUntil: "domcontentloaded", timeout: 15000 }
        );
        await page.waitForTimeout(3000);
        await takeScreenshot(page, `megaphone-${href.split("/").pop()}`);
      }
    } catch {
      // Navigation failed, continue
    }
  }

  // Wait for captured responses
  await Promise.allSettled(responsePromises);

  if (capturedResponses.length > 0) {
    await appendJobLog(
      jobId,
      `Captured ${capturedResponses.length} API responses`
    );

    for (const { url, body } of capturedResponses) {
      try {
        parseApiResponse(url, body, daily, episodes);
      } catch (err) {
        console.warn(`Failed to parse API response from ${url}:`, err);
      }
    }
  } else {
    await appendJobLog(jobId, "No API calls intercepted — will rely on DOM scraping");
  }

  return { daily, episodes };
}

// ---------------------------------------------------------------------------
// Parse captured API response into our data structures
// ---------------------------------------------------------------------------
function parseApiResponse(
  url: string,
  body: unknown,
  daily: ScrapedDailyData[],
  episodes: ScrapedEpisodeData[]
) {
  if (!body || typeof body !== "object") return;

  const data = body as Record<string, unknown>;

  // Try to parse as array of data points
  const items = Array.isArray(data) ? data : (data.data as unknown[]) || (data.results as unknown[]) || (data.items as unknown[]);

  if (Array.isArray(items)) {
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;

      // Looks like a daily stat
      if (record.date && (record.downloads !== undefined || record.impressions !== undefined || record.listens !== undefined)) {
        daily.push({
          date: String(record.date).split("T")[0],
          downloads: toNum(record.downloads) || toNum(record.impressions),
          listeners: toNum(record.unique_listeners) || toNum(record.listeners),
          raw: { source_url: url, ...record },
        });
      }

      // Looks like an episode record
      if (record.title || record.name || record.episode_title) {
        episodes.push({
          title: String(record.title || record.name || record.episode_title),
          external_id: record.id ? String(record.id) : undefined,
          downloads: toNum(record.downloads) || toNum(record.impressions) || toNum(record.total_downloads),
          plays: toNum(record.plays) || toNum(record.listens),
          raw: { source_url: url, ...record },
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// DOM scraping fallback
// ---------------------------------------------------------------------------
async function scrapeMegaphoneDOM(
  page: Page,
  jobId: string
): Promise<{ daily: ScrapedDailyData[]; episodes: ScrapedEpisodeData[] }> {
  const daily: ScrapedDailyData[] = [];
  const episodes: ScrapedEpisodeData[] = [];

  await appendJobLog(jobId, "Attempting DOM scraping...");

  // Navigate back to dashboard
  await page.goto(ORG_DASHBOARD_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3000);

  // Look for data tables
  const tables = await page.locator("table").all();
  await appendJobLog(jobId, `Found ${tables.length} tables on page`);

  for (const table of tables) {
    try {
      const rows = await table.locator("tbody tr").all();
      for (const row of rows) {
        const cells = await row.locator("td").allTextContents();
        if (cells.length < 2) continue;

        // Try to identify episode rows: typically have title and numeric values
        const title = cells[0]?.trim();
        const numericValues = cells.slice(1).map((c) => parseFormattedNumber(c.trim()));
        const hasNumbers = numericValues.some((n) => n !== null && n > 0);

        if (title && hasNumbers) {
          episodes.push({
            title,
            downloads: numericValues[0] ?? undefined,
            plays: numericValues[1] ?? undefined,
            listeners: numericValues[2] ?? undefined,
            raw: { cells, source: "dom_table" },
          });
        }
      }
    } catch {
      // Table parsing failed, continue
    }
  }

  // Look for stat cards / KPI elements
  const statElements = await page.locator(
    '[class*="stat"], [class*="metric"], [class*="kpi"], [class*="count"], [class*="number"]'
  ).all();

  for (const el of statElements) {
    try {
      const text = await el.textContent();
      if (text) {
        const num = parseFormattedNumber(text);
        if (num !== null) {
          await appendJobLog(jobId, `Found stat element: "${text.trim().substring(0, 50)}"`);
        }
      }
    } catch {
      // Element not accessible, skip
    }
  }

  // Dump page HTML structure for debugging (first run)
  try {
    const html = await page.content();
    const bodyText = await page.locator("body").textContent();
    await appendJobLog(
      jobId,
      `Page text length: ${bodyText?.length || 0} chars. HTML length: ${html.length} chars.`
    );
  } catch {
    // Ignore
  }

  if (episodes.length === 0) {
    await appendJobLog(
      jobId,
      "No data extracted from DOM — the page structure may need manual mapping. Check screenshots."
    );
  }

  return { daily, episodes };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function toNum(val: unknown): number | undefined {
  if (val === null || val === undefined) return undefined;
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

function parseFormattedNumber(text: string): number | null {
  // Remove commas, spaces, and common suffixes
  const cleaned = text.replace(/[,\s]/g, "").replace(/[^0-9.-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}
