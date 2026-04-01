"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  LayoutGrid,
  List,
  AlertCircle,
  Loader2,
} from "lucide-react";

const NO_SNAPSHOT_MESSAGE =
  "No snapshot available. Ask the admin to upload this week's CSV.";

/* ---------- Helpers ---------- */
const shortName = (fullName) => {
  const safeName = typeof fullName === "string" ? fullName : "";
  const parts = safeName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Unknown";
  const first = parts[0] || "";
  const lastInitial = parts[1] ? parts[1][0].toUpperCase() + "." : "";
  return `${first} ${lastInitial}`.trim();
};

const normalizeNameKey = (fullName) => {
  const safeName = typeof fullName === "string" ? fullName : "";
  return safeName
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,]/g, "")
    .toLowerCase();
};

const isOffender = (row) => {
  if (!row?.status) return false;
  const s = row.status.toLowerCase();
  return s === "not started" || s === "in progress";
};

const pendingDays = (sentDate) => {
  const sent = new Date(sentDate);
  if (Number.isNaN(sent.getTime())) return "N/A";
  return Math.floor((Date.now() - sent.getTime()) / 86400000);
};

const toValidDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

const clamp01 = (value) => Math.min(1, Math.max(0, value));

const hexToRgb = (hex) => {
  const safe = hex.replace("#", "");
  if (safe.length !== 6) return { r: 0, g: 0, b: 0 };
  const num = parseInt(safe, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
};

const rgbToHex = ({ r, g, b }) => {
  const toHex = (v) => v.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const mixColors = (aHex, bHex, amount) => {
  const a = hexToRgb(aHex);
  const b = hexToRgb(bHex);
  const t = clamp01(amount);
  return rgbToHex({
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  });
};

const rampColor = (value, min, max) => {
  const blue = "#3b82f6";
  const yellow = "#facc15";
  const red = "#ef4444";
  if (max <= min) {
    return yellow;
  }
  const ratio = clamp01((value - min) / (max - min));
  if (ratio <= 0.5) {
    return mixColors(blue, yellow, ratio / 0.5);
  }
  return mixColors(yellow, red, (ratio - 0.5) / 0.5);
};

const heatmapColors = (value, min, max) => {
  const base = rampColor(value, min, max);
  return {
    base,
    bg: mixColors(base, "#ffffff", 0.85),
    border: mixColors(base, "#ffffff", 0.45),
  };
};

/* ---------- Main Component ---------- */
export default function SlideDeckVisualizer() {
  const [snapshot, setSnapshot] = useState(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState(null);
  const [statusNotice, setStatusNotice] = useState(null); // friendly states for missing/empty snapshots
  const [history, setHistory] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [metricsPrevWeekId, setMetricsPrevWeekId] = useState(null);
  const [deltaByName, setDeltaByName] = useState({});
  const [loadingMetrics, setLoadingMetrics] = useState(false);

  const [viewMode, setViewMode] = useState("grid");
  const [selectedUser, setSelectedUser] = useState(null);
  const [masterCount, setMasterCount] = useState(0);

  const handleTileKeyDown = (event, name) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedUser(name);
    }
  };

  const exportSnapshot = () => {
    if (!snapshot) return;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = snapshot.weekId
      ? `snapshot-${snapshot.weekId}.json`
      : "snapshot.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  /* ---------- Load snapshots & history ---------- */
  async function loadSnapshot(weekId = null) {
    try {
      setLoadingSnapshot(true);
      setError(null);
      setStatusNotice(null);
      const endpoint = weekId
        ? `/api/snapshot?week=${encodeURIComponent(weekId)}`
        : "/api/latest-snapshot";
      const res = await fetch(endpoint);
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message =
          weekId === null
            ? NO_SNAPSHOT_MESSAGE
            : json?.error || "Unable to load the requested snapshot.";
        setSnapshot(null);
        setStatusNotice({ type: "missing", message });
        return;
      }

      const snapshotData = json?.snapshot ?? json ?? {};
      const parsed =
        Array.isArray(snapshotData?.parsedRows) && snapshotData.parsedRows.length
          ? snapshotData.parsedRows
          : Array.isArray(snapshotData?.parsedRows)
          ? []
          : null;

      if (!parsed) {
        setSnapshot(null);
        setStatusNotice({ type: "missing", message: NO_SNAPSHOT_MESSAGE });
        return;
      }

      setSelectedUser(null);
      setSnapshot({ ...snapshotData, parsedRows: parsed });
      if (snapshotData.weekId) {
        setSelectedWeek(snapshotData.weekId);
      }

      if (!parsed.length) {
        setStatusNotice({
          type: "empty",
          message: "100% completion rate. Keep up the good work.",
        });
      } else {
        setStatusNotice(null);
      }
    } catch (err) {
      const fallback =
        weekId === null
          ? NO_SNAPSHOT_MESSAGE
          : "Unable to load snapshot right now. Please try again.";
      setStatusNotice({ type: "missing", message: fallback });
      setError(err?.message || fallback);
      setSnapshot(null);
    } finally {
      setLoadingSnapshot(false);
    }
  }

  async function loadHistory() {
    try {
      setLoadingHistory(true);
      setError(null);
      setStatusNotice(null);
      const res = await fetch("/api/history");
      if (!res.ok) {
        throw new Error("Failed to load history");
      }
      const json = await res.json();
      const weeks = json?.history?.weeks ?? [];
      setHistory(weeks);
      const newestWeek = weeks[0]?.weekId ?? null;
      const preferredWeek =
        selectedWeek && weeks.some((w) => w.weekId === selectedWeek)
          ? selectedWeek
          : newestWeek;
      const targetWeek = preferredWeek ?? null;
      setSelectedWeek(targetWeek);
      await loadSnapshot(targetWeek);
    } catch (err) {
      setHistory([]);
      setError(null);
      await loadSnapshot(null);
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    loadHistory();
  }, []);

  const orderedWeeks = useMemo(() => {
    const safe = Array.isArray(history) ? [...history] : [];
    safe.sort((a, b) => {
      const aTime = new Date(a?.uploadedAt || a?.uploaded || 0).getTime();
      const bTime = new Date(b?.uploadedAt || b?.uploaded || 0).getTime();
      const aSafe = Number.isFinite(aTime) ? aTime : 0;
      const bSafe = Number.isFinite(bTime) ? bTime : 0;
      if (aSafe !== bSafe) return bSafe - aSafe;

      const aWeek = typeof a?.weekId === "string" ? a.weekId : "";
      const bWeek = typeof b?.weekId === "string" ? b.weekId : "";
      return bWeek.localeCompare(aWeek);
    });
    return safe;
  }, [history]);

  const getPrevWeekId = (weekId) => {
    if (!weekId || !Array.isArray(orderedWeeks) || orderedWeeks.length === 0) return null;
    const idx = orderedWeeks.findIndex((w) => w?.weekId === weekId);
    if (idx < 0) return null;
    for (let i = idx + 1; i < orderedWeeks.length; i += 1) {
      const candidate = orderedWeeks[i]?.weekId ?? null;
      if (candidate && candidate !== weekId) return candidate;
    }
    return null;
  };

  async function loadWeekMetrics(weekId) {
    try {
      setLoadingMetrics(true);
      setDeltaByName({});
      setMetricsPrevWeekId(null);
      if (!weekId) return;
      const res = await fetch(`/api/metrics?week=${encodeURIComponent(weekId)}`);
      if (!res.ok) {
        // Fallback: compute deltas on the fly if metrics don't exist yet for this week.
        const prevWeek = getPrevWeekId(weekId);
        setMetricsPrevWeekId(prevWeek);
        if (!prevWeek) return;

        const prevRes = await fetch(
          `/api/snapshot?week=${encodeURIComponent(prevWeek)}`
        );
        if (!prevRes.ok) return;
        const prevJson = await prevRes.json().catch(() => ({}));
        if (!prevJson?.success || !prevJson?.snapshot) return;
        const prevRows = Array.isArray(prevJson.snapshot?.parsedRows)
          ? prevJson.snapshot.parsedRows
          : [];
        const prevOffenders = prevRows.filter(isOffender);
        const prevCounts = {};
        for (const r of prevOffenders) {
          const key = normalizeNameKey(r.fullName);
          if (!key) continue;
          prevCounts[key] = (prevCounts[key] || 0) + 1;
        }

        const currentCounts = {};
        const currentOffenders = offenderRows;
        for (const r of currentOffenders) {
          const key = normalizeNameKey(r.fullName);
          if (!key) continue;
          currentCounts[key] = (currentCounts[key] || 0) + 1;
        }

        const deltaMap = {};
        for (const [key, count] of Object.entries(currentCounts)) {
          deltaMap[key] = (count || 0) - (prevCounts[key] || 0);
        }
        setDeltaByName(deltaMap);
        return;
      }
      const json = await res.json().catch(() => ({}));
      const metrics = json?.metrics;
      if (!json?.success || !metrics || !Array.isArray(metrics?.users)) return;

      setMetricsPrevWeekId(metrics?.prevWeekId ?? null);
      const map = {};
      for (const u of metrics.users) {
        const name = typeof u?.name === "string" ? u.name.trim() : "";
        const delta = Number.isFinite(u?.deltaFromPrevWeek) ? u.deltaFromPrevWeek : 0;
        const key = normalizeNameKey(name);
        if (!key) continue;
        map[key] = delta;
      }
      setDeltaByName(map);
    } catch {
      setDeltaByName({});
      setMetricsPrevWeekId(null);
    } finally {
      setLoadingMetrics(false);
    }
  }

  useEffect(() => {
    loadWeekMetrics(selectedWeek);
  }, [selectedWeek, orderedWeeks, snapshot?.snapshotId]);

  async function loadLists() {
    try {
      const res = await fetch("/api/current-lists");
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Failed to load lists");
      }
      setMasterCount(Number.isFinite(json?.masterCount) ? json.masterCount : 0);
    } catch (err) {
      setMasterCount(0);
    }
  }

  useEffect(() => {
    loadLists();
  }, []);

  const handleWeekChange = (event) => {
    const week = event.target.value || null;
    setSelectedWeek(week);
    loadSnapshot(week);
  };

  /* ---------- Derived Data from Snapshot ---------- */
  const parsedRows = Array.isArray(snapshot?.parsedRows) ? snapshot.parsedRows : [];
  const offenderRows = parsedRows.filter(isOffender);

  const offenderCounts = useMemo(() => {
    const c = {};
    for (const r of offenderRows) {
      c[r.fullName] = (c[r.fullName] || 0) + 1;
    }
    return c;
  }, [offenderRows]);

  const data = Object.entries(offenderCounts).map(([name, value]) => ({
    name: name || "Unknown",
    value,
  }));

  const sortedData = [...data].sort((a, b) => b.value - a.value);
  const totalTasks = sortedData.reduce((a, b) => a + b.value, 0);
  const averageTasks = sortedData.length
    ? (totalTasks / sortedData.length).toFixed(1)
    : 0;
  const minValue = sortedData.length
    ? Math.min(...sortedData.map((row) => row.value))
    : 0;
  const maxValue = sortedData.length
    ? Math.max(...sortedData.map((row) => row.value))
    : 0;

  const selectedSessions = offenderRows.filter(
    (row) => row.fullName === selectedUser
  );

  const perfectWeeksCount = useMemo(
    () =>
      orderedWeeks.filter((week) => {
        const incomplete = Number(week?.totalIncomplete ?? week?.offenderCount ?? 0);
        return Number.isFinite(incomplete) && incomplete === 0;
      }).length,
    [orderedWeeks]
  );

  const perfectWeekStreak = useMemo(() => {
    let streak = 0;
    for (const week of orderedWeeks) {
      const incomplete = Number(week?.totalIncomplete ?? week?.offenderCount ?? 0);
      if (!Number.isFinite(incomplete) || incomplete !== 0) {
        break;
      }
      streak += 1;
    }
    return streak;
  }, [orderedWeeks]);

  const latestPerfectWeek = useMemo(
    () =>
      orderedWeeks.find((week) => {
        const incomplete = Number(week?.totalIncomplete ?? week?.offenderCount ?? 0);
        return Number.isFinite(incomplete) && incomplete === 0;
      }) ?? null,
    [orderedWeeks]
  );

  const daysSinceLastPerfectWeek = useMemo(() => {
    if (perfectWeekStreak > 0) return 0;
    const uploadedAt = toValidDate(latestPerfectWeek?.uploadedAt ?? latestPerfectWeek?.uploaded);
    if (!uploadedAt) return null;
    return Math.max(0, Math.floor((Date.now() - uploadedAt.getTime()) / 86400000));
  }, [latestPerfectWeek, perfectWeekStreak]);

  const uploadedLabel = snapshot?.uploadedAt
    ? new Date(snapshot.uploadedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  const barColor = (v) => rampColor(v, minValue, maxValue);

  /* ---------- UI States ---------- */
  if (loadingSnapshot || loadingHistory) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-gray-600"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="animate-spin mr-3" /> Loading dashboard...
      </div>
    );
  }

  if (error && !statusNotice) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center text-red-700"
        aria-live="assertive"
      >
        <AlertCircle size={48} className="mb-4" />
        <p className="text-xl font-bold">Cannot load dashboard</p>
        <p className="mt-2">{error}</p>
        <p className="text-sm mt-4 text-gray-500">
          Make sure an admin uploaded a CSV via <code>/admin/upload</code>.
        </p>
        <button
          onClick={loadHistory}
          className="mt-6 px-4 py-2 bg-blue-700 text-white rounded-md hover:bg-blue-800"
          aria-label="Retry loading dashboard"
        >
          Retry
        </button>
      </div>
    );
  }

  if (statusNotice?.type === "missing" && statusNotice?.message) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-gray-700">
        <AlertCircle size={48} className="mb-4 text-amber-500" />
        <p className="text-xl font-bold text-center max-w-xl">{statusNotice.message}</p>
        <p className="mt-2 text-center text-gray-500 max-w-xl">
          We could not load the latest snapshot. Check with an admin and try again.
        </p>
        <button
          onClick={() => loadSnapshot(selectedWeek ?? null)}
          className="mt-6 px-4 py-2 bg-blue-700 text-white rounded-md hover:bg-blue-800"
          aria-label="Retry loading snapshot"
        >
          Retry
        </button>
      </div>
    );
  }

  /* ---------- MAIN UI ---------- */
  return (
    <div className="min-h-screen bg-gray-100 px-6 py-6 flex justify-center font-sans">
      <div className="w-full max-w-[1920px] flex flex-col gap-6">
        {/* HEADER */}
        <div className="bg-white px-6 py-4 rounded-2xl shadow-sm border flex flex-col gap-3">
          <div className="flex flex-col xl:flex-row justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Security Awareness Dashboard
              </h1>
              <div className="text-sm text-gray-500 mt-1 flex flex-wrap items-center gap-2">
                {uploadedLabel && <span>Uploaded: {uploadedLabel}</span>}
                <span className="mx-1 text-gray-300">|</span>
                <span>Total Items: {totalTasks}</span>
                <span className="mx-1 text-gray-300">|</span>
                <span>Total People: {masterCount}</span>
                {snapshot?.weekId && (
                  <>
                    <span className="mx-1 text-gray-300">|</span>
                    <span className="font-medium text-gray-700">
                      Week: {snapshot.weekId}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 min-w-[220px]">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  100% Completion Streak
                </p>
                <p className="mt-1 text-2xl font-bold text-emerald-900">{perfectWeekStreak}</p>
              </div>
              {perfectWeekStreak === 0 && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 min-w-[220px]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                    Days Since Last 100% Completion
                  </p>
                  <p className="mt-1 text-2xl font-bold text-rose-900">
                    {daysSinceLastPerfectWeek ?? "--"}
                  </p>
                </div>
              )}
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 min-w-[180px]">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Perfect Weeks Total
                </p>
                <p className="mt-1 text-2xl font-bold text-gray-900">{perfectWeeksCount}</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600" htmlFor="week-select">
                  Week
                </label>
                <select
                  id="week-select"
                  value={selectedWeek ?? ""}
                  onChange={handleWeekChange}
                  disabled={loadingHistory || loadingSnapshot || !history.length}
                  className="border rounded-md px-3 py-2 text-sm text-gray-800 bg-white shadow-sm"
                  aria-label="Select week to view snapshot"
                >
                  {history.length === 0 && <option value="">Latest</option>}
                  {orderedWeeks.map((w) => (
                    <option key={w.weekId} value={w.weekId}>
                      {w.weekId} ({w.totalIncomplete ?? w.offenderCount ?? 0} incomplete)
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={loadHistory}
                aria-label="Refresh data"
                className="px-4 py-2 rounded-lg border bg-gray-50 text-gray-700 hover:bg-gray-100"
              >
                Refresh
              </button>
              <button
                onClick={exportSnapshot}
                aria-label="Export snapshot as JSON"
                className="px-4 py-2 rounded-lg border bg-white text-gray-800 hover:bg-gray-50"
              >
                Export Snapshot JSON
              </button>
            </div>
          </div>
        </div>

        {statusNotice?.type === "empty" && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-6 py-5 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertCircle size={20} className="mt-0.5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-base font-semibold text-emerald-900">100% completion rate</p>
                <p className="mt-1 text-sm text-emerald-800">{statusNotice.message}</p>
              </div>
            </div>
          </div>
        )}

        {/* MAIN CONTENT */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* High Risk Panel */}
          <div className="bg-white p-6 rounded-2xl shadow-lg border flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">High Risk Users</h2>
              <div className="text-sm text-gray-600">
                {data.length} people • {totalTasks} incomplete items
              </div>
            </div>
            <div className="flex gap-3 flex-wrap items-center">
              <button
                onClick={() => setViewMode("grid")}
                aria-pressed={viewMode === "grid"}
                aria-label="Show heatmap view"
                className={`px-3 py-2 rounded-lg ${
                  viewMode === "grid"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                <LayoutGrid size={16} /> Heatmap
              </button>
              <button
                onClick={() => setViewMode("summary")}
                aria-pressed={viewMode === "summary"}
                aria-label="Show summary view"
                className={`px-3 py-2 rounded-lg ${
                  viewMode === "summary"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                <List size={16} /> Summary
              </button>
            </div>

            {viewMode === "grid" && (
              <div className="overflow-x-auto pb-2">
                {sortedData.length ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-4 min-w-[320px]">
                  {sortedData.map((p) => {
                    const color = heatmapColors(p.value, minValue, maxValue);
                    const delta = deltaByName?.[normalizeNameKey(p.name)] ?? 0;
                    const deltaLabel =
                      delta > 0 ? `▲ ${delta}` : delta < 0 ? `▼ ${Math.abs(delta)}` : "0";
                    const deltaClass =
                      delta > 0
                        ? "bg-red-100 text-red-800 border-red-200"
                        : delta < 0
                          ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                          : "bg-gray-100 text-gray-700 border-gray-200";

                    return (
                      <div
                        key={p.name}
                        onClick={() => setSelectedUser(p.name)}
                        onKeyDown={(e) => handleTileKeyDown(e, p.name)}
                        tabIndex={0}
                        role="button"
                        aria-label={`Open user details for ${shortName(p.name)}`}
                        className="p-4 rounded-xl border shadow-sm cursor-pointer hover:shadow-md transition focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
                        style={{ backgroundColor: color.bg, borderColor: color.border }}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-gray-900">{shortName(p.name)}</span>
                          <div className="flex items-center gap-2">
                            {metricsPrevWeekId && !loadingMetrics && (
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${deltaClass}`}
                                title={`Change vs ${metricsPrevWeekId}: ${deltaLabel}`}
                                aria-label={`Change vs ${metricsPrevWeekId}: ${deltaLabel}`}
                              >
                                {deltaLabel}
                              </span>
                            )}
                            <span className="font-bold text-xl text-gray-900">{p.value}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-5 py-10 text-center text-sm text-gray-500">
                    No incomplete users in this snapshot.
                  </div>
                )}
                {loadingMetrics && (
                  <div className="mt-3 text-xs text-gray-500">
                    Loading week-over-week changes...
                  </div>
                )}
              </div>
            )}

            {viewMode === "summary" && (
              <div className="space-y-2">
                <h3 className="text-lg font-bold mb-2">Summary</h3>
                <p className="text-gray-700">
                  <span className="font-semibold">Total Incomplete Items:</span> {totalTasks}
                </p>

                <p className="text-gray-700">
                  <span className="font-semibold">Users With Incomplete Items:</span> {data.length}
                </p>

                <p className="text-gray-700">
                  <span className="font-semibold">Average Per Person:</span> {averageTasks}
                </p>
              </div>
            )}
          </div>

          {/* Draw */}
          <div className="bg-white p-6 rounded-2xl shadow-lg border flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Weekly Draw</h2>
              <p className="text-sm text-gray-600">
                Use the Slot Machine to pick a random eligible user.
              </p>
            </div>
            <Link
              href="/draw/slot-machine"
              className="text-sm px-4 py-2 rounded-md bg-emerald-600 text-white font-semibold shadow-sm hover:bg-emerald-700"
            >
              Go to Slot Machine
            </Link>
          </div>
        </div>

        {/* ---------- USER MODAL ---------- */}
        <UserModal
          userName={selectedUser}
          sessions={selectedSessions}
          onClose={() => setSelectedUser(null)}
        />
      </div>
    </div>
  );
}

/* ---------- Modal Component ---------- */
function UserModal({ userName, sessions, onClose }) {
  if (!userName) return null;

  const headingId = "user-modal-title";

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
    >
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl border border-gray-300 focus:outline-none">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 id={headingId} className="text-2xl font-bold text-gray-900">
            {userName}
          </h2>
          <button
            onClick={onClose}
            className="text-sm px-3 py-1 rounded-md bg-gray-200 hover:bg-gray-300 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-600"
            aria-label="Close user details"
          >
            Close
          </button>
        </div>

        {/* Session list */}
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2">
          {sessions.map((s, i) => (
            <div
              key={i}
              className="p-4 rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 transition shadow-sm text-gray-900"
            >
              <p className="font-semibold text-gray-900 mb-1">
                {s.title}
              </p>

              <p className="text-sm text-gray-700">
                <span className="font-medium">Status:</span> {s.status}
              </p>

              <p className="text-sm text-gray-700">
                <span className="font-medium">Sent:</span> {s.sentDate}
              </p>

              <p className="text-sm text-gray-700">
                <span className="font-medium">Pending:</span>{" "}
                {pendingDays(s.sentDate)} days
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
