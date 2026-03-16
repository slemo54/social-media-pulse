// RSS feed parser and episode importer
// Parsing XML with regex (no external library)

export interface ParsedEpisode {
  title: string;
  description: string;
  audioUrl: string;
  durationSeconds: number;
  publishDate: string;
  episodeNumber?: number;
  series: string | null;
  tags: string[];
}

export async function fetchAndParseRSS(
  feedUrl: string
): Promise<ParsedEpisode[]> {
  const response = await fetch(feedUrl);
  const xml = await response.text();

  const items: ParsedEpisode[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];

    const title = extractTag(itemXml, "title") || "";
    const description =
      extractTag(itemXml, "description") ||
      extractTag(itemXml, "itunes:summary") ||
      "";
    const audioUrl = extractEnclosure(itemXml);
    const durationStr = extractTag(itemXml, "itunes:duration") || "0";
    const pubDate = extractTag(itemXml, "pubDate") || "";
    const episodeStr = extractTag(itemXml, "itunes:episode");

    items.push({
      title: decodeHtmlEntities(title),
      description: decodeHtmlEntities(stripHtml(description)),
      audioUrl,
      durationSeconds: parseDuration(durationStr),
      publishDate: pubDate
        ? new Date(pubDate).toISOString().split("T")[0]
        : "",
      episodeNumber: episodeStr ? parseInt(episodeStr, 10) : undefined,
      series: detectSeries(title),
      tags: extractTags(title, description),
    });
  }

  return items;
}

function extractTag(xml: string, tag: string): string | null {
  // Handle CDATA
  const cdataRegex = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`,
    "i"
  );
  const cdataMatch = cdataRegex.exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();

  const regex = new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, "i");
  const match = regex.exec(xml);
  return match ? match[1].trim() : null;
}

function extractEnclosure(xml: string): string {
  const regex = /url="([^"]+)"/i;
  const enclosureRegex = /<enclosure[^>]+>/i;
  const enclosureMatch = enclosureRegex.exec(xml);
  if (enclosureMatch) {
    const urlMatch = regex.exec(enclosureMatch[0]);
    return urlMatch ? urlMatch[1] : "";
  }
  return "";
}

function parseDuration(dur: string): number {
  if (!dur) return 0;
  // Pure seconds
  if (/^\d+$/.test(dur)) return parseInt(dur, 10);
  // HH:MM:SS or MM:SS
  const parts = dur.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

// Detect series from episode title
export function detectSeries(title: string): string | null {
  const seriesPatterns: [RegExp, string][] = [
    [/barolo\s*opening/i, "Barolo Opening"],
    [/wine\s*people/i, "Wine People"],
    [/vinitaly\s*international/i, "Vinitaly International"],
    [/amarone\s*opera\s*prima/i, "Amarone Opera Prima"],
    [/brunello\s*crossing/i, "Brunello Crossing"],
    [/chianti\s*classico\s*collection/i, "Chianti Classico Collection"],
    [/vino\s*nobile/i, "Vino Nobile"],
    [/prosecco\s*doc/i, "Prosecco DOC"],
    [/lugana/i, "Lugana"],
    [/vermentino/i, "Vermentino"],
    [/soave/i, "Soave"],
    [/franciacorta/i, "Franciacorta"],
    [/etna/i, "Etna"],
    [/langhe/i, "Langhe"],
    [/montalcino/i, "Montalcino"],
    [/valpolicella/i, "Valpolicella"],
    [/trentodoc/i, "Trentodoc"],
    [/primitivo/i, "Primitivo"],
    [/sagrantino/i, "Sagrantino"],
    [/aglianico/i, "Aglianico"],
  ];

  for (const [pattern, name] of seriesPatterns) {
    if (pattern.test(title)) return name;
  }
  return null;
}

// Extract tags from title and description
export function extractTags(title: string, description: string): string[] {
  const text = `${title} ${description}`.toLowerCase();
  const tags = new Set<string>();

  // Regions
  const regions = [
    "piemonte",
    "toscana",
    "veneto",
    "sicilia",
    "puglia",
    "campania",
    "sardegna",
    "friuli",
    "trentino",
    "alto adige",
    "lombardia",
    "emilia romagna",
    "marche",
    "umbria",
    "abruzzo",
    "calabria",
    "liguria",
    "basilicata",
    "molise",
    "valle d'aosta",
  ];
  for (const r of regions) {
    if (text.includes(r)) tags.add(r);
  }

  // Grape varieties
  const grapes = [
    "nebbiolo",
    "sangiovese",
    "barbera",
    "corvina",
    "glera",
    "trebbiano",
    "garganega",
    "nero d'avola",
    "primitivo",
    "aglianico",
    "montepulciano",
    "vermentino",
    "pinot grigio",
    "pinot nero",
    "chardonnay",
    "merlot",
    "cabernet",
    "prosecco",
    "amarone",
    "barolo",
    "brunello",
    "chianti",
  ];
  for (const g of grapes) {
    if (text.includes(g)) tags.add(g);
  }

  // Guest types
  if (/winemaker|produttor|enolog/i.test(text)) tags.add("winemaker");
  if (/sommelier/i.test(text)) tags.add("sommelier");
  if (/journalist|giornalist/i.test(text)) tags.add("journalist");
  if (/chef|cucin/i.test(text)) tags.add("chef");

  return Array.from(tags);
}
