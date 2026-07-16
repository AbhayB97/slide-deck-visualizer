import { getObjectJson, isObjectNotFound, putObject } from '@/lib/objectStorage';
import { fetchHistoryIndex } from '@/lib/history';
import { compareWeekIds } from '@/lib/metrics';
import { fetchSnapshotByWeek } from '@/lib/snapshots';
import type { Snapshot } from '@/lib/processCsvSnapshot';

export const STREAKS_DIR = 'streaks';

export type UserStreak = {
  email: string;
  name: string;
  weeksOnList: number;
};

export type WeekStreaks = {
  weekId: string;
  generatedAt: string;
  users: UserStreak[];
};

export function buildStreaksPath(weekId: string): string {
  return `${STREAKS_DIR}/${weekId}.json`;
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function normalizeNameKey(name: unknown): string {
  if (typeof name !== 'string') return '';
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,]/g, '')
    .toLowerCase();
}

type WeekMembership = {
  emails: Set<string>;
  nameKeys: Set<string>;
};

function buildMembership(snapshot: Snapshot | null): WeekMembership | null {
  if (!snapshot) return null;
  const emails = new Set<string>();
  const nameKeys = new Set<string>();

  const rows = Array.isArray(snapshot.parsedRows) ? snapshot.parsedRows : [];
  for (const row of rows) {
    const email = normalizeEmail(row?.email);
    if (email) emails.add(email);
    const nameKey = normalizeNameKey(row?.fullName);
    if (nameKey) nameKeys.add(nameKey);
  }

  const highRiskEmails = Array.isArray(snapshot.highRiskEmails) ? snapshot.highRiskEmails : [];
  for (const value of highRiskEmails) {
    const email = normalizeEmail(value);
    if (email) emails.add(email);
  }

  // Legacy snapshots only carry names in offenderList.
  const offenderList = Array.isArray(snapshot.offenderList) ? snapshot.offenderList : [];
  for (const value of offenderList) {
    const nameKey = normalizeNameKey(value);
    if (nameKey) nameKeys.add(nameKey);
  }

  return { emails, nameKeys };
}

type ActiveMember = {
  email: string;
  name: string;
  nameKey: string;
  weeksOnList: number;
};

function collectMembers(snapshot: Snapshot): ActiveMember[] {
  const byKey = new Map<string, ActiveMember>();

  const rows = Array.isArray(snapshot.parsedRows) ? snapshot.parsedRows : [];
  for (const row of rows) {
    const email = normalizeEmail(row?.email);
    const name = typeof row?.fullName === 'string' ? row.fullName.trim() : '';
    const nameKey = normalizeNameKey(name);
    if (!email && !nameKey) continue;
    const key = email || nameKey;
    if (!byKey.has(key)) {
      byKey.set(key, { email, name, nameKey, weeksOnList: 1 });
    }
  }

  // Legacy snapshots without parsedRows emails: fall back to offenderList names.
  if (!byKey.size) {
    const offenderList = Array.isArray(snapshot.offenderList) ? snapshot.offenderList : [];
    for (const value of offenderList) {
      const name = typeof value === 'string' ? value.trim() : '';
      const nameKey = normalizeNameKey(name);
      if (!nameKey || byKey.has(nameKey)) continue;
      byKey.set(nameKey, { email: '', name, nameKey, weeksOnList: 1 });
    }
  }

  return Array.from(byKey.values());
}

/**
 * Counts, for every user on the target week's High Risk list, how many
 * consecutive weekly snapshots (ending at the target week) include them.
 * Walks backwards through the history index and stops per user at the first
 * week they were not on the list.
 */
export async function computeWeekStreaks(
  weekId: string,
  snapshot?: Snapshot | null
): Promise<WeekStreaks | null> {
  const target = snapshot ?? (await fetchSnapshotByWeek(weekId));
  if (!target) return null;

  const members = collectMembers(target);

  const history = await fetchHistoryIndex();
  const olderWeeks = (history.weeks ?? [])
    .map((w) => w.weekId)
    .filter((w) => typeof w === 'string' && w && compareWeekIds(w, weekId) < 0)
    .sort(compareWeekIds)
    .reverse();

  let active = members.filter((m) => m.email || m.nameKey);
  for (const olderWeekId of olderWeeks) {
    if (!active.length) break;
    const olderSnapshot = await fetchSnapshotByWeek(olderWeekId);
    const membership = buildMembership(olderSnapshot);
    if (!membership) break;
    active = active.filter((member) => {
      const present =
        (member.email && membership.emails.has(member.email)) ||
        (member.nameKey && membership.nameKeys.has(member.nameKey));
      if (present) {
        member.weeksOnList += 1;
        return true;
      }
      return false;
    });
  }

  return {
    weekId,
    generatedAt: new Date().toISOString(),
    users: members
      .map(({ email, name, weeksOnList }) => ({ email, name, weeksOnList }))
      .sort((a, b) => b.weeksOnList - a.weeksOnList || a.name.localeCompare(b.name)),
  };
}

export async function saveWeekStreaks(streaks: WeekStreaks): Promise<WeekStreaks> {
  const blob = new Blob([JSON.stringify(streaks)], { type: 'application/json' });
  await putObject(buildStreaksPath(streaks.weekId), blob, {
    allowOverwrite: true,
    contentType: 'application/json',
  });
  return streaks;
}

export async function fetchWeekStreaks(weekId: string): Promise<WeekStreaks | null> {
  try {
    const data = await getObjectJson<WeekStreaks>(buildStreaksPath(weekId));
    if (!data || data.weekId !== weekId || !Array.isArray(data.users)) return null;
    return {
      ...data,
      users: data.users.map((u) => ({
        email: normalizeEmail(u.email),
        name: typeof u.name === 'string' ? u.name.trim() : '',
        weeksOnList: Number.isFinite(u.weeksOnList) && u.weeksOnList > 0 ? u.weeksOnList : 1,
      })),
    };
  } catch (err: unknown) {
    if (isObjectNotFound(err)) {
      return null;
    }
    throw err;
  }
}
