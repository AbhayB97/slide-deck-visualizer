import { head } from '@vercel/blob';
import { MASTER_PATH } from '@/lib/processMaster';
import { SNAPSHOT_PATH } from '@/lib/storage';
import { fetchLatestSnapshot } from '@/lib/snapshots';

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
  return readJsonArray(MASTER_PATH);
}

export async function fetchHighRiskUsers(): Promise<string[]> {
  const snapshot = await fetchLatestSnapshot();
  if (!snapshot) return [];
  return Array.isArray(snapshot.offenderList) ? snapshot.offenderList : [];
}

export async function fetchCurrentLists(): Promise<{
  highRiskUsers: string[];
  rouletteUsers: string[];
}> {
  const [master, highRisk] = await Promise.all([fetchMasterList(), fetchHighRiskUsers()]);
  const riskSet = new Set(highRisk.map((n) => n.trim()).filter(Boolean));
  const roulette = master
    .map((n) => (typeof n === 'string' ? n.trim() : ''))
    .filter(Boolean)
    .filter((n) => !riskSet.has(n));

  return { highRiskUsers: highRisk, rouletteUsers: roulette };
}
