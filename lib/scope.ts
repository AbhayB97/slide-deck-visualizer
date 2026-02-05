export const DEFAULT_SCOPE_YEARS = [2026] as const;

function parseYears(value: string | undefined | null): number[] {
  if (!value) return [...DEFAULT_SCOPE_YEARS];
  const years = value
    .split(/[,\s]+/g)
    .map((x) => Number(String(x).trim()))
    .filter((n) => Number.isFinite(n) && n >= 1970 && n <= 2100);
  return years.length ? Array.from(new Set(years)).sort() : [...DEFAULT_SCOPE_YEARS];
}

export function getEscalationScopeYears(): number[] {
  // For test branches, set ESCALATION_SCOPE_YEARS="2025,2026"
  return parseYears(process.env.ESCALATION_SCOPE_YEARS);
}

export function isSentDateInScope(sentDate: unknown): boolean {
  if (typeof sentDate !== "string") return false;
  const d = new Date(sentDate);
  if (Number.isNaN(d.getTime())) return false;
  const year = d.getFullYear();
  return getEscalationScopeYears().includes(year);
}

export function getScopeLabel(): string {
  const years = getEscalationScopeYears();
  if (years.length === 1) return `${years[0]} sessions only`;
  return `${years.join(" & ")} sessions only`;
}

