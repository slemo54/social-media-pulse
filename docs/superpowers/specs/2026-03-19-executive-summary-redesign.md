# Executive Summary Page — Redesign Spec

## Objective

Redesign `/dashboard/executive` to be a site-focused executive report that answers four questions in under 1 minute:
1. Is the site growing or declining?
2. Where does traffic come from?
3. Which content is helping the site?
4. Where should we focus efforts?

**Guiding principle**: GA4 is the primary source for site health. YouTube and podcast data provide context to explain traffic movements. Metrics from different platforms are never mixed in the same KPI.

**Language**: all user-facing text and insights are in Italian.

## Architecture

### Data Flow

```
page.tsx (client)
    |
    GET /api/executive?startDate=...&endDate=...
        |
        +-- GA4Connector (5 methods for current period + fetchDailyAggregates for previous period, all in Promise.all)
        |     ga4.fetchDailyAggregates(startDate, endDate)
        |     ga4.fetchTrafficSources(startDate, endDate)
        |     ga4.fetchTopPages(startDate, endDate)
        |     ga4.fetchGeographic(startDate, endDate)
        |     ga4.fetchDeviceBreakdown(startDate, endDate)
        |     ga4.fetchDailyAggregates(prevStart, prevEnd)  ← previous period
        |     → summary, previousSummary, dailyAggregates, trafficSources, topPages, geographic, deviceBreakdown
        |
        +-- Supabase: episodes WHERE pub_date BETWEEN startDate AND endDate
        |     → content published in period (split by type: video vs podcast)
        |
        +-- Supabase: episodes WHERE pub_date BETWEEN prevStart AND prevEnd
        |     → previous period content count (for comparison)
        |
        +-- Supabase: episode_metrics WHERE platform='youtube' AND date BETWEEN ...
        |     → top YouTube videos by views (column: episode_metrics.views)
        |     → also fetches: likes (column: episode_metrics.likes),
        |       watch_time_minutes (column: episode_metrics.watch_time_minutes)
        |
        +-- Supabase: episode_metrics WHERE platform='soundcloud'
        |     → top SoundCloud tracks ordered by views DESC
        |     NOTE: episode_metrics.views for platform='soundcloud' stores the
        |     lifetime playback_count from SoundCloud API (not period-specific)
        |
        +-- Editorial impact calculation (correlate pub_dates with GA4 daily sessions)
        |
        +-- Deterministic insight generation
        |
        → Single JSON response
```

### Key Decisions

