export const PLATFORM_COLORS: Record<string, string> = {
  megaphone: "#6366f1",
  youtube: "#ef4444",
  ga4: "#f59e0b",
  soundcloud: "#f97316",
  apple_podcasts: "#9333ea",
};

export const PLATFORM_NAMES: Record<string, string> = {
  megaphone: "Megaphone",
  youtube: "YouTube",
  ga4: "Google Analytics",
  soundcloud: "SoundCloud",
  apple_podcasts: "Apple Podcasts",
};

export const PLATFORMS = ["megaphone", "youtube", "ga4", "soundcloud"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const DEFAULT_DATE_RANGE = {
  startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0],
  endDate: new Date().toISOString().split("T")[0],
};

export const CHART_COLORS = [
  "#20808D",
  "#A84B2F",
  "#1B474D",
  "#BCE2E7",
  "#944454",
  "#FFC553",
];
