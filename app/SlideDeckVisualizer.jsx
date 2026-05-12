"use client";

import React, { useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  ChevronRight,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  buildCheckpointPanelModel,
  buildComparisonModel,
  buildStatusModel,
  buildTitleHotspots,
  buildTrendModel,
  buildUserProfiles,
  getPendingDays,
  normalizeNameKey,
  shortName,
} from "@/lib/reporting";

const NO_SNAPSHOT_MESSAGE =
  "No weekly snapshot is available yet. Upload a file from the admin workflow to populate reporting.";

function formatPercent(value) {
  if (!Number.isFinite(value)) return "--";
  return `${Math.round(value)}%`;
}

function formatDelta(value, suffix = "") {
  if (!Number.isFinite(value)) return "No comparison";
  if (value === 0) return `Flat${suffix}`;
  const direction = value > 0 ? "+" : "";
  return `${direction}${Math.round(value * 10) / 10}${suffix}`;
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function statusTone(status) {
  if (status === "not started") return "bg-rose-100 text-rose-800";
  if (status === "in progress") return "bg-amber-100 text-amber-800";
  return "bg-stone-100 text-stone-700";
}

function lerpColor(c1, c2, t) {
  return {
    r: Math.round(c1.r + (c2.r - c1.r) * t),
    g: Math.round(c1.g + (c2.g - c1.g) * t),
    b: Math.round(c1.b + (c2.b - c1.b) * t),
  };
}

function toRgb({ r, g, b }) {
  return `rgb(${r},${g},${b})`;
}

function getRiskStyle(ratio) {
  // 0 = low risk (cool blue), 1 = high risk (warm rose), 3-stop via amber midpoint
  const low  = { light: { r: 239, g: 246, b: 255 }, dark: { r: 219, g: 234, b: 254 }, border: { r: 147, g: 197, b: 253 } };
  const mid  = { light: { r: 255, g: 251, b: 235 }, dark: { r: 254, g: 243, b: 199 }, border: { r: 252, g: 211, b: 77  } };
  const high = { light: { r: 255, g: 241, b: 242 }, dark: { r: 254, g: 205, b: 211 }, border: { r: 252, g: 165, b: 165 } };
  const t = ratio <= 0.5 ? ratio * 2 : (ratio - 0.5) * 2;
  const from = ratio <= 0.5 ? low : mid;
  const to   = ratio <= 0.5 ? mid : high;
  return {
    background:  `linear-gradient(145deg, ${toRgb(lerpColor(from.light, to.light, t))} 0%, ${toRgb(lerpColor(from.dark, to.dark, t))} 100%)`,
    borderColor: toRgb(lerpColor(from.border, to.border, t)),
  };
}

export default function SlideDeckVisualizer() {
  const [selectedWeek, setSelectedWeek] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [history, setHistory] = useState([]);
  const [masterCount, setMasterCount] = useState(0);
  const [metrics, setMetrics] = useState(null);
  const [checkpoints, setCheckpoints] = useState({ users: [], timeline: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusNotice, setStatusNotice] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [segmentFilter, setSegmentFilter] = useState("all");
  const [titleFilter, setTitleFilter] = useState("");
  const [query, setQuery] = useState("");
  const [selectedUserKey, setSelectedUserKey] = useState(null);

  const orderedWeeks = [...history].sort((a, b) =>
    String(b?.weekId ?? "").localeCompare(String(a?.weekId ?? ""), undefined, { numeric: true })
  );

  async function loadDashboard(nextWeek = selectedWeek) {
    try {
      setLoading(true);
      setError(null);
      const [historyRes, listsRes, checkpointRes] = await Promise.all([
        fetch("/api/history"),
        fetch("/api/current-lists"),
        fetch("/api/checkpoints"),
      ]);

      const historyJson = await historyRes.json().catch(() => ({}));
      const listsJson = await listsRes.json().catch(() => ({}));
      const checkpointJson = await checkpointRes.json().catch(() => ({}));

      const weeks = Array.isArray(historyJson?.history?.weeks) ? historyJson.history.weeks : [];
      const resolvedWeek =
        nextWeek || weeks[0]?.weekId || snapshot?.weekId || "";
      const snapshotEndpoint = resolvedWeek
        ? `/api/snapshot?week=${encodeURIComponent(resolvedWeek)}`
        : "/api/latest-snapshot";

      const [snapshotRes, metricsRes] = await Promise.all([
        fetch(snapshotEndpoint),
        resolvedWeek ? fetch(`/api/metrics?week=${encodeURIComponent(resolvedWeek)}`) : Promise.resolve(null),
      ]);

      const snapshotJson = await snapshotRes.json().catch(() => ({}));
      const metricsJson = metricsRes ? await metricsRes.json().catch(() => ({})) : {};

      setHistory(weeks);
      setMasterCount(Number.isFinite(listsJson?.masterCount) ? listsJson.masterCount : 0);
      setCheckpoints({
        users: Array.isArray(checkpointJson?.users) ? checkpointJson.users : [],
        timeline: Array.isArray(checkpointJson?.timeline) ? checkpointJson.timeline : [],
        summary: checkpointJson?.summary ?? null,
      });

      if (!snapshotRes.ok || !snapshotJson?.snapshot) {
        setSnapshot(null);
        setMetrics(null);
        setStatusNotice({
          type: "missing",
          message: snapshotJson?.error || NO_SNAPSHOT_MESSAGE,
        });
        return;
      }

      const nextSnapshot = snapshotJson.snapshot;
      const parsedRows = Array.isArray(nextSnapshot?.parsedRows) ? nextSnapshot.parsedRows : [];

      setSnapshot({ ...nextSnapshot, parsedRows });
      setSelectedWeek(nextSnapshot.weekId ?? resolvedWeek);
      setMetrics(metricsJson?.success ? metricsJson.metrics : null);
      setStatusNotice(
        parsedRows.length
          ? null
          : {
              type: "empty",
              message:
                "This week has no incomplete rows. That likely means a true clean week, but confirm the CSV and mappings if that looks unusual.",
            }
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // The initial load is intentionally one-shot.
    void loadDashboard("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parsedRows = Array.isArray(snapshot?.parsedRows) ? snapshot.parsedRows : [];
  const trendModel = buildTrendModel(orderedWeeks, masterCount);
  const statusModel = buildStatusModel(parsedRows);
  const comparisonModel = buildComparisonModel(
    parsedRows,
    Array.isArray(metrics?.users) ? metrics.users : [],
    metrics?.prevWeekId
  );
  const titleHotspots = buildTitleHotspots(parsedRows);
  const checkpointPanel = buildCheckpointPanelModel(checkpoints.users, checkpoints.timeline);
  const userProfiles = buildUserProfiles(
    parsedRows,
    Array.isArray(metrics?.users) ? metrics.users : [],
    checkpoints.users
  );

  const selectedSegmentKeys =
    segmentFilter !== "all"
      ? new Set((comparisonModel.buckets?.[segmentFilter] ?? []).map((user) => user.key))
      : null;
  const selectedStatusKeys =
    statusFilter !== "all"
      ? new Set(
          (statusModel.usersByStatus?.[statusFilter] ?? []).map((name) => normalizeNameKey(name))
        )
      : null;

  const visibleProfiles = Object.values(userProfiles)
    .filter((profile) => {
      if (selectedSegmentKeys && !selectedSegmentKeys.has(profile.key)) return false;
      if (selectedStatusKeys && !selectedStatusKeys.has(profile.key)) return false;
      if (titleFilter && !profile.titleCounts.some((title) => title.title === titleFilter)) return false;
      const haystack = `${profile.name} ${profile.email}`.toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    })
    .sort((a, b) => {
      const aDays = Number.isFinite(a.oldestOpenDays) ? a.oldestOpenDays : -1;
      const bDays = Number.isFinite(b.oldestOpenDays) ? b.oldestOpenDays : -1;
      return b.sessionCount - a.sessionCount || bDays - aDays;
    });

  const maxSessionCount = visibleProfiles.length > 0 ? visibleProfiles[0].sessionCount : 1;
  const minSessionCount = visibleProfiles.length > 0 ? visibleProfiles[visibleProfiles.length - 1].sessionCount : 1;

  const selectedProfile = selectedUserKey ? userProfiles[selectedUserKey] ?? null : null;
  const latestTrend = trendModel.latest;
  const latestWeekLabel = snapshot?.weekId || latestTrend?.weekId || "Latest week";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#f8f0da_0%,#ede2cc_42%,#e5d7bb_100%)] text-stone-700">
        <Loader2 className="mr-3 h-5 w-5 animate-spin" /> Loading reporting surface...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#f8f0da_0%,#ede2cc_42%,#e5d7bb_100%)] px-4">
        <div className="max-w-xl rounded-[2rem] border border-rose-300 bg-white/90 p-8 text-center shadow-[0_30px_90px_rgba(120,93,35,0.12)]">
          <AlertCircle className="mx-auto h-10 w-10 text-rose-600" />
          <h1 className="mt-4 text-3xl font-black text-stone-950">Cannot load dashboard</h1>
          <p className="mt-3 text-sm text-stone-600">{error}</p>
          <button
            type="button"
            onClick={() => void loadDashboard(selectedWeek)}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff7e6_0%,#efe6d1_38%,#e7dbc1_100%)] px-4 py-6 text-stone-900 sm:px-5">
      <div className="flex w-full flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-stone-300/70 bg-white/80 p-6 shadow-[0_25px_80px_rgba(120,93,35,0.12)] backdrop-blur">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.34em] text-amber-700">
                Current Week Dashboard
              </p>
              <h1 className="mt-3 text-3xl font-black tracking-tight text-stone-950 sm:text-4xl">
                Incomplete Sessions Requiring Action
              </h1>
              <p className="mt-3 text-sm leading-6 text-stone-600">
                The homepage starts with the current-week incomplete list. Trend and supporting analytics remain below.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[380px]">
              <QuickStat
                label="Selected Week"
                value={latestWeekLabel}
                tone="amber"
                detail={`Uploaded ${formatDate(snapshot?.uploadedAt)}`}
              />
              <QuickStat
                label="Completion Rate"
                value={formatPercent(latestTrend?.completionRate)}
                tone="emerald"
                detail={formatDelta(trendModel.deltaCompletionRate, " pts vs prior")}
              />
              <QuickStat
                label="People On List"
                value={String(latestTrend?.peopleOnList ?? 0)}
                tone="stone"
                detail={formatDelta(trendModel.deltaPeople, " vs prior")}
              />
              <QuickStat
                label="Incomplete Items"
                value={String(latestTrend?.incompleteItems ?? 0)}
                tone="rose"
                detail={formatDelta(trendModel.deltaIncomplete, " vs prior")}
              />
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-medium text-stone-700" htmlFor="week-select">
                Week
              </label>
              <select
                id="week-select"
                value={selectedWeek}
                onChange={(event) => {
                  const nextWeek = event.target.value;
                  setSelectedWeek(nextWeek);
                  void loadDashboard(nextWeek);
                }}
                className="rounded-full border border-stone-300 bg-stone-50 px-4 py-2 text-sm outline-none transition focus:border-stone-950"
              >
                {orderedWeeks.map((week) => (
                  <option key={week.weekId} value={week.weekId}>
                    {week.weekId} ({week.totalIncomplete ?? week.offenderCount ?? 0} incomplete)
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void loadDashboard(selectedWeek)}
                className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-500 hover:bg-stone-50"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/checkpoints"
                className="inline-flex items-center gap-2 rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800"
              >
                Checkpoint Analytics
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/draw/slot-machine"
                className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-500 hover:bg-stone-50"
              >
                Open Draw
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {statusNotice ? (
          <section className="rounded-[2rem] border border-amber-300/70 bg-amber-50/85 p-5 text-stone-700 shadow-[0_20px_60px_rgba(120,93,35,0.08)]">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-amber-700" />
              <div>
                <p className="text-base font-semibold text-stone-900">
                  {statusNotice.type === "empty" ? "Zero incomplete rows detected" : "Snapshot unavailable"}
                </p>
                <p className="mt-1 text-sm">{statusNotice.message}</p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="rounded-[2rem] border border-stone-300/70 bg-white/85 p-6 shadow-[0_25px_70px_rgba(120,93,35,0.1)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stone-500">Current Week List</p>
              <h2 className="mt-2 text-3xl font-black text-stone-950">People With Incomplete Sessions</h2>
              <p className="mt-2 text-sm text-stone-600">
                Open the dashboard and scan the full current-week list without fighting a nested scroll area.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Search
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 outline-none transition focus:border-stone-950"
                  placeholder="Name or email"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Status filter
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 outline-none transition focus:border-stone-950"
                >
                  <option value="all">All statuses</option>
                  <option value="not started">Not Started</option>
                  <option value="in progress">In Progress</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-stone-700">
                Title hotspot
                <select
                  value={titleFilter}
                  onChange={(event) => setTitleFilter(event.target.value)}
                  className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 outline-none transition focus:border-stone-950"
                >
                  <option value="">All titles</option>
                  {titleHotspots.map((title) => (
                    <option key={title.title} value={title.title}>
                      {title.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-6 grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
            {visibleProfiles.map((profile) => {
              const ratio =
                maxSessionCount === minSessionCount
                  ? 0.5
                  : (profile.sessionCount - minSessionCount) / (maxSessionCount - minSessionCount);
              return (
              <button
                key={profile.key}
                type="button"
                onClick={() => setSelectedUserKey(profile.key)}
                style={getRiskStyle(ratio)}
                className="rounded-[1.6rem] border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold text-stone-950">{shortName(profile.name)}</p>
                    <p className="mt-1 truncate text-xs text-stone-500">{profile.email || "No email available"}</p>
                  </div>
                  <span className="rounded-full bg-stone-950 px-3 py-1 text-sm font-bold text-white">
                    {profile.sessionCount}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {profile.statusCounts.slice(0, 2).map((status) => (
                    <span
                      key={`${profile.key}-${status.label}`}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(
                        status.label.toLowerCase()
                      )}`}
                    >
                      {status.label}: {status.value}
                    </span>
                  ))}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-stone-500">Oldest Open</p>
                    <p className="mt-1 font-semibold text-stone-900">
                      {profile.oldestOpenDays !== null ? `${profile.oldestOpenDays}d` : "Unknown"}
                    </p>
                  </div>
                  <div>
                    <p className="text-stone-500">Week Change</p>
                    <p className="mt-1 font-semibold text-stone-900">
                      {profile.deltaFromPrevWeek === null ? "No comparison" : formatDelta(profile.deltaFromPrevWeek)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-sm">
                  <div className="text-stone-600">
                    {profile.checkpoint ? (
                      <>
                        <span className="font-semibold text-stone-900">
                          {profile.checkpoint.checkpointsOnList} checkpoint
                          {profile.checkpoint.checkpointsOnList === 1 ? "" : "s"}
                        </span>
                        <p className="mt-1 text-xs text-stone-500">
                          Last seen {profile.checkpoint.lastSeenCheckpointDate ?? "Unknown"}
                        </p>
                      </>
                    ) : (
                      <span className="text-stone-400">No checkpoint history</span>
                    )}
                  </div>
                  <span className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-700">
                    Open profile
                  </span>
                </div>
              </button>
              );
            })}

            {!visibleProfiles.length ? (
              <div className="col-span-full rounded-[1.4rem] border border-dashed border-stone-300 bg-stone-50 px-4 py-10 text-center text-sm text-stone-500">
                No users match the current filter combination.
              </div>
            ) : null}
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.9fr]">
          <Panel
            title="Trend Overview"
            description="Weekly incomplete items, people on the list, and completion rate over time."
          >
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[...(trendModel.weeks ?? [])].reverse()}>
                  <defs>
                    <linearGradient id="incompleteFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#b45309" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#b45309" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#eadfcf" />
                  <XAxis dataKey="weekId" tick={{ fill: "#6b5c43", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#6b5c43", fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Area type="monotone" dataKey="incompleteItems" stroke="#b45309" fill="url(#incompleteFill)" strokeWidth={3} />
                  <Area type="monotone" dataKey="peopleOnList" stroke="#155e75" fill="#155e7520" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel
            title="Leadership Readout"
            description="Short narrative signals for the current week."
          >
            <div className="grid gap-4">
              <NarrativeCard
                title="What changed"
                body={
                  metrics?.prevWeekId
                    ? `${comparisonModel.summary.find((item) => item.id === "worsened")?.count ?? 0} users carry a higher load than ${metrics.prevWeekId}. ${comparisonModel.summary.find((item) => item.id === "improved")?.count ?? 0} improved.`
                    : "Week-over-week comparison is unavailable until a prior week exists."
                }
              />
              <NarrativeCard
                title="Status split"
                body={`${statusModel.totals.notStarted} sessions are not started and ${statusModel.totals.inProgress} are still in progress.`}
              />
              <NarrativeCard
                title="Persistent risk"
                body={`${checkpointPanel.summary.repeaters} users have appeared on at least two checkpoints. ${checkpointPanel.summary.persistent} have appeared three or more times.`}
              />
            </div>
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Panel
            title="Week-Over-Week Segmentation"
            description={
              comparisonModel.prevWeekId
                ? `Click a bucket to filter the user narrative by change versus ${comparisonModel.prevWeekId}.`
                : "A prior week is required before segmentation can classify movement."
            }
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {comparisonModel.summary.map((segment) => {
                const active = segmentFilter === segment.id;
                return (
                  <button
                    key={segment.id}
                    type="button"
                    onClick={() => setSegmentFilter(active ? "all" : segment.id)}
                    className={`rounded-[1.6rem] border px-4 py-4 text-left transition ${
                      active
                        ? "border-stone-950 bg-stone-950 text-white shadow-[0_20px_50px_rgba(41,37,36,0.25)]"
                        : "border-stone-200 bg-stone-50 text-stone-900 hover:border-stone-400"
                    }`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">{segment.label}</p>
                    <p className="mt-3 text-4xl font-black">{segment.count}</p>
                    <p className="mt-2 text-sm opacity-80">{segment.description}</p>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="Status Split" description="Current-week risk mix and age of open sessions.">
            <div className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <FilterTile
                  active={statusFilter === "not started"}
                  label="Not Started"
                  value={statusModel.totals.notStarted}
                  onClick={() => setStatusFilter(statusFilter === "not started" ? "all" : "not started")}
                />
                <FilterTile
                  active={statusFilter === "in progress"}
                  label="In Progress"
                  value={statusModel.totals.inProgress}
                  onClick={() => setStatusFilter(statusFilter === "in progress" ? "all" : "in progress")}
                />
              </div>
              <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
                <div className="h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusModel.distributions}
                        dataKey="value"
                        nameKey="label"
                        innerRadius={42}
                        outerRadius={70}
                        paddingAngle={4}
                      >
                        <Cell fill="#be123c" />
                        <Cell fill="#d97706" />
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {statusModel.agingBuckets.map((bucket) => (
                    <div key={bucket.label}>
                      <div className="mb-1 flex items-center justify-between text-sm text-stone-600">
                        <span>{bucket.label}</span>
                        <span>{bucket.count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-stone-100">
                        <div
                          className="h-2 rounded-full bg-stone-900"
                          style={{
                            width: `${statusModel.totals.all ? (bucket.count / statusModel.totals.all) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Panel title="Title Hotspots" description="Top incomplete training titles for the selected week.">
            <div className="space-y-3">
              {titleHotspots.map((title) => (
                <button
                  key={title.title}
                  type="button"
                  onClick={() => setTitleFilter(titleFilter === title.title ? "" : title.title)}
                  className={`flex w-full items-center justify-between rounded-[1.4rem] border px-4 py-4 text-left transition ${
                    titleFilter === title.title
                      ? "border-stone-950 bg-stone-950 text-white"
                      : "border-stone-200 bg-stone-50 hover:border-stone-400"
                  }`}
                >
                  <div>
                    <p className="text-sm font-semibold">{title.title}</p>
                    <p className="mt-1 text-xs opacity-75">{title.userCount} affected users</p>
                  </div>
                  <p className="text-3xl font-black">{title.incompleteCount}</p>
                </button>
              ))}
              {!titleHotspots.length ? (
                <div className="rounded-[1.4rem] border border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center text-sm text-stone-500">
                  No hotspot titles are available for this week.
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel title="Checkpoint Persistence" description="Users with repeat checkpoint exposure.">
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-3">
                {checkpointPanel.topRecurring.map((user) => (
                  <div
                    key={user.email}
                    className="rounded-[1.4rem] border border-stone-200 bg-stone-50 px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-stone-900">{shortName(user.name)}</p>
                        <p className="mt-1 text-xs text-stone-500">
                          Last seen {user.lastSeenCheckpointDate ?? "Unknown"}
                        </p>
                      </div>
                      <p className="text-3xl font-black text-stone-950">{user.checkpointsOnList}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={checkpointPanel.timeline}>
                    <CartesianGrid vertical={false} stroke="#eadfcf" />
                    <XAxis dataKey="checkpointDate" tick={{ fill: "#6b5c43", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#6b5c43", fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="userCount" fill="#57534e" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Panel>
        </section>

      </div>

      <UserDetailDialog profile={selectedProfile} onClose={() => setSelectedUserKey(null)} />
    </main>
  );
}

function Panel({ title, description, children }) {
  return (
    <section className="rounded-[2rem] border border-stone-300/70 bg-white/85 p-6 shadow-[0_25px_70px_rgba(120,93,35,0.1)]">
      <div className="mb-5">
        <h2 className="text-2xl font-black text-stone-950">{title}</h2>
        <p className="mt-1 text-sm text-stone-600">{description}</p>
      </div>
      {children}
    </section>
  );
}

function QuickStat({ label, value, detail, tone }) {
  const tones = {
    amber: "border-amber-300 bg-amber-50 text-amber-950",
    emerald: "border-emerald-300 bg-emerald-50 text-emerald-950",
    rose: "border-rose-300 bg-rose-50 text-rose-950",
    stone: "border-stone-300 bg-stone-50 text-stone-950",
  };
  return (
    <article className={`rounded-[1.6rem] border p-4 ${tones[tone] ?? tones.stone}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight">{value}</p>
      <p className="mt-2 text-sm opacity-80">{detail}</p>
    </article>
  );
}

function NarrativeCard({ title, body }) {
  return (
    <article className="rounded-[1.6rem] border border-stone-200 bg-stone-50 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">{title}</p>
      <p className="mt-3 text-sm leading-6 text-stone-700">{body}</p>
    </article>
  );
}

function FilterTile({ label, value, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[1.4rem] border px-4 py-4 text-left transition ${
        active ? "border-stone-950 bg-stone-950 text-white" : "border-stone-200 bg-stone-50 text-stone-900"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">{label}</p>
      <p className="mt-2 text-4xl font-black">{value}</p>
    </button>
  );
}

function UserDetailDialog({ profile, onClose }) {
  const panelRef = useRef(null);
  const closeButtonRef = useRef(null);
  const lastFocusRef = useRef(null);

  const handleKeyDown = useEffectEvent((event) => {
    if (!panelRef.current) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = panelRef.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  useEffect(() => {
    if (!profile) return;
    lastFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const listener = (event) => handleKeyDown(event);
    document.addEventListener("keydown", listener);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", listener);
      lastFocusRef.current?.focus?.();
    };
  }, [profile]);

  if (!profile) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 px-4 py-6 backdrop-blur-sm">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-profile-title"
        className="w-full max-w-4xl overflow-hidden rounded-[2rem] border border-stone-300 bg-white shadow-[0_30px_120px_rgba(41,37,36,0.35)]"
      >
        <div className="flex flex-col gap-4 border-b border-stone-200 bg-stone-50 px-6 py-5 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">Narrative Profile</p>
            <h2 id="user-profile-title" className="mt-2 text-3xl font-black text-stone-950">
              {profile.name}
            </h2>
            <p className="mt-2 text-sm text-stone-600">{profile.email || "No email available"}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-500 hover:bg-stone-50"
          >
            Close
          </button>
        </div>

        <div className="max-h-[75vh] overflow-y-auto px-6 py-6">
          <div className="grid gap-4 lg:grid-cols-4">
            <QuickStat label="Open Sessions" value={String(profile.sessionCount)} detail="Current week" tone="stone" />
            <QuickStat
              label="Oldest Open"
              value={profile.oldestOpenDays !== null ? `${profile.oldestOpenDays}d` : "--"}
              detail={profile.oldestOpenDate ? formatDate(profile.oldestOpenDate) : "Unknown sent date"}
              tone="rose"
            />
            <QuickStat
              label="Week Change"
              value={profile.deltaFromPrevWeek === null ? "--" : formatDelta(profile.deltaFromPrevWeek)}
              detail="Compared with prior week"
              tone="amber"
            />
            <QuickStat
              label="Checkpoint Count"
              value={String(profile.checkpoint?.checkpointsOnList ?? 0)}
              detail={profile.checkpoint?.lastSeenCheckpointDate ?? "No checkpoint history"}
              tone="emerald"
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4">
              <div className="rounded-[1.6rem] border border-stone-200 bg-stone-50 p-4">
                <h3 className="text-lg font-black text-stone-950">Status Mix</h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  {profile.statusCounts.map((status) => (
                    <span
                      key={status.label}
                      className={`rounded-full px-3 py-2 text-sm font-semibold ${statusTone(status.label.toLowerCase())}`}
                    >
                      {status.label}: {status.value}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-[1.6rem] border border-stone-200 bg-stone-50 p-4">
                <h3 className="text-lg font-black text-stone-950">Age Narrative</h3>
                <div className="mt-4 space-y-3 text-sm text-stone-600">
                  <p>Fresh (0-7 days): {profile.ageBuckets.fresh}</p>
                  <p>Aging (8-14 days): {profile.ageBuckets.aging}</p>
                  <p>Stale (15+ days): {profile.ageBuckets.stale}</p>
                  <p>Unknown sent date: {profile.ageBuckets.unknown}</p>
                </div>
              </div>

              <div className="rounded-[1.6rem] border border-stone-200 bg-stone-50 p-4">
                <h3 className="text-lg font-black text-stone-950">Title Counts</h3>
                <div className="mt-4 space-y-3">
                  {profile.titleCounts.slice(0, 6).map((title) => (
                    <div key={title.title}>
                      <div className="mb-1 flex items-center justify-between text-sm text-stone-600">
                        <span>{title.title}</span>
                        <span>{title.count}</span>
                      </div>
                      <div className="h-2 rounded-full bg-stone-100">
                        <div
                          className="h-2 rounded-full bg-stone-900"
                          style={{ width: `${(title.count / profile.sessionCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-stone-200 bg-white p-4">
              <h3 className="text-lg font-black text-stone-950">Open Sessions</h3>
              <div className="mt-4 space-y-3">
                {profile.sessions.map((session, index) => (
                  <div
                    key={`${profile.key}-${session.title}-${index}`}
                    className="rounded-[1.4rem] border border-stone-200 bg-stone-50 p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-stone-900">{session.title || "Unknown title"}</p>
                        <p className="mt-1 text-xs text-stone-500">{session.sentDate || "Unknown sent date"}</p>
                      </div>
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusTone(
                          String(session.status ?? "").toLowerCase()
                        )}`}
                      >
                        {session.status}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-stone-600">
                      Pending: {getPendingDays(session.sentDate) ?? "Unknown"} days
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