**GA4 Live vs DB**: The API calls GA4 live (via GA4Connector's 5 individual methods in `Promise.all`) rather than reading from `daily_aggregates`. This ensures fresh data without depending on sync status. YouTube/podcast metrics come from DB (already synced). This follows the same pattern as `/api/ga4/insights/route.ts`.

**GA4 Token caching**: The GA4Connector's `getAccessToken()` is called once per connector instance. Since we create one `GA4Connector` instance and call all methods on it, the token is reused. However, the current implementation may call `getAccessToken()` per method. If this causes rate limiting issues, a token cache can be added to the connector in a follow-up — not in scope for this spec.

## API: GET /api/executive

### Request

```
GET /api/executive?startDate=2026-02-17&endDate=2026-03-19
```

### Response Shape

```typescript
interface ExecutiveResponse {
  // Period info
  period: { start: string; end: string; prevStart: string; prevEnd: string }

  // Section 2: Site KPIs (GA4 live)
  siteKPIs: {
    sessions: number
    prevSessions: number
    users: number
    prevUsers: number
    pageViews: number
    prevPageViews: number
    avgSessionDuration: number   // seconds
    prevAvgSessionDuration: number
    bounceRate: number           // percentage
    prevBounceRate: number
    contentPublished: {
      total: number
      videos: number
      podcasts: number
      prevTotal: number          // previous period count for comparison
    }
  }

  // Section 3: Site Trend (daily GA4 data for chart + sparklines)
  siteTrend: {
    daily: Array<{
      date: string
      sessions: number
      users: number
    }>
    contentMarkers: Array<{
      date: string
      type: 'video' | 'podcast'
      title: string
    }>
    summary: {
      avgDailySessions: number
      bestDay: { date: string; sessions: number }
      withPublicationAvg: number
      withoutPublicationAvg: number
      publicationLift: number     // percentage
    }
  }

  // Section 4: Traffic Sources (GA4 live)
  trafficSources: Array<{ channel: string; sessions: number; users: number; percentage: number }>
  topCountries: Array<{ country: string; sessions: number; percentage: number }>
  deviceBreakdown: Array<{ device: string; sessions: number; percentage: number }>

  // Section 5: What's Working
  // topPages: from GA4 (ga4.fetchTopPages returns { page, sessions, users, views, avg_duration })
  // mapped to camelCase; `sessions` field dropped (views and users are more relevant here)
  topPages: Array<{ page: string; views: number; users: number; avgDuration: number }>

  // topYouTubeContent: from episode_metrics WHERE platform='youtube'
  // DB columns: views (int), likes (int), watch_time_minutes (float) → mapped to camelCase
  topYouTubeContent: Array<{ title: string; views: number; likes: number; watchTimeMinutes: number }>

  // topAudioContent: from episode_metrics WHERE platform='soundcloud'
  // DB column: views (int) — this stores SoundCloud lifetime playback_count
  // Frontend must label this as "plays (lifetime)", NOT "views"
  topAudioContent: Array<{ title: string; plays: number; isLifetime: true }>

  // Section 6: Editorial Impact
  editorialImpact: {
    totalPublished: number
    videos: number
    podcasts: number
    avgSessionsWithPublication: number
    avgSessionsWithoutPublication: number
    publicationLiftPercent: number
    avg48hEffect: number          // percentage: mean(48h post-pub sessions) vs mean(non-publication day sessions)
    bestContent: {
      title: string
      type: 'video' | 'podcast'
      sessionsDelta: number
      sessionsDeltaPercent: number
    } | null
  }

  // Section 7: Insights
  insights: string[]              // 3-5 sentences in Italian
  recommendation: string          // 1 actionable recommendation in Italian

  // Sync status
  lastSyncAt: string | null       // from data_sources.last_sync_at WHERE platform='ga4'
}
```

### Sparklines

The KPI sparklines are derived **client-side** from `siteTrend.daily`. The frontend takes the last 7 entries from the `daily` array and uses `sessions` (or `users`, etc.) to render the SVG sparkline. No separate sparkline field is needed in the API response.

### Editorial Impact Calculation

1. Get all episodes with `pub_date` in the selected period from `episodes` table
2. Classify each as video (has matching rows in `episode_metrics` WHERE `platform='youtube'` AND `episode_id` matches) or podcast (no YouTube match)
3. Build a set of "publication dates" (unique dates where content was published)
4. From `siteTrend.daily` (GA4 data), split days into two groups:
   - "with publication": days whose date is in the publication dates set
   - "without publication": all other days
5. Calculate:
   - `avgSessionsWithPublication`: mean sessions on publication days
   - `avgSessionsWithoutPublication`: mean sessions on non-publication days
   - `publicationLiftPercent`: ((with - without) / without) * 100
   - `avg48hEffect`: for each publication date, take sessions on that day + next day, compute the mean of these 2-day windows, then compare to `avgSessionsWithoutPublication`. Result: ((mean48h - withoutAvg) / withoutAvg) * 100
6. Find best content: for each episode, compute (sessions on pub_date + sessions on pub_date+1) - (2 * avgSessionsWithoutPublication). The episode with the highest delta wins.

### Insight Generation Rules

```
IF sessions change > +15%:
  "Il traffico del sito è in crescita significativa (+{change}%) rispetto al periodo precedente."
ELIF sessions change < -15%:
  "Il traffico del sito è in calo ({change}%). Verificare frequenza di pubblicazione e posizionamento SEO."
ELSE:
  "Il traffico del sito è stabile rispetto al periodo precedente ({change}%)."

IF bounceRate drops > 5 points:
  "La qualità del traffico sta migliorando: il bounce rate è sceso di {delta} punti."
ELIF bounceRate rises > 5 points:
  "Attenzione: il bounce rate è salito di {delta} punti. Verificare le pagine di atterraggio."

IF top traffic source is Organic Search > 40%:
  "Il traffico organico (SEO) è la fonte principale ({pct}%). Il posizionamento sta funzionando."

IF publicationLiftPercent > 20%:
  "I contenuti pubblicati generano un aumento medio del {lift}% nel traffico del sito."

IF bestContent sessionsDeltaPercent > 50%:
  "{bestContent.title} ha avuto un impatto significativo: +{delta}% traffico nelle 48h successive."

RECOMMENDATION (pick highest priority match):
  1. If sessions declining AND content published < prevTotal: "Aumentare la frequenza di pubblicazione."
  2. If sessions growing AND publicationLiftPercent > 20%: "Mantenere la frequenza attuale, i contenuti stanno trainando il traffico."
  3. If bounceRate rising > 5 points: "Migliorare le pagine di atterraggio principali."
  4. Default: "Continuare a monitorare l'andamento e mantenere la cadenza editoriale."
```

## Frontend: page.tsx

### Section 1 — Header

- Title: "Executive Summary"
- Subtitle: "Andamento del sito e impatto dei contenuti"
- `DateRangePicker` component (existing)
- Badge: "Ultimo sync: [relative time]" from `lastSyncAt`
- Text: "Confronto con: [prevStart] — [prevEnd]"

### Section 2 — Site KPIs (6 cards)

Grid: 6 cols desktop, 3x2 tablet, 2x3 mobile.

| Card | Value | Change | Note |
|------|-------|--------|------|
| Sessions | siteKPIs.sessions | vs prevSessions | Standard: green up, red down |
| Users | siteKPIs.users | vs prevUsers | Standard |
| Page Views | siteKPIs.pageViews | vs prevPageViews | Standard |
| Durata Media | avgSessionDuration | vs prev | Formatted "Xm Ys" |
| Bounce Rate | bounceRate | vs prev | **Inverted**: decrease = green, increase = red |
| Contenuti Pubblicati | total | vs prevTotal | Shows "X video + Y podcast" as subtitle |

Each card: value, % change with colored arrow, 7-point sparkline derived from last 7 entries of `siteTrend.daily`.

**Bounce Rate inversion**: The existing `KPICard` component hardcodes positive=green. For bounce rate, the card will be rendered with a custom inline implementation (not using KPICard) that inverts the color logic, OR KPICard gets an `invertChange?: boolean` prop added. The implementation should choose whichever is simpler.

### Section 3 — Site Trend

**Chart (Recharts ComposedChart):**
- Area fill (light): sessions per day
- Dashed line (low opacity): users per day
- Y-axis left: count
- Reference lines for content publication dates:
  - Red dashed + label for YouTube videos
  - Orange dashed + label for podcast episodes
  - Tooltip on hover: content title

**Summary strip below chart (3 stat blocks inline):**
- "Media giornaliera: X sessions/giorno"
- "Giorno migliore: [date] con X sessions"
- "Giorni con pubblicazione: media X sessions vs Y senza ({lift}%)"

### Section 4 — Traffic Origins (3-column grid)

**Card 1 — Traffic Sources (top 6):**
Each row: channel name, progress bar (proportional to max), sessions count, % of total.

**Card 2 — Top Countries (top 8):**
Each row: country name, sessions count, % of total.

**Card 3 — Devices (3 blocks):**
Each block: device name (Mobile/Desktop/Tablet), sessions, % of total. Visual bar proportional.

### Section 5 — What's Working (3-column grid)

**Card 1 — Top Pages (GA4, top 10):**
Table: Page path, Views, Users, Avg Duration.

**Card 2 — Top YouTube Content (DB, top 5):**
Table: Title, Views, Likes, Watch Time.
Footer: "Dati YouTube Analytics — aggiornati all'ultimo sync"

**Card 3 — Top Audio Content (DB, top 5):**
Table: Title, Plays (lifetime).
Footer: "I plays mostrati sono il totale lifetime da SoundCloud, non il trend del periodo"
If no data: "Nessun dato di ascolto disponibile. I dati Megaphone non includono metriche di consumo."

### Section 6 — Editorial Impact

4 stat cards in a row:
1. "Contenuti pubblicati: X (Y video, Z podcast)"
2. "Con pubblicazione: media X sessions vs Y senza (+Z%)"
3. "Effetto 48h: +X% sessions dopo pubblicazione"
4. "Miglior impatto: [title] — +X sessions"

Footer italic: "Nota: correlazioni osservate, non rapporti di causalità."

### Section 7 — Management Insights

Card with:
- 3-5 bullet points (from `insights` array)
- Highlighted recommendation box at bottom (from `recommendation`)
- Visually distinct: recommendation has accent border and slightly larger text

### Footer — Data Notes

Static text block, muted color:
> **Note sui dati**
> - Dati del sito (sessions, users, page views): Google Analytics 4, tempo reale
> - Dati YouTube: aggiornati all'ultimo sync — views, likes e watch time reali
> - Dati SoundCloud: totale plays lifetime per episodio, non andamento giornaliero
> - Dati Megaphone: solo contenuti pubblicati, non metriche di download reali
> - Correlazione pubblicazioni-traffico: osservazione temporale, non causalità dimostrata

## Files to Create/Modify

| File | Action |
|------|--------|
| `app/api/executive/route.ts` | Rewrite — new data structure with GA4 live + editorial impact |
| `app/dashboard/executive/page.tsx` | Rewrite — 7 sections as described |
| `hooks/useExecutiveData.ts` | Rewrite — new TypeScript interfaces matching API response |
| `components/dashboard/kpi-card.tsx` | Minor edit — add optional `invertChange` prop |

## Existing Components Reused

- `Header`, `DateRangePicker`, `Card/*`, `Badge`, `Skeleton` — as-is
- `Sparkline` SVG component — kept inline in page.tsx (small, page-specific)
- Recharts `ComposedChart`, `Line`, `Area`, `ReferenceLine` — already installed

## What Gets Removed

The old executive page had:
- "Portata Totale" KPI (mixed cross-platform sum) — removed
- "Download" KPI (misleading Megaphone proxy) — removed
- Series Performance bar chart — removed (not relevant to site-focused executive view)
- Heatmap by day of week — removed (not in requirements)
- Annotation system — removed (not in requirements)
- Metric selector dropdown — removed (fixed to sessions-focused view)

## Error Handling

- If GA4 API fails: show KPIs as "—" with warning banner "Dati GA4 non disponibili"
- If no episodes in period: editorial impact section shows "Nessun contenuto pubblicato nel periodo"
- If no YouTube metrics: top YouTube card shows "Nessun dato video disponibile"
- If no SoundCloud metrics: top audio card shows explanatory text about data limits
