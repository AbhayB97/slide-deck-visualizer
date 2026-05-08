"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type CheckpointResponse = {
  success: boolean;
  totalCheckpoints: number;
  summary?: {
    recurringUsers: number;
    persistentUsers: number;
    highestPersistence: number;
    latestCheckpoint?: { checkpointDate?: string } | null;
  };
  timeline?: Array<{
    checkpointId: string;
    checkpointDate: string;
    userCount: number;
    repeatUserCount: number;
    newUserCount: number;
  }>;
  users?: Array<{
    email: string;
    displayName: string;
    checkpointsOnList: number;
    firstSeenCheckpointDate: string | null;
    lastSeenCheckpointDate: string | null;
  }>;
  error?: string;
};

export default function CheckpointAnalyticsPage() {
  const [data, setData] = useState<CheckpointResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [minimum, setMinimum] = useState(2);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        setLoading(true);
        const response = await fetch("/api/checkpoints");
        const json = (await response.json()) as CheckpointResponse;
        if (!active) return;
        setData(json);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  const filteredUsers = (data?.users ?? []).filter((user) => {
    const matchesMinimum = user.checkpointsOnList >= minimum;
    const haystack = `${user.displayName} ${user.email}`.toLowerCase();
    return matchesMinimum && haystack.includes(query.trim().toLowerCase());
  });

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f6efe0_35%,#ece4d0_100%)] px-4 py-8 text-stone-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="rounded-[2rem] border border-stone-300/70 bg-white/85 p-6 shadow-[0_25px_80px_rgba(120,93,35,0.12)] backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-700">
                Reporting Surface
              </p>
              <h1 className="mt-2 text-4xl font-black tracking-tight text-stone-950">
                Checkpoint Analytics
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-stone-600">
                Follow recurring high-risk appearances over checkpoint cycles, separate repeat exposure
                from one-off spikes, and drill into who continues to appear.
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-stone-300 bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
            >
              Back to dashboard
            </Link>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Total Checkpoints" value={data?.totalCheckpoints ?? 0} />
          <MetricCard label="Recurring Users" value={data?.summary?.recurringUsers ?? 0} />
          <MetricCard label="Persistent Users" value={data?.summary?.persistentUsers ?? 0} />
          <MetricCard
            label="Highest Persistence"
            value={data?.summary?.highestPersistence ?? 0}
            detail={data?.summary?.latestCheckpoint?.checkpointDate ?? "No checkpoint history"}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
          <div className="rounded-[2rem] border border-stone-300/70 bg-white/85 p-6 shadow-[0_25px_70px_rgba(120,93,35,0.1)]">
            <div className="mb-5">
              <h2 className="text-2xl font-black text-stone-950">Checkpoint Trend</h2>
              <p className="mt-1 text-sm text-stone-600">
                Total users on each checkpoint, plus how many were repeat appearances.
              </p>
            </div>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.timeline ?? []}>
                  <CartesianGrid vertical={false} stroke="#e7decf" />
                  <XAxis dataKey="checkpointDate" tick={{ fill: "#6b5c43", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#6b5c43", fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="userCount" fill="#1f6f78" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="repeatUserCount" fill="#c06c2f" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-[2rem] border border-stone-300/70 bg-white/85 p-6 shadow-[0_25px_70px_rgba(120,93,35,0.1)]">
            <div className="mb-5">
              <h2 className="text-2xl font-black text-stone-950">Filters</h2>
              <p className="mt-1 text-sm text-stone-600">
                Focus the recurring-user leaderboard by minimum appearances and name or email.
              </p>
            </div>
            <div className="space-y-4">
              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Search
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 outline-none transition focus:border-stone-950"
                  placeholder="Search by name or email"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Minimum checkpoint appearances
                <input
                  type="range"
                  min={1}
                  max={Math.max(4, data?.summary?.highestPersistence ?? 4)}
                  value={minimum}
                  onChange={(event) => setMinimum(Number(event.target.value))}
                />
                <span className="text-sm text-stone-500">{minimum}+ appearances</span>
              </label>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-stone-300/70 bg-white/85 p-6 shadow-[0_25px_70px_rgba(120,93,35,0.1)]">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-black text-stone-950">Recurring Users</h2>
              <p className="mt-1 text-sm text-stone-600">
                Names with repeated checkpoint exposure, ordered by frequency.
              </p>
            </div>
            <p className="text-sm text-stone-500">{filteredUsers.length} users match the active filter</p>
          </div>

          {loading ? (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 px-6 py-16 text-center text-stone-500">
              Loading checkpoint analytics...
            </div>
          ) : (
            <div className="overflow-hidden rounded-3xl border border-stone-200">
              <table className="min-w-full divide-y divide-stone-200 text-sm">
                <thead className="bg-stone-100 text-left text-xs uppercase tracking-[0.22em] text-stone-500">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Appearances</th>
                    <th className="px-4 py-3">First Seen</th>
                    <th className="px-4 py-3">Last Seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 bg-white">
                  {filteredUsers.map((user) => (
                    <tr key={user.email}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-stone-900">{user.displayName}</div>
                        <div className="text-xs text-stone-500">{user.email}</div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-stone-900">
                        {user.checkpointsOnList}
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        {user.firstSeenCheckpointDate ?? "Unknown"}
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        {user.lastSeenCheckpointDate ?? "Unknown"}
                      </td>
                    </tr>
                  ))}
                  {!filteredUsers.length && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-stone-500">
                        No users match the current filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail?: string;
}) {
  return (
    <article className="rounded-[2rem] border border-stone-300/70 bg-white/85 p-5 shadow-[0_25px_70px_rgba(120,93,35,0.1)]">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">{label}</p>
      <p className="mt-3 text-4xl font-black tracking-tight text-stone-950">{value}</p>
      {detail ? <p className="mt-2 text-sm text-stone-600">{detail}</p> : null}
    </article>
  );
}
