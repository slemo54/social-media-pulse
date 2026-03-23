/**
 * Megaphone Playwright Scraper
 *
 * Accede a cms.megaphone.fm, scarica le statistiche di download
 * e le importa in Supabase.
 *
 * Utilizzo:
 *   npm run sync:megaphone              # auto-detect (storico completo se primo run)
 *   npm run sync:megaphone:full         # forza sync storico completo dal 2020
 *   npx tsx scripts/sync-megaphone.ts --start-date=2024-01-01
 *   npx tsx scripts/sync-megaphone.ts --debug   # mostra browser, salva screenshot
 *
 * Variabili d'ambiente richieste in .env.local:
 *   MEGAPHONE_EMAIL, MEGAPHONE_PASSWORD
 *   MEGAPHONE_NETWORK_ID, MEGAPHONE_PODCAST_ID
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { chromium, type Page, type BrowserContext } from "playwright";
import { createClient } from "@supabase/supabase-js";

// Carica .env.local dalla root del progetto
dotenv.config({ path: path.join(__dirname, "../.env.local") });

// ─── Config ────────────────────────────────────────────────────────────────

const {
  MEGAPHONE_EMAIL,
  MEGAPHONE_PASSWORD,
  MEGAPHONE_NETWORK_ID,
  MEGAPHONE_PODCAST_ID,
  NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

const args = process.argv.slice(2);
const FULL_SYNC = args.includes("--full-sync");
const DEBUG = args.includes("--debug");
const START_DATE_ARG = args
  .find((a) => a.startsWith("--start-date="))
  ?.split("=")[1];

const MEGAPHONE_BASE = "https://cms.megaphone.fm";

// ─── Date utils ────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().split("T")[0];
}

// ─── CSV parser ────────────────────────────────────────────────────────────

function parseDownloadCsv(
  csv: string
): Array<{ date: string; downloads: number }> {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].toLowerCase().split(",").map((h) => h.replace(/"/g, "").trim());
  const dateIdx = headers.findIndex((h) => h.includes("date"));
  const dlIdx = headers.findIndex(
    (h) => h.includes("download") || h.includes("plays") || h.includes("listen")
  );

  if (dateIdx === -1 || dlIdx === -1) {
    throw new Error(
      `CSV header non riconosciuto. Colonne trovate: ${headers.join(", ")}\n` +
        `Atteso: una colonna con 'date' e una con 'download'/'plays'/'listen'`
    );
  }

  return lines
    .slice(1)
    .filter((l) => l.trim())
    .map((line) => {
      const cols = line.split(",").map((c) => c.replace(/"/g, "").trim());
      const rawDate = cols[dateIdx] ?? "";
      const rawDl = cols[dlIdx] ?? "0";
      return {
        date: rawDate,
        downloads: parseInt(rawDl.replace(/[^0-9]/g, ""), 10) || 0,
      };
    })
    .filter((r) => /^\d{4}-\d{2}-\d{2}/.test(r.date));
}

// ─── Login ─────────────────────────────────────────────────────────────────

async function login(page: Page, email: string, password: string) {
  console.log("  Navigating to login page...");
  await page.goto(`${MEGAPHONE_BASE}/login`, { waitUntil: "networkidle" });

  if (DEBUG) await page.screenshot({ path: "debug-01-login.png" });

  // Selectors per il form di login (prova in ordine)
  const emailSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[placeholder*="email" i]',
    "#email",
    "#user_email",
  ];
  const passwordSelectors = [
    'input[type="password"]',
    'input[name="password"]',
    "#password",
    "#user_password",
  ];
  const submitSelectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Sign in")',
    'button:has-text("Log in")',
    'button:has-text("Login")',
    'button:has-text("Accedi")',
  ];

  await fillFirst(page, emailSelectors, email);
  await fillFirst(page, passwordSelectors, password);

  if (DEBUG) await page.screenshot({ path: "debug-02-filled.png" });

  await clickFirst(page, submitSelectors);
  await page.waitForURL((url) => !url.href.includes("/login"), {
    timeout: 30_000,
  });

  console.log("  ✓ Login effettuato");
  if (DEBUG) await page.screenshot({ path: "debug-03-dashboard.png" });
}

// ─── Daily aggregates ──────────────────────────────────────────────────────

async function downloadDailyStats(
  page: Page,
  context: BrowserContext,
  networkId: string,
  podcastId: string,
  startDate: string,
  endDate: string
): Promise<Array<{ date: string; downloads: number }>> {
  // URL con parametri di data (funziona se Megaphone li supporta)
  const analyticsUrl =
    `${MEGAPHONE_BASE}/networks/${networkId}/podcasts/${podcastId}/analytics` +
    `?startDate=${startDate}&endDate=${endDate}`;

  console.log(`  Navigating to analytics: ${analyticsUrl}`);
  await page.goto(analyticsUrl, { waitUntil: "networkidle" });

  if (DEBUG) await page.screenshot({ path: "debug-04-analytics.png" });

  // Aspetta che la pagina abbia finito il rendering (max 10s)
  await page.waitForTimeout(2000);

  // ── Strategia 1: intercetta request XHR/fetch per i dati stats ──
  // Alcune SPA come Megaphone caricano i dati via API interna
  const interceptedData = await tryInterceptStatsRequest(
    page,
    networkId,
    podcastId,
    startDate,
    endDate
  );
  if (interceptedData.length > 0) {
    console.log(
      `  ✓ Dati ottenuti tramite intercept API (${interceptedData.length} record)`
    );
    return interceptedData;
  }

  // ── Strategia 2: clicca Export CSV e cattura il download ──
  const csvData = await tryExportCsv(page, startDate, endDate);
  if (csvData.length > 0) {
    console.log(`  ✓ CSV scaricato (${csvData.length} record)`);
    return csvData;
  }

  // ── Strategia 3: leggi la tabella HTML ──
  const tableData = await tryReadTable(page);
  if (tableData.length > 0) {
    console.log(`  ✓ Dati letti dalla tabella HTML (${tableData.length} record)`);
    return tableData;
  }

  if (DEBUG) {
    await page.screenshot({ path: "debug-05-no-data.png" });
    console.log(
      "  Screenshot salvato: debug-05-no-data.png\n" +
        "  Controlla l'immagine per vedere la struttura della pagina."
    );
  }

  throw new Error(
    "Impossibile estrarre i dati dalla pagina analytics di Megaphone.\n" +
      "Suggerimenti:\n" +
      "  1. Riprova con --debug per vedere screenshot della pagina\n" +
      "  2. Controlla che MEGAPHONE_NETWORK_ID e MEGAPHONE_PODCAST_ID siano corretti\n" +
      "  3. Verifica che il tuo account abbia accesso alle analytics"
  );
}

async function tryInterceptStatsRequest(
  page: Page,
  networkId: string,
  podcastId: string,
  startDate: string,
  endDate: string
): Promise<Array<{ date: string; downloads: number }>> {
  // Prova a fare una richiesta diretta all'API interna di Megaphone
  // usando i cookie di sessione già presenti nel browser
  try {
    const result = await page.evaluate(
      async ({ networkId, podcastId, startDate, endDate }) => {
        const endpoints = [
          `/api/networks/${networkId}/podcasts/${podcastId}/download_stats?startDate=${startDate}&endDate=${endDate}`,
          `/api/v1/networks/${networkId}/podcasts/${podcastId}/analytics/downloads?startDate=${startDate}&endDate=${endDate}`,
          `/api/networks/${networkId}/podcasts/${podcastId}/analytics?startDate=${startDate}&endDate=${endDate}`,
        ];

        for (const endpoint of endpoints) {
          try {
            const resp = await fetch(endpoint, {
              credentials: "include",
              headers: { Accept: "application/json" },
            });
            if (resp.ok) {
              const data = await resp.json();
              return { endpoint, data };
            }
          } catch {}
        }
        return null;
      },
      { networkId, podcastId, startDate, endDate }
    );

    if (!result) return [];

    const { data } = result;
    // Normalizza varie strutture di risposta possibili
    const rows: Array<unknown> = Array.isArray(data)
      ? data
      : data?.stats ?? data?.data ?? data?.downloads ?? [];

    if (rows.length === 0) return [];

    return rows
      .map((r: unknown) => {
        const row = r as Record<string, unknown>;
        return {
          date: String(row.date ?? row.day ?? ""),
          downloads: Number(row.downloads ?? row.total ?? row.count ?? 0),
        };
      })
      .filter((r) => /^\d{4}-\d{2}-\d{2}/.test(r.date));
  } catch {
    return [];
  }
}

async function tryExportCsv(
  page: Page,
  _startDate: string,
  _endDate: string
): Promise<Array<{ date: string; downloads: number }>> {
  const exportSelectors = [
    'button:has-text("Export CSV")',
    'button:has-text("Export")',
    'button:has-text("Download CSV")',
    'button:has-text("Download")',
    'a:has-text("Export CSV")',
    'a:has-text("Export")',
    'a:has-text("Download CSV")',
    '[data-testid*="export"]',
    '[data-testid*="download"]',
    '[aria-label*="export" i]',
    '[aria-label*="download" i]',
  ];

  for (const selector of exportSelectors) {
    try {
      const btn = await page.$(selector);
      if (!btn) continue;

      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 15_000 }),
        btn.click(),
      ]);

      const tmpPath = path.join(os.tmpdir(), `megaphone-${Date.now()}.csv`);
      await download.saveAs(tmpPath);
      const csv = fs.readFileSync(tmpPath, "utf-8");
      fs.unlinkSync(tmpPath);

      return parseDownloadCsv(csv);
    } catch {
      // prova il prossimo selector
    }
  }

  return [];
}

async function tryReadTable(
  page: Page
): Promise<Array<{ date: string; downloads: number }>> {
  try {
    return await page.evaluate(() => {
      const tables = document.querySelectorAll("table");
      for (const table of tables) {
        const headers = Array.from(table.querySelectorAll("th, thead td")).map(
          (h) => h.textContent?.toLowerCase().trim() ?? ""
        );
        const dateIdx = headers.findIndex((h) => h.includes("date"));
        const dlIdx = headers.findIndex(
          (h) =>
            h.includes("download") || h.includes("plays") || h.includes("listen")
        );
        if (dateIdx === -1 || dlIdx === -1) continue;

        const rows = Array.from(table.querySelectorAll("tbody tr"));
        const result: Array<{ date: string; downloads: number }> = [];

        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll("td")).map(
            (c) => c.textContent?.trim() ?? ""
          );
          const rawDate = cells[dateIdx] ?? "";
          const rawDl = cells[dlIdx] ?? "0";
          if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
            result.push({
              date: rawDate,
              downloads: parseInt(rawDl.replace(/[^0-9]/g, ""), 10) || 0,
            });
          }
        }
        if (result.length > 0) return result;
      }
      return [];
    });
  } catch {
    return [];
  }
}

// ─── Helper UI utils ───────────────────────────────────────────────────────

async function fillFirst(
  page: Page,
  selectors: string[],
  value: string
): Promise<void> {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.fill(value);
        return;
      }
    } catch {}
  }
  throw new Error(
    `Nessun input trovato tra: ${selectors.join(", ")}\nUsa --debug per un screenshot.`
  );
}

async function clickFirst(page: Page, selectors: string[]): Promise<void> {
  for (const sel of selectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.click();
        return;
      }
    } catch {}
  }
  throw new Error(
    `Nessun pulsante trovato tra: ${selectors.join(", ")}\nUsa --debug per un screenshot.`
  );
}

// ─── Supabase upsert ───────────────────────────────────────────────────────

async function upsertDailyAggregates(
  supabase: ReturnType<typeof createClient>,
  aggregates: Array<{ date: string; downloads: number }>
): Promise<number> {
  let count = 0;
  for (let i = 0; i < aggregates.length; i += 50) {
    const chunk = aggregates.slice(i, i + 50);
    const rows = chunk.map((r) => ({
      platform: "megaphone",
      date: r.date,
      total_downloads: r.downloads,
    }));
    const { error } = await supabase
      .from("daily_aggregates")
      .upsert(rows as never[], { onConflict: "platform,date" });
    if (error) throw new Error(`Supabase upsert error: ${error.message}`);
    count += chunk.length;
  }
  return count;
}

// ─── Auto-detect start date ────────────────────────────────────────────────

async function resolveStartDate(
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  if (START_DATE_ARG) {
    console.log(`  Usando --start-date: ${START_DATE_ARG}`);
    return START_DATE_ARG;
  }
  if (FULL_SYNC) {
    console.log("  Flag --full-sync: storico completo dal 2020-01-01");
    return "2020-01-01";
  }

  const { count, error } = await supabase
    .from("daily_aggregates")
    .select("*", { count: "exact", head: true })
    .eq("platform", "megaphone");

  if (error) {
    console.warn(
      `  Impossibile verificare dati esistenti: ${error.message} → storico completo`
    );
    return "2020-01-01";
  }

  if (!count || count === 0) {
    console.log(
      "  Nessun dato Megaphone esistente → storico completo dal 2020-01-01"
    );
    return "2020-01-01";
  }

  const start = daysAgo(14);
  console.log(`  ${count} record esistenti → sync incrementale da ${start}`);
  return start;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  // Validazione variabili d'ambiente
  const missing = [
    ["MEGAPHONE_EMAIL", MEGAPHONE_EMAIL],
    ["MEGAPHONE_PASSWORD", MEGAPHONE_PASSWORD],
    ["MEGAPHONE_NETWORK_ID", MEGAPHONE_NETWORK_ID],
    ["MEGAPHONE_PODCAST_ID", MEGAPHONE_PODCAST_ID],
    ["NEXT_PUBLIC_SUPABASE_URL", NEXT_PUBLIC_SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    console.error(
      `Errore: variabili mancanti in .env.local:\n  ${missing.join("\n  ")}`
    );
    process.exit(1);
  }

  const supabase = createClient(
    NEXT_PUBLIC_SUPABASE_URL!,
    SUPABASE_SERVICE_ROLE_KEY!
  );

  const endDate = today();
  const startDate = await resolveStartDate(supabase);

  console.log(`\nMegaphone Sync: ${startDate} → ${endDate}`);
  if (DEBUG) console.log("  Modalità DEBUG attiva (browser visibile + screenshot)");

  const browser = await chromium.launch({ headless: !DEBUG });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    console.log("\n[1/3] Login...");
    await login(page, MEGAPHONE_EMAIL!, MEGAPHONE_PASSWORD!);

    console.log("\n[2/3] Download statistiche giornaliere...");
    const aggregates = await downloadDailyStats(
      page,
      context,
      MEGAPHONE_NETWORK_ID!,
      MEGAPHONE_PODCAST_ID!,
      startDate,
      endDate
    );

    if (aggregates.length === 0) {
      console.warn(
        "  Nessun dato trovato per il periodo richiesto.\n" +
          "  Verifica che il podcast abbia dati nel range di date specificato."
      );
    }

    console.log("\n[3/3] Salvataggio su Supabase...");
    const saved = await upsertDailyAggregates(supabase, aggregates);

    console.log(`\n✓ Sync completato: ${saved} record salvati in daily_aggregates`);
    console.log(
      `  Per vedere i dati: Dashboard → Analytics → seleziona Megaphone`
    );
  } finally {
    await browser.close();
  }
}

main().catch((err: Error) => {
  console.error(`\nErrore fatale: ${err.message}`);
  if (DEBUG) console.error(err.stack);
  process.exit(1);
});
