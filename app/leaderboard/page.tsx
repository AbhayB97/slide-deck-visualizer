"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, Loader2, AlertCircle } from "lucide-react";

type LeaderboardEntry = {
  name: string;
  count: number;
};

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [weekCount, setWeekCount] = useState(0);
  const [snapshotCount, setSnapshotCount] = useState(0);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  async function loadLeaderboard() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/leaderboard");
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Failed to load leaderboard");
      }
      setEntries(json.leaderboard ?? []);
      setWeekCount(json.weeks?.length ?? 0);
      setSnapshotCount(json.snapshotCount ?? 0);
    } catch (err: any) {
      setError(err?.message || "Failed to load leaderboard");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        <Loader2 className="animate-spin mr-3" /> Building leaderboard...
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-red-600 px-4 text-center">
        <AlertCircle size={48} className="mb-4" />
        <p className="text-xl font-bold">Cannot load leaderboard</p>
        <p className="mt-2">{error}</p>
        <button
          onClick={loadLeaderboard}
          className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-md"
        >
          Retry
        </button>
        <Link href="/" className="mt-3 text-sm text-blue-700 underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 px-6 py-10 flex justify-center font-sans">
      <div className="w-full max-w-5xl flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">All time</p>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Trophy className="text-amber-500" /> Offender Leaderboard
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Aggregated incomplete items across {weekCount} week(s).
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/"
              className="px-4 py-2 rounded-lg border bg-white text-gray-700 text-sm font-medium shadow-sm"
            >
              Back to Dashboard
            </Link>
            <button
              onClick={loadLeaderboard}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold shadow-sm"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="bg-white border rounded-2xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4 text-sm text-gray-600">
            <span>People: {entries.length}</span>
            <span>Snapshots: {snapshotCount}</span>
          </div>
          {entries.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              No leaderboard data yet. Upload snapshots to populate this view.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {entries.map((entry, idx) => (
                <li
                  key={entry.name}
                  className="flex items-center justify-between py-3 gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 font-bold">
                      {idx + 1}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{entry.name}</p>
                      <p className="text-xs text-gray-500">Total incomplete items</p>
                    </div>
                  </div>
                  <div className="text-xl font-bold text-gray-900">{entry.count}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
