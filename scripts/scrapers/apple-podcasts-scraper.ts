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

const SHOW_URL =
  "https://podcastsconnect.apple.com/my-podcasts/show/italian-wine-podcast/8629955e-9bff-4bb2-a638-0fd33834fc22";

const ANALYTICS_URL = `${SHOW_URL}/analytics`;

// ---------------------------------------------------------------------------
// Auth check
// ---------------------------------------------------------------------------
async function isLoggedIn(page: Page): Promise<boolean> {
  const url = page.url();
  // Apple login pages
  if (url.includes("idmsa.apple.com") || url.includes("appleid.apple.com")) {
    return false;
  }
  // We're on Podcasts Connect
  if (url.includes("podcastsconnect.apple.com")) {
    // Check if content loaded (not a loading spinner or redirect)
    try {
      const hasContent = await page
        .locator('main, [role="main"], .analytics, [class*="show"], [class*="podcast"]')
        .first()
        .isVisible({ timeout: 3000 });
      return hasContent;
    } catch {
      return false;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main scrape function
// ---------------------------------------------------------------------------
export async function scrapeApplePodcasts(jobId: string): Promise<ScrapeResult> {
  const { browser, context, page } = await launchBrowser("apple_podcasts");

  try {
    await appendJobLog(jobId, "Browser opened — navigating to Apple Podcasts Connect");
    await page.goto(SHOW_URL, { waitUntil: "networkidle", timeout: 30000 });

    // Check if we need to login
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      await appendJobLog(
        jobId,
        "Not logged in — please complete Apple ID login (including 2FA) in the browser"
      );

      const loginSuccess = await waitForLogin(page, jobId, {
        checkLoggedIn: isLoggedIn,
        timeoutMs: 5 * 60 * 1000,
      });

      if (!loginSuccess) {
        throw new Error("Login timeout — please complete Apple ID login within 5 minutes");
      }
    }

    await saveSession(context, "apple_podcasts");
    await appendJobLog(jobId, "Logged in — navigating to analytics");

    // Try navigating to analytics section
    await navigateToAnalytics(page, jobId);
    await page.waitForTimeout(5000); // Let charts load
    await takeScreenshot(page, "apple-analytics");

    // ---------------------------------------------------------------------------
    // Strategy 1: Intercept API calls
    // ---------------------------------------------------------------------------
    const apiData = await interceptAppleAPI(page, context, jobId);

    // ---------------------------------------------------------------------------
    // Strategy 2: DOM scraping
    // ---------------------------------------------------------------------------
    const domData = await scrapeAppleDOM(page, jobId);

    const daily = apiData.daily.length > 0 ? apiData.daily : domData.daily;
    const episodes = apiData.episodes.length > 0 ? apiData.episodes : domData.episodes;

    await appendJobLog(
      jobId,
      `Scraped ${daily.length} daily records, ${episodes.length} episode records`
    );

    return {
      daily,
      episodes,
      pageUrl: ANALYTICS_URL,
      scrapedAt: new Date().toISOString(),
    };
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Navigate to analytics
// ---------------------------------------------------------------------------
async function navigateToAnalytics(page: Page, jobId: string) {
  // Try direct URL first
  try {
    await page.goto(ANALYTICS_URL, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(2000);
    if (page.url().includes("analytics")) {
      await appendJobLog(jobId, "Navigated to analytics section");
      return;
    }
  } catch {
    // Direct URL failed
  }

  // Try clicking analytics tab/link
  const analyticsLink = page.locator(
    'a[href*="analytics"], button:has-text("Analytics"), [role="tab"]:has-text("Analytics"), a:has-text("Analytics")'
  );
  try {
    const link = analyticsLink.first();
    if (await link.isVisible({ timeout: 3000 })) {
      await link.click();
      await page.waitForTimeout(3000);
      await appendJobLog(jobId, "Clicked analytics tab");
      return;
    }
  } catch {
    // No analytics link found
  }

  // Try trends tab
  const trendsLink = page.locator(
    'a[href*="trends"], a:has-text("Trends"), [role="tab"]:has-text("Trends")'
  );
  try {
    const link = trendsLink.first();
    if (await link.isVisible({ timeout: 3000 })) {
      await link.click();
      await page.waitForTimeout(3000);
      await appendJobLog(jobId, "Clicked trends tab");
      return;
    }
  } catch {
    // No trends link either
  }

  await appendJobLog(jobId, "Could not find analytics/trends section — scraping current page");
}

// ---------------------------------------------------------------------------
// Intercept Apple Podcasts API calls
// ---------------------------------------------------------------------------
async function interceptAppleAPI(
  page: Page,
  _context: BrowserContext,
  jobId: string
): Promise<{ daily: ScrapedDailyData[]; episodes: ScrapedEpisodeData[] }> {
  const daily: ScrapedDailyData[] = [];
  const episodes: ScrapedEpisodeData[] = [];
  const capturedResponses: Array<{ url: string; body: unknown }> = [];

  await appendJobLog(jobId, "Intercepting Apple Podcasts API calls...");

  page.on("response", (response) => {
    const url = response.url();
    if (
      url.includes("analytics") ||
      url.includes("trends") ||
      url.includes("episodes") ||
      url.includes("metrics") ||
      url.includes("performance") ||
      url.includes("podcast-analytics") ||
      url.includes("amp-api")
    ) {
      response
        .json()
        .then((body) => {
          capturedResponses.push({ url, body });
        })
        .catch(() => {});
    }
  });

  // Reload to capture API calls
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(5000);

  // Try to expand date range if there's a date picker
  await tryExpandDateRange(page, jobId);

  // Navigate through sub-sections
  const tabs = await page.locator('[role="tab"], .tab, [class*="tab"]').all();
  for (const tab of tabs.slice(0, 5)) {
    try {
      const tabText = await tab.textContent();
      if (tabText) {
        await tab.click();
        await page.waitForTimeout(3000);
        await appendJobLog(jobId, `Visited tab: "${tabText.trim()}"`);
        await takeScreenshot(page, `apple-tab-${tabText.trim().toLowerCase().replace(/\s+/g, "-")}`);
      }
    } catch {
      // Tab click failed
    }
  }

  if (capturedResponses.length > 0) {
    await appendJobLog(jobId, `Captured ${capturedResponses.length} API responses`);
    for (const { url, body } of capturedResponses) {
      try {
        parseAppleApiResponse(url, body, daily, episodes);
      } catch (err) {
        console.warn(`Failed to parse Apple API response from ${url}:`, err);
      }
    }
  } else {
    await appendJobLog(jobId, "No API calls intercepted — will rely on DOM scraping");
  }

  return { daily, episodes };
}

// ---------------------------------------------------------------------------
// Parse Apple API responses
// ---------------------------------------------------------------------------
function parseAppleApiResponse(
  url: string,
  body: unknown,
  daily: ScrapedDailyData[],
  episodes: ScrapedEpisodeData[]
) {
  if (!body || typeof body !== "object") return;
  const data = body as Record<string, unknown>;

  // Apple's API often returns data in a nested structure
  const results =
    (data.results as unknown[]) ||
    (data.data as unknown[]) ||
    (data.content as unknown[]) ||
    (data.metricsData as unknown[]) ||
    (data.trendData as unknown[]);

  if (Array.isArray(results)) {
    for (const item of results) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;

      // Daily/trend data
      if (r.date || r.day || r.period) {
        const dateStr = String(r.date || r.day || r.period).split("T")[0];
        daily.push({
          date: dateStr,
          plays: toNum(r.plays) || toNum(r.totalPlays) || toNum(r.playsCount),
          listeners: toNum(r.listeners) || toNum(r.uniqueListeners) || toNum(r.totalListeners),
          engaged_listeners: toNum(r.engagedListeners) || toNum(r.engaged),
          followers: toNum(r.followers) || toNum(r.totalFollowers),
          raw: { source_url: url, ...r },
        });
      }

      // Episode data
      if (r.episodeName || r.name || r.title || r.episodeId) {
        episodes.push({
          title: String(r.episodeName || r.name || r.title || ""),
          external_id: r.episodeId ? String(r.episodeId) : r.id ? String(r.id) : undefined,
          plays: toNum(r.plays) || toNum(r.totalPlays),
          listeners: toNum(r.listeners) || toNum(r.uniqueListeners),
          avg_consumption: toNum(r.avgConsumption) || toNum(r.averageListenDuration),
          raw: { source_url: url, ...r },
        });
      }
    }
  }

  // Some Apple API responses have summary-level metrics
  if (data.summary && typeof data.summary === "object") {
    const summary = data.summary as Record<string, unknown>;
    if (summary.totalPlays || summary.totalListeners) {
      daily.push({
        date: new Date().toISOString().split("T")[0],
        plays: toNum(summary.totalPlays),
        listeners: toNum(summary.totalListeners),
        engaged_listeners: toNum(summary.engagedListeners),
        followers: toNum(summary.followers),
        raw: { source_url: url, type: "summary", ...summary },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// DOM scraping
// ---------------------------------------------------------------------------
async function scrapeAppleDOM(
  page: Page,
  jobId: string
): Promise<{ daily: ScrapedDailyData[]; episodes: ScrapedEpisodeData[] }> {
  const daily: ScrapedDailyData[] = [];
  const episodes: ScrapedEpisodeData[] = [];

  await appendJobLog(jobId, "Attempting Apple Podcasts DOM scraping...");

  // Look for metric/stat cards
  const metricCards = await page.locator(
    '[class*="metric"], [class*="stat"], [class*="kpi"], [class*="count"], [class*="number"], [class*="value"]'
  ).all();

  const extractedMetrics: Record<string, string> = {};
  for (const card of metricCards) {
    try {
      const text = await card.textContent();
      const label = await card.locator("..").textContent();
      if (text && label) {
        const num = parseFormattedNumber(text);
        if (num !== null) {
          extractedMetrics[label.trim().substring(0, 60)] = text.trim();
          await appendJobLog(
            jobId,
            `Metric found: "${label.trim().substring(0, 40)}" = ${text.trim()}`
          );
        }
      }
    } catch {
      // Element not accessible
    }
  }

  // Look for tables (episode performance)
  const tables = await page.locator("table").all();
  await appendJobLog(jobId, `Found ${tables.length} tables on page`);

  for (const table of tables) {
    try {
      // Get headers
      const headers = await table.locator("thead th, thead td").allTextContents();
      const rows = await table.locator("tbody tr").all();

      for (const row of rows) {
        const cells = await row.locator("td").allTextContents();
        if (cells.length < 2) continue;

        const title = cells[0]?.trim();
        if (!title) continue;

        const episodeData: ScrapedEpisodeData = {
          title,
          raw: { cells, headers, source: "dom_table" },
        };

        // Map cells to known metrics based on header names
        for (let i = 1; i < cells.length && i < headers.length; i++) {
          const header = headers[i]?.toLowerCase().trim() || "";
          const value = parseFormattedNumber(cells[i]?.trim() || "");
          if (value === null) continue;

          if (header.includes("play") || header.includes("listen")) {
            episodeData.plays = value;
          } else if (header.includes("unique") || header.includes("listener")) {
            episodeData.listeners = value;
          } else if (header.includes("avg") || header.includes("consumption") || header.includes("duration")) {
            episodeData.avg_consumption = value;
          } else if (header.includes("download")) {
            episodeData.downloads = value;
          }
        }

        episodes.push(episodeData);
      }
    } catch {
      // Table parsing failed
    }
  }

  // Dump page structure for debugging
  try {
    const bodyText = await page.locator("body").textContent();
    await appendJobLog(
      jobId,
      `Page text length: ${bodyText?.length || 0} chars`
    );
  } catch {
    // Ignore
  }

  if (episodes.length === 0 && daily.length === 0) {
    await appendJobLog(
      jobId,
      "No data extracted from DOM — page structure may need manual mapping. Check screenshots."
    );
  }

  return { daily, episodes };
}

// ---------------------------------------------------------------------------
// Try to set date range to maximum
// ---------------------------------------------------------------------------
async function tryExpandDateRange(page: Page, jobId: string) {
  try {
    // Look for date picker or range selector
    const dateSelector = page.locator(
      '[class*="date"], [class*="range"], [class*="period"], select:has(option:has-text("All Time")), select:has(option:has-text("Last"))'
    );
    const first = dateSelector.first();
    if (await first.isVisible({ timeout: 2000 })) {
      await first.click();
      await page.waitForTimeout(1000);

      // Try to select "All Time" or the longest range
      const allTime = page.locator(
        'option:has-text("All Time"), [role="option"]:has-text("All Time"), li:has-text("All Time")'
      );
      if (await allTime.first().isVisible({ timeout: 1000 })) {
        await allTime.first().click();
        await page.waitForTimeout(3000);
        await appendJobLog(jobId, "Set date range to All Time");
        return;
      }

      // Try longest available
      const lastYear = page.locator(
        'option:has-text("Last 365"), option:has-text("Last Year"), option:has-text("12 months"), [role="option"]:has-text("Last 365")'
      );
      if (await lastYear.first().isVisible({ timeout: 1000 })) {
        await lastYear.first().click();
        await page.waitForTimeout(3000);
        await appendJobLog(jobId, "Set date range to last year");
      }
    }
  } catch {
    // Date range expansion failed, proceed with default
  }
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
  const cleaned = text.replace(/[,\s]/g, "").replace(/[^0-9.-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}
