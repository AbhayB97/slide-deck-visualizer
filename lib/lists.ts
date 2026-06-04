import { getObjectJson, headObject, isObjectNotFound } from '@/lib/objectStorage';
import { MASTER_PATH } from '@/lib/processMaster';
import { fetchLatestSnapshot } from '@/lib/snapshots';

export type MasterFileMetadata = {
  uploadedAt: string | null;
};

type MasterUserRecord = {
  email?: unknown;
  name?: unknown;
};

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

export async function fetchMasterList(): Promise<string[]> {
  // Back-compat: old master list was a string[], new master list is {email,name}[]
  try {
    const data = await getObjectJson<unknown>(MASTER_PATH);
    if (Array.isArray(data) && data.every((x) => typeof x === 'string')) {
      return data as string[];
    }
    if (Array.isArray(data)) {
      return data
        .map((x) => (typeof x?.name === 'string' ? x.name.trim() : ''))
        .filter(Boolean);
    }
    return [];
  } catch (err: unknown) {
    if (isObjectNotFound(err)) {
      return [];
    }
    throw err;
  }
}

export async function fetchMasterUsers(): Promise<{ email: string; name: string }[]> {
  try {
    const data = await getObjectJson<unknown>(MASTER_PATH);
    if (!Array.isArray(data)) return [];
    return (data as MasterUserRecord[])
      .map((x) => ({
        email: normalizeEmail(x?.email),
        name: typeof x?.name === 'string' ? x.name.trim() : '',
      }))
      .filter((x) => Boolean(x.email) && Boolean(x.name));
  } catch (err: unknown) {
    if (isObjectNotFound(err)) {
      return [];
    }
    throw err;
  }
}

export async function fetchMasterFileMetadata(): Promise<MasterFileMetadata> {
  try {
    const metadata = await headObject(MASTER_PATH);
    const rawUploadedAt = metadata.lastModified;
    const uploadedAt =
      typeof rawUploadedAt === 'string'
        ? rawUploadedAt
        : null;

    return { uploadedAt };
  } catch (err: unknown) {
    if (isObjectNotFound(err)) {
      return { uploadedAt: null };
    }
    throw err;
  }
}

export async function fetchHighRiskUsers(): Promise<string[]> {
  const snapshot = await fetchLatestSnapshot();
  if (!snapshot) return [];
  if (Array.isArray(snapshot.highRiskEmails)) {
    return snapshot.highRiskEmails;
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
