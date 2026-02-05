"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  LayoutGrid,
  List,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { RotateCw } from "lucide-react";

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

const isEligibleForEscalation = (row) => {
  const d = new Date(row?.sentDate);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === 2026;
};

const pendingDays = (sentDate) => {
  const sent = new Date(sentDate);
  if (Number.isNaN(sent.getTime())) return "N/A";
  return Math.floor((Date.now() - sent.getTime()) / 86400000);
};

const formatCheckpointToronto = (checkpointDate) => {
  if (!checkpointDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(checkpointDate).trim());
  if (!m) return checkpointDate;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return checkpointDate;
  const dateLabel = d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "America/Toronto",
  });
  return `${dateLabel} \u2013 9:00 am (Toronto)`;
};

const getTorontoNowParts = () => {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date());
  const weekday = parts.find((p) => p.type === "weekday")?.value || "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  return { weekday, hour: Number.isFinite(hour) ? hour : null };
};

const isThursdayMorningToronto = () => {
  const { weekday, hour } = getTorontoNowParts();
  // "Thursday morning" default: Thu in Toronto, before noon.
  return weekday.toLowerCase().startsWith("thu") && hour != null && hour < 12;
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
  const [loadingCheckpoints, setLoadingCheckpoints] = useState(true);
  const [error, setError] = useState(null);
  const [statusNotice, setStatusNotice] = useState(null); // friendly states for missing/empty snapshots
  const [history, setHistory] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [metricsPrevWeekId, setMetricsPrevWeekId] = useState(null);
  const [deltaByName, setDeltaByName] = useState({});
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [checkpointStats, setCheckpointStats] = useState(null);
  const [checkpointError, setCheckpointError] = useState(null);
  const [escalationRows, setEscalationRows] = useState([]);
  const [loadingEscalations, setLoadingEscalations] = useState(false);
  const [escalationsError, setEscalationsError] = useState(null);
  const [levelFilter, setLevelFilter] = useState(null);
  const [minLevelFilter, setMinLevelFilter] = useState("CP1");
  const [actionDueOnly, setActionDueOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersInitialized, setFiltersInitialized] = useState(false);

  const [viewMode, setViewMode] = useState("grid");
  const [selectedUser, setSelectedUser] = useState(null);
  const [rouletteUsers, setRouletteUsers] = useState([]);
  const [spinResult, setSpinResult] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [listsError, setListsError] = useState(null);
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
          message:
            "Snapshot contains zero parsed rows. Upload a CSV with data to see charts and heatmaps.",
        });
        return;
      }

      setStatusNotice(null);
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

  async function loadCheckpoints() {
    try {
      setLoadingCheckpoints(true);
      setCheckpointError(null);
      const res = await fetch("/api/checkpoints");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Failed to load checkpoints");
      }
      setCheckpointStats(json);
    } catch (err) {
      setCheckpointStats(null);
      setCheckpointError(err?.message || "Failed to load checkpoints");
    } finally {
      setLoadingCheckpoints(false);
    }
  }

  useEffect(() => {
    loadCheckpoints();
  }, []);

  useEffect(() => {
    if (filtersInitialized) return;
    // Default view on Thursday morning (Toronto): Action Due Now + Level >= CP1.
    if (isThursdayMorningToronto()) {
      setActionDueOnly(true);
      setMinLevelFilter("CP1");
    } else {
      setActionDueOnly(false);
      setMinLevelFilter("CP1");
    }
    setFiltersInitialized(true);
  }, [filtersInitialized]);

  async function loadEscalations(weekId) {
    try {
      setLoadingEscalations(true);
      setEscalationsError(null);
      const q = weekId ? `?week=${encodeURIComponent(weekId)}` : "";
      const res = await fetch(`/api/escalations${q}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Failed to load escalations");
      }
      const rows = Array.isArray(json?.escalations) ? json.escalations : [];
      setEscalationRows(rows);
    } catch (err) {
      setEscalationRows([]);
      setEscalationsError(err?.message || "Failed to load escalations");
    } finally {
      setLoadingEscalations(false);
    }
  }

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

  useEffect(() => {
    loadEscalations(selectedWeek);
  }, [selectedWeek, snapshot?.snapshotId]);

  async function loadLists() {
    try {
      setListsError(null);
      const res = await fetch("/api/current-lists");
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Failed to load lists");
      }
      const users = Array.isArray(json?.rouletteUsers)
        ? json.rouletteUsers.filter(Boolean)
        : [];
      setRouletteUsers(users);
      setMasterCount(Number.isFinite(json?.masterCount) ? json.masterCount : 0);
    } catch (err) {
      setListsError(err.message);
      setRouletteUsers([]);
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
  const allOffenderRows = parsedRows.filter(isOffender);
  const offenderRows = allOffenderRows.filter(isEligibleForEscalation);

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
  const selectedLegacySessions = allOffenderRows.filter(
    (row) => row.fullName === selectedUser && !isEligibleForEscalation(row)
  );

  const uploadedLabel = snapshot?.uploadedAt
    ? new Date(snapshot.uploadedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  const barColor = (v) => rampColor(v, minValue, maxValue);

  const spinRoulette = () => {
    if (!rouletteUsers.length) return;
    setSpinning(true);
    setSpinResult(null);
    const winner = rouletteUsers[Math.floor(Math.random() * rouletteUsers.length)];
    setTimeout(() => {
      setSpinResult(winner);
      setSpinning(false);
    }, 1200);
  };

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

  if (statusNotice?.message) {
    const isMissing = statusNotice.type === "missing";
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-gray-700">
        <AlertCircle size={48} className="mb-4 text-amber-500" />
        <p className="text-xl font-bold text-center max-w-xl">{statusNotice.message}</p>
        <p className="mt-2 text-center text-gray-500 max-w-xl">
          {isMissing
            ? "We could not load the latest snapshot. Check with an admin and try again."
            : "This snapshot has no rows to visualize yet. Upload data and then retry."}
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

  if (!parsedRows.length) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-gray-600">
        <AlertCircle size={40} className="mb-3 text-amber-500" />
        <p className="text-xl font-bold text-center">Snapshot contains zero parsed rows.</p>
        <p className="mt-2 text-center text-gray-500">
          Upload a CSV with data to see charts, then retry loading the dashboard.
        </p>
        <button
          onClick={() => loadSnapshot(selectedWeek ?? null)}
          className="mt-6 px-4 py-2 bg-blue-700 text-white rounded-md hover:bg-blue-800"
          aria-label="Retry loading snapshot after upload"
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
                <span className="mx-1 text-gray-300">|</span>
                <span className="font-medium text-gray-700">
                  Checkpoint (Toronto):{" "}
                  {snapshot?.checkpointDate
                    ? `${snapshot.checkpointDate}${snapshot?.checkpointOrdinal ? ` (#${snapshot.checkpointOrdinal})` : ""}`
                    : loadingCheckpoints
                      ? "Loading..."
                      : "N/A"}
                </span>
                {!loadingCheckpoints && Array.isArray(checkpointStats?.users) && (
                  <>
                    <span className="mx-1 text-gray-300">|</span>
                    <span className="text-gray-600">
                      Escalation rows: {checkpointStats.users.length}
                    </span>
                  </>
                )}
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
              {checkpointError && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  Checkpoints: {checkpointError}
                </div>
              )}
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
              <Link
                href="/leaderboard"
                className="px-4 py-2 rounded-lg border bg-gray-50 text-gray-700 text-sm font-medium"
                aria-label="View all-time leaderboard"
              >
                View Leaderboard
              </Link>
              <button
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

        {/* Escalation Queue */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border">
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <div className="font-semibold">New checkpoint model active</div>
            <div className="text-blue-800">
              Effective Feb 12, 2026. No retroactive escalation.
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-2xl font-bold text-gray-900">Escalation Queue</h2>
            <div className="text-sm text-gray-600 flex flex-wrap items-center gap-2">
              <span className="font-medium">
                Checkpoint:{" "}
                {checkpointStats?.currentCheckpoint
                  ? formatCheckpointToronto(checkpointStats.currentCheckpoint)
                  : loadingCheckpoints
                    ? "Loading..."
                    : "N/A"}
              </span>
              <span className="text-gray-300">|</span>
              <span>Scope: 2026 sessions only</span>
            </div>
          </div>

          {checkpointError && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {checkpointError}
            </div>
          )}

          {/* Level Summary */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              {
                key: "CP0_GRACE",
                label: "CP0 \u2013 Grace",
                card: "border-sky-200 bg-sky-50",
                pill: "text-sky-900 bg-white border-sky-200",
              },
              {
                key: "CP1_AWARENESS",
                label: "CP1 \u2013 Awareness",
                card: "border-emerald-200 bg-emerald-50",
                pill: "text-emerald-900 bg-white border-emerald-200",
              },
              {
                key: "CP2_SUPPORT",
                label: "CP2 \u2013 Support",
                card: "border-amber-200 bg-amber-50",
                pill: "text-amber-900 bg-white border-amber-200",
              },
              {
                key: "CP3_HR",
                label: "CP3 \u2013 HR",
                card: "border-orange-200 bg-orange-50",
                pill: "text-orange-900 bg-white border-orange-200",
              },
              {
                key: "CP4_ENFORCEMENT",
                label: "CP4 \u2013 Enforcement",
                card: "border-red-200 bg-red-50",
                pill: "text-red-900 bg-white border-red-200",
              },
            ].map((lvl) => {
              const count = Number.isFinite(checkpointStats?.levelCounts?.[lvl.key])
                ? checkpointStats.levelCounts[lvl.key]
                : 0;
              const active = levelFilter === lvl.key;
              return (
                <button
                  key={lvl.key}
                  type="button"
                  onClick={() => setLevelFilter((prev) => (prev === lvl.key ? null : lvl.key))}
                  className={`text-left rounded-xl border p-4 shadow-sm hover:shadow transition ${lvl.card} ${
                    active ? "ring-2 ring-blue-600" : ""
                  }`}
                  aria-pressed={active}
                  aria-label={`Filter escalation table by ${lvl.label}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-gray-900">{lvl.label}</div>
                    <span className={`text-xs font-semibold border rounded-full px-2 py-0.5 ${lvl.pill}`}>
                      {count}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-gray-600">
                    {active ? "Click to clear filter" : "Click to filter table"}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Filters */}
          <div className="mt-4 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-700 font-medium" htmlFor="min-level-filter">
                  Escalation Level
                </label>
                <select
                  id="min-level-filter"
                  value={minLevelFilter}
                  onChange={(e) => setMinLevelFilter(e.target.value)}
                  className="border rounded-md px-3 py-2 text-sm text-gray-800 bg-white shadow-sm"
                  aria-label="Filter by minimum escalation level"
                >
                  <option value="CP0">CP0+</option>
                  <option value="CP1">CP1+</option>
                  <option value="CP2">CP2+</option>
                  <option value="CP3">CP3+</option>
                  <option value="CP4">CP4 only</option>
                </select>
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={actionDueOnly}
                  onChange={(e) => setActionDueOnly(e.target.checked)}
                  className="h-4 w-4"
                />
                Action Due Now
              </label>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-700 font-medium" htmlFor="search-filter">
                Search
              </label>
              <input
                id="search-filter"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name or email"
                className="border rounded-md px-3 py-2 text-sm text-gray-800 bg-white shadow-sm w-full lg:w-80"
              />
            </div>
          </div>

          <div className="mt-4 overflow-auto border rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="text-left p-3 font-semibold">Escalation Level</th>
                  <th className="text-left p-3 font-semibold">Action Guidance</th>
                  <th className="text-left p-3 font-semibold">Name</th>
                  <th className="text-left p-3 font-semibold">Email</th>
                  <th className="text-left p-3 font-semibold">Session Title</th>
                  <th className="text-left p-3 font-semibold">Sent Date</th>
                  <th className="text-left p-3 font-semibold">Consecutive Checkpoints</th>
                  <th className="text-left p-3 font-semibold">First Checkpoint Seen</th>
                  <th className="text-left p-3 font-semibold">Next Escalation Date</th>
                  <th className="text-left p-3 font-semibold">Action Due Now</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadingCheckpoints ? (
                  <tr>
                    <td className="p-3 text-gray-500" colSpan={9}>
                      Loading escalation queue...
                    </td>
                  </tr>
                ) : Array.isArray(checkpointStats?.users) && checkpointStats.users.length ? (
                  [...checkpointStats.users]
                    .filter((u) => {
                      const lvl = u?.escalationLevel || "";
                      const rank = (v) => {
                        switch (v) {
                          case "CP4_ENFORCEMENT":
                            return 4;
                          case "CP3_HR":
                            return 3;
                          case "CP2_SUPPORT":
                            return 2;
                          case "CP1_AWARENESS":
                            return 1;
                          case "CP0_GRACE":
                            return 0;
                          default:
                            return -1;
                        }
                      };
                      const minRank =
                        minLevelFilter === "CP4"
                          ? 4
                          : minLevelFilter === "CP3"
                            ? 3
                            : minLevelFilter === "CP2"
                              ? 2
                              : minLevelFilter === "CP1"
                                ? 1
                                : 0;

                      // Default: hide CP0 unless user explicitly selects CP0+.
                      if (!levelFilter && minRank >= 1 && lvl === "CP0_GRACE") return false;

                      if (levelFilter && lvl !== levelFilter) return false;

                      if (minLevelFilter === "CP4") {
                        if (lvl !== "CP4_ENFORCEMENT") return false;
                      } else if (rank(lvl) < minRank) {
                        return false;
                      }

                      if (actionDueOnly && !u?.actionDueNow) return false;

                      const q = (searchQuery || "").trim().toLowerCase();
                      if (q) {
                        const name = (u?.name || "").toLowerCase();
                        const email = (u?.email || "").toLowerCase();
                        if (!name.includes(q) && !email.includes(q)) return false;
                      }

                      return true;
                    })
                    .sort((a, b) => {
                      const rank = (lvl) => {
                        switch (lvl) {
                          case "CP4_ENFORCEMENT":
                            return 4;
                          case "CP3_HR":
                            return 3;
                          case "CP2_SUPPORT":
                            return 2;
                          case "CP1_AWARENESS":
                            return 1;
                          case "CP0_GRACE":
                            return 0;
                          default:
                            return -1;
                        }
                      };
                      const ar = rank(a?.escalationLevel);
                      const br = rank(b?.escalationLevel);
                      if (ar !== br) return br - ar; // severity desc

                      const ad = a?.actionDueNow ? 1 : 0;
                      const bd = b?.actionDueNow ? 1 : 0;
                      if (ad !== bd) return bd - ad; // due now first

                      const ac = Number.isFinite(a?.consecutiveCheckpointCount) ? a.consecutiveCheckpointCount : 0;
                      const bc = Number.isFinite(b?.consecutiveCheckpointCount) ? b.consecutiveCheckpointCount : 0;
                      return bc - ac;
                    })
                    .map((u, idx) => (
                      <tr
                        key={`${u.email || "no-email"}-${u.sentDate || idx}-${idx}`}
                        className={u.actionDueNow ? "bg-amber-50" : "bg-white"}
                      >
                        <td className="p-3 whitespace-nowrap font-semibold">{u.escalationLevel || "-"}</td>
                        <td className="p-3 min-w-[220px] text-gray-700">
                          {u.escalationLevel === "CP1_AWARENESS"
                            ? "Notify user, add focus time"
                            : u.escalationLevel === "CP2_SUPPORT"
                              ? "Schedule 15-minute 1:1"
                              : u.escalationLevel === "CP3_HR"
                                ? "HR warning, manager CC"
                                : u.escalationLevel === "CP4_ENFORCEMENT"
                                  ? "Access restriction"
                                  : "-"}
                        </td>
                        <td className="p-3 whitespace-nowrap">{u.name || "Unknown"}</td>
                        <td className="p-3 whitespace-nowrap">{u.email || "-"}</td>
                        <td className="p-3 min-w-[280px]">{u.sessionTitle || "-"}</td>
                        <td className="p-3 whitespace-nowrap">{u.sentDate || "-"}</td>
                        <td className="p-3 whitespace-nowrap">{u.consecutiveCheckpointCount ?? 0}</td>
                        <td className="p-3 whitespace-nowrap">{u.firstCheckpointSeen || "-"}</td>
                        <td className="p-3 whitespace-nowrap">{u.nextEscalationCheckpoint || "-"}</td>
                        <td className="p-3 whitespace-nowrap">{u.actionDueNow ? "Yes" : "No"}</td>
                      </tr>
                    ))
                ) : (
                  <tr>
                    <td className="p-3 text-gray-500" colSpan={9}>
                      No eligible (2026) escalation rows for this checkpoint.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

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
              <button
                onClick={() => setViewMode("escalations")}
                aria-pressed={viewMode === "escalations"}
                aria-label="Show escalation table view"
                className={`px-3 py-2 rounded-lg ${
                  viewMode === "escalations"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                <AlertCircle size={16} /> Escalations
              </button>
            </div>

            {viewMode === "grid" && (
              <div className="overflow-x-auto pb-2">
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

            {viewMode === "escalations" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold">Escalation Queue</h3>
                  <button
                    onClick={() => loadEscalations(selectedWeek)}
                    className="text-sm px-3 py-2 rounded-md border bg-gray-50 text-gray-700 hover:bg-gray-100"
                  >
                    Refresh
                  </button>
                </div>

                {escalationsError && (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    {escalationsError}
                  </div>
                )}

                {loadingEscalations ? (
                  <div className="text-sm text-gray-500">Loading escalation rows...</div>
                ) : (
                  <div className="overflow-auto border rounded-lg">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-gray-700">
                        <tr>
                          <th className="text-left p-3 font-semibold">Name</th>
                          <th className="text-left p-3 font-semibold">Email</th>
                          <th className="text-left p-3 font-semibold">Session</th>
                          <th className="text-left p-3 font-semibold">Sent</th>
                          <th className="text-left p-3 font-semibold">First CP</th>
                          <th className="text-left p-3 font-semibold">Consecutive</th>
                          <th className="text-left p-3 font-semibold">Level</th>
                          <th className="text-left p-3 font-semibold">Next CP</th>
                          <th className="text-left p-3 font-semibold">Due Now</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {escalationRows.map((r, idx) => (
                          <tr
                            key={`${r.email || "no-email"}-${r.sessionId || idx}`}
                            className={r.actionDueNow ? "bg-amber-50" : "bg-white"}
                          >
                            <td className="p-3 whitespace-nowrap">{r.name || "Unknown"}</td>
                            <td className="p-3 whitespace-nowrap">{r.email || "-"}</td>
                            <td className="p-3 min-w-[280px]">{r.sessionTitle || "-"}</td>
                            <td className="p-3 whitespace-nowrap">{r.sentDate || "-"}</td>
                            <td className="p-3 whitespace-nowrap">{r.firstCheckpointSeen || "-"}</td>
                            <td className="p-3 whitespace-nowrap">{r.consecutiveCheckpointCount ?? 0}</td>
                            <td className="p-3 whitespace-nowrap">{r.escalationLevel || "-"}</td>
                            <td className="p-3 whitespace-nowrap">{r.nextEscalationCheckpoint || "-"}</td>
                            <td className="p-3 whitespace-nowrap">{r.actionDueNow ? "Yes" : "No"}</td>
                          </tr>
                        ))}
                        {escalationRows.length === 0 && (
                          <tr>
                            <td className="p-3 text-gray-500" colSpan={9}>
                              No eligible (2026) escalation rows for this week.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Roulette Panel */}
          <div className="bg-white p-6 rounded-2xl shadow-lg border flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Roulette Wheel</h2>
                <p className="text-sm text-gray-600">
                  Eligible: {rouletteUsers.length} people (not currently high risk)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadLists}
                  className="text-sm px-3 py-2 rounded-md border bg-gray-50 text-gray-700 hover:bg-gray-100"
                >
                  Refresh Lists
                </button>
                <Link
                  href="/draw/slot-machine"
                  className="text-sm px-3 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50"
                >
                  Slot Machine
                </Link>
              </div>
            </div>

            {listsError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {listsError}
              </div>
            )}
            <div className="flex flex-col items-center gap-4">
              <div
                className={`w-72 h-72 rounded-full border-4 border-gray-300 flex items-center justify-center relative ${
                  spinning ? "animate-spin-slow" : ""
                }`}
                style={{ animationDuration: "1.2s" }}
              >
                <div className="text-center px-4">
                  {spinResult ? (
                    <p className="text-lg font-bold text-gray-900">{spinResult}</p>
                  ) : rouletteUsers.length ? (
                    <p className="text-sm text-gray-600">Tap spin to select a random user</p>
                  ) : (
                    <p className="text-sm text-gray-500">
                      No eligible users this week. Everyone has pending training.
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={spinRoulette}
                disabled={!rouletteUsers.length || spinning}
                className="inline-flex items-center px-4 py-2 rounded-md bg-emerald-600 text-white text-sm font-semibold shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                <RotateCw size={16} className="mr-2" />
                {spinning ? "Spinning..." : "Spin"}
              </button>
            </div>
          </div>
        </div>

        {/* ---------- USER MODAL ---------- */}
        <UserModal
          userName={selectedUser}
          sessions={selectedSessions}
          legacySessions={selectedLegacySessions}
          checkpointDate={snapshot?.checkpointDate ?? null}
          checkpointOrdinal={snapshot?.checkpointOrdinal ?? null}
          weekId={snapshot?.weekId ?? null}
          onClose={() => setSelectedUser(null)}
        />
      </div>
    </div>
  );
}

/* ---------- Modal Component ---------- */
function UserModal({ userName, sessions, legacySessions, checkpointDate, checkpointOrdinal, weekId, onClose }) {
  if (!userName) return null;

  const headingId = "user-modal-title";
  const checkpointLabel =
    checkpointDate
      ? `Checkpoint (Toronto): ${checkpointDate}${checkpointOrdinal ? ` (#${checkpointOrdinal})` : ""}`
      : null;

  const escalationLabel = (sentDate) => {
    const d = new Date(sentDate);
    if (Number.isNaN(d.getTime())) return null;
    if (d.getFullYear() !== 2026) return null;
    const count = Number.isFinite(checkpointOrdinal) ? checkpointOrdinal : null;
    if (!count) return null;
    // This is a placeholder label until we wire per-session derived counts from /api/escalations into the UI.
    return `Eligible (2026)`;
  };

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
          <div className="min-w-0">
            <h2 id={headingId} className="text-2xl font-bold text-gray-900 truncate">
              {userName}
            </h2>
            <div className="mt-1 text-xs text-gray-600 flex flex-wrap items-center gap-2">
              {weekId && <span>Week: {weekId}</span>}
              {checkpointLabel && (
                <>
                  <span className="text-gray-300">|</span>
                  <span>{checkpointLabel}</span>
                </>
              )}
            </div>
          </div>
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
          {Array.isArray(legacySessions) && legacySessions.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Showing {legacySessions.length} legacy session(s) from 2025. These do not count toward checkpoints or escalation.
            </div>
          )}
          {sessions.map((s, i) => (
            <div
              key={i}
              className="p-4 rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 transition shadow-sm text-gray-900"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-gray-900 mb-1">{s.title}</p>
                {escalationLabel(s.sentDate) && (
                  <span className="text-xs font-semibold text-sky-900 border border-sky-200 bg-sky-50 rounded-full px-2 py-0.5">
                    {escalationLabel(s.sentDate)}
                  </span>
                )}
              </div>

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

          {Array.isArray(legacySessions) &&
            legacySessions.map((s, i) => (
              <div
                key={`legacy-${i}`}
                className="p-4 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 transition shadow-sm text-gray-900"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-gray-900 mb-1">{s.title}</p>
                  <span className="text-xs font-semibold text-amber-900 border border-amber-300 bg-white rounded-full px-2 py-0.5">
                    Legacy (2025)
                  </span>
                </div>

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
