import { head } from '@vercel/blob';
import { MASTER_PATH } from '@/lib/processMaster';
import { fetchLatestSnapshot } from '@/lib/snapshots';

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

async function readJsonArray(path: string): Promise<string[]> {
  try {
    const metadata = await head(path, { token: process.env.BLOB_READ_WRITE_TOKEN });
    const res = await fetch(metadata.downloadUrl);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as string[]) : [];
  } catch (err: any) {
    if (err?.status === 404 || err?.statusCode === 404 || err?.code === 'blob_not_found') {
      return [];
    }
    throw err;
  }
}

export async function fetchMasterList(): Promise<string[]> {
  // Back-compat: old master list was a string[], new master list is {email,name}[]
  try {
    const metadata = await head(MASTER_PATH, { token: process.env.BLOB_READ_WRITE_TOKEN });
    const res = await fetch(metadata.downloadUrl);
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data) && data.every((x) => typeof x === 'string')) {
      return data as string[];
    }
    if (Array.isArray(data)) {
      return (data as any[])
        .map((x) => (typeof x?.name === 'string' ? x.name.trim() : ''))
        .filter(Boolean);
    }
    return [];
  } catch (err: any) {
    if (err?.status === 404 || err?.statusCode === 404 || err?.code === 'blob_not_found') {
      return [];
    }
    throw err;
  }
}

export async function fetchMasterUsers(): Promise<{ email: string; name: string }[]> {
  try {
    const metadata = await head(MASTER_PATH, { token: process.env.BLOB_READ_WRITE_TOKEN });
    const res = await fetch(metadata.downloadUrl);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return (data as any[])
      .map((x) => ({
        email: normalizeEmail(x?.email),
        name: typeof x?.name === 'string' ? x.name.trim() : '',
      }))
      .filter((x) => Boolean(x.email) && Boolean(x.name));
  } catch (err: any) {
    if (err?.status === 404 || err?.statusCode === 404 || err?.code === 'blob_not_found') {
      return [];
    }
    throw err;
  }
}

export async function fetchHighRiskUsers(): Promise<string[]> {
  const snapshot = await fetchLatestSnapshot();
  if (!snapshot) return [];
  if (Array.isArray((snapshot as any).highRiskEmails)) {
    return (snapshot as any).highRiskEmails as string[];
  }
  // Back-compat: if old snapshots don't have emails, fall back to name-based offenderList
  return Array.isArray(snapshot.offenderList) ? snapshot.offenderList : [];
}

export async function fetchCurrentLists(): Promise<{
  highRiskUsers: string[];
  rouletteUsers: string[];
  activeUsers: string[];
  masterCount: number;
}> {
  const [masterUsers, highRiskRaw] = await Promise.all([fetchMasterUsers(), fetchHighRiskUsers()]);
  const activeUsers = Array.from(
    new Set(masterUsers.map((u) => u.name.trim()).filter(Boolean))
  );

  const cleanedHighRisk = highRiskRaw.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
  const hasAnyEmail = cleanedHighRisk.some((x) => normalizeEmail(x).includes('@'));

  if (!cleanedHighRisk.length) {
    return {
      highRiskUsers: [],
      rouletteUsers: activeUsers,
      activeUsers,
      masterCount: masterUsers.length,
    };
  }

  if (!hasAnyEmail) {
    // Back-compat mode: old snapshots only contained names (offenderList). Subtract by name keys.
    const riskNameKeySet = new Set(cleanedHighRisk.map(normalizeNameKey).filter(Boolean));
    const roulette = masterUsers
      .filter((u) => !riskNameKeySet.has(normalizeNameKey(u.name)))
      .map((u) => u.name);

    return {
      highRiskUsers: cleanedHighRisk,
      rouletteUsers: Array.from(new Set(roulette.filter(Boolean))),
      activeUsers,
      masterCount: masterUsers.length,
    };
  }

  const riskEmailSet = new Set(cleanedHighRisk.map(normalizeEmail).filter(Boolean));

  const roulette = masterUsers
    .filter((u) => !riskEmailSet.has(u.email))
    .map((u) => u.name);

  return {
    highRiskUsers: Array.from(riskEmailSet),
    rouletteUsers: Array.from(new Set(roulette.filter(Boolean))),
    activeUsers,
    masterCount: masterUsers.length,
  };
}
