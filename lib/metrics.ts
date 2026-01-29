import { head, put } from "@vercel/blob";
import { fetchHistoryIndex } from "@/lib/history";

export const METRICS_DIR = "metrics";

export type UserWeekMetric = {
  weekId: string;
  prevWeekId: string | null;
  email: string;
  name: string;
  incompleteCount: number;
  deltaFromPrevWeek: number;
};

export type WeekMetrics = {
  weekId: string;
  prevWeekId: string | null;
  generatedAt: string;
  users: UserWeekMetric[];
};

export function buildMetricsPath(weekId: string): string {
  return `${METRICS_DIR}/${weekId}.json`;
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function parseWeekId(weekId: string): { year: number; week: number } | null {
  const m = /^(\d{4})-Week-(\d{2})$/i.exec(weekId.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(week)) return null;
  return { year, week };
}

export function compareWeekIds(a: string, b: string): number {
  const pa = parseWeekId(a);
  const pb = parseWeekId(b);
  if (!pa || !pb) return a.localeCompare(b);
  if (pa.year !== pb.year) return pa.year - pb.year;
  return pa.week - pb.week;
}

export async function findPrevWeekId(currentWeekId: string): Promise<string | null> {
  const history = await fetchHistoryIndex();
  const candidates = (history.weeks ?? [])
    .map((w) => w.weekId)
    .filter((w) => typeof w === "string" && w && w !== currentWeekId)
    .filter((w) => compareWeekIds(w, currentWeekId) < 0)
    .sort(compareWeekIds);

  return candidates.length ? candidates[candidates.length - 1] : null;
}

export async function saveWeekMetrics(metrics: WeekMetrics): Promise<WeekMetrics> {
  const blob = new Blob([JSON.stringify(metrics)], { type: "application/json" });
  await put(buildMetricsPath(metrics.weekId), blob, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return metrics;
}

export async function fetchWeekMetrics(weekId: string): Promise<WeekMetrics | null> {
  try {
    const metadata = await head(buildMetricsPath(weekId), {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    const res = await fetch(metadata.downloadUrl);
    if (!res.ok) return null;
    const data = (await res.json()) as WeekMetrics;
    if (!data || data.weekId !== weekId || !Array.isArray(data.users)) return null;
    return {
      ...data,
      users: data.users.map((u) => ({
        ...u,
        email: normalizeEmail(u.email),
        name: typeof u.name === "string" ? u.name.trim() : "",
        incompleteCount: Number.isFinite(u.incompleteCount) ? u.incompleteCount : 0,
        deltaFromPrevWeek: Number.isFinite(u.deltaFromPrevWeek) ? u.deltaFromPrevWeek : 0,
      })),
    };
  } catch (err: any) {
    if (err?.status === 404 || err?.statusCode === 404 || err?.code === "blob_not_found") {
      return null;
    }
    throw err;
  }
}

