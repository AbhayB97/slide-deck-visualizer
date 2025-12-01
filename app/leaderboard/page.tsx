"use client";

import { useEffect, useState } from "react";

type Leader = {
  name: string;
  count: number;
};

export default function LeaderboardPage() {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [weeks, setWeeks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadLeaderboard() {
      try {
        setLoading(true);
        const res = await fetch("/api/leaderboard");
        if (!res.ok) throw new Error("Could not load leaderboard");
        const json = await res.json();
        setLeaders(json?.leaderboard ?? []);
        setWeeks(json?.weeks ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load leaderboard");
      } finally {
        setLoading(false);
      }
    }

    loadLeaderboard();
  }, []);

  const latestWeek = weeks[0] ?? null;

  return (
    <div className="min-h-screen bg-gray-100 px-6 py-10 flex justify-center">
      <div className="w-full max-w-4xl space-y-6">
        <header className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <p className="text-xs uppercase tracking-wide text-gray-400">Slide Deck Visualizer</p>
          <h1 className="text-3xl font-bold text-gray-900">All-Time Leaderboard</h1>
          <p className="text-sm text-gray-600 mt-2">
            Combined offender counts across all weekly snapshots{" "}
            {latestWeek ? `(latest week: ${latestWeek})` : ""}. Total weeks tracked: {weeks.length}
          </p>
        </header>

        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          {loading && <p className="text-sm text-gray-600">Loading leaderboard...</p>}
          {error && (
            <p className="text-sm text-red-600">
              {error}
            </p>
          )}
          {!loading && !error && leaders.length === 0 && (
            <p className="text-sm text-gray-600">No data available yet.</p>
          )}

          {!loading && !error && leaders.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-gray-500 uppercase tracking-wide text-xs border-b">
                  <tr>
                    <th className="py-2 pr-4">Rank</th>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4 text-right">Incomplete Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leaders.map((leader, idx) => (
                    <tr key={leader.name}>
                      <td className="py-3 pr-4 text-gray-700 font-semibold">{idx + 1}</td>
                      <td className="py-3 pr-4 text-gray-900 font-medium">{leader.name}</td>
                      <td className="py-3 pr-4 text-right text-gray-900">{leader.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
