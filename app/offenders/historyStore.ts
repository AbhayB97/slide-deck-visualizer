"use client";

import { CsvRow } from "./processCsv";

export interface OffenderHistoryItem {
  count: number;
  firstSeen: string;
  lastSeen: string;
  lastTitle: string;
}

type HistoryMap = Record<string, OffenderHistoryItem>;

const STORAGE_KEY = "offender-history";

const hasWindow = () => typeof window !== "undefined";

export const loadHistory = (): HistoryMap => {
  if (!hasWindow()) return {};
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as HistoryMap) : {};
  } catch {
    return {};
  }
};

const persistHistory = (history: HistoryMap) => {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    /* ignore persistence issues */
  }
};

export const updateHistory = (offenders: CsvRow[]): HistoryMap => {
  const history = loadHistory();
  const now = new Date().toISOString();

  offenders.forEach((row) => {
    const sentDate = row.sentDate || now;
    const existing = history[row.fullName];
    history[row.fullName] = {
      count: (existing?.count ?? 0) + 1,
      firstSeen: existing?.firstSeen ?? sentDate,
      lastSeen: sentDate,
      lastTitle: row.title || existing?.lastTitle || "",
    };
  });

  persistHistory(history);
  return history;
};
