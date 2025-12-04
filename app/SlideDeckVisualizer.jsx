"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  LayoutGrid,
  BarChart2,
  List,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { RotateCw } from "lucide-react";

/* ---------- Helpers ---------- */
const shortName = (fullName) => {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0] || "";
  const lastInitial = parts[1] ? parts[1][0].toUpperCase() + "." : "";
  return `${first} ${lastInitial}`.trim();
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

/* ---------- Main Component ---------- */
export default function SlideDeckVisualizer() {
  const [snapshot, setSnapshot] = useState(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(null);

  const [viewMode, setViewMode] = useState("chart");
  const [selectedUser, setSelectedUser] = useState(null);
  const [rouletteUsers, setRouletteUsers] = useState([]);
  const [spinResult, setSpinResult] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [listsError, setListsError] = useState(null);

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
      const endpoint = weekId
        ? `/api/snapshot?week=${encodeURIComponent(weekId)}`
        : "/api/latest-snapshot";
      const res = await fetch(endpoint);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "No snapshot found. Upload a CSV first.");
      }
      const snapshotData = json?.snapshot ?? json;
      if (!snapshotData?.parsedRows || snapshotData.parsedRows.length === 0) {
        throw new Error("No snapshot data available");
      }
      setSelectedUser(null);
      setSnapshot(snapshotData);
      if (snapshotData.weekId) {
        setSelectedWeek(snapshotData.weekId);
      }
    } catch (err) {
      setError(err.message);
      setSnapshot(null);
    } finally {
      setLoadingSnapshot(false);
    }
  }

  async function loadHistory() {
    try {
      setLoadingHistory(true);
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
      setError(err.message);
      await loadSnapshot(null);
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadLists() {
    try {
      setListsError(null);
      const res = await fetch("/api/current-lists");
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || "Failed to load lists");
      }
      setRouletteUsers(json.rouletteUsers || []);
    } catch (err) {
      setListsError(err.message);
      setRouletteUsers([]);
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
  const parsedRows = snapshot?.parsedRows || [];
  const offenderRows = parsedRows.filter(isOffender);

  const offenderCounts = useMemo(() => {
    const c = {};
    for (const r of offenderRows) {
      c[r.fullName] = (c[r.fullName] || 0) + 1;
    }
    return c;
  }, [offenderRows]);

  const data = Object.entries(offenderCounts).map(([name, value]) => ({
    name,
    value,
  }));

  const sortedData = data.sort((a, b) => b.value - a.value);
  const totalTasks = sortedData.reduce((a, b) => a + b.value, 0);
  const averageTasks = sortedData.length
    ? (totalTasks / sortedData.length).toFixed(1)
    : 0;

  const selectedSessions = offenderRows.filter(
    (row) => row.fullName === selectedUser
  );

  const uploadedLabel = snapshot?.uploadedAt
    ? new Date(snapshot.uploadedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  const barColor = (v) => {
    if (v >= 6) return "#ef4444"; // red
    if (v >= 3) return "#f59e0b"; // amber
    return "#3b82f6"; // blue
  };

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

  if (error) {
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

  if (!parsedRows.length) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-gray-500">
        <p className="text-xl font-bold">No data available</p>
        <p className="mt-2 text-gray-500">Ask admin to upload a CSV.</p>
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
                  {history.map((w) => (
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
                onClick={() => setViewMode("chart")}
                aria-pressed={viewMode === "chart"}
                aria-label="Show chart view"
                className={`px-3 py-2 rounded-lg ${
                  viewMode === "chart"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                <BarChart2 size={16} /> Chart
              </button>
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

            {viewMode === "chart" && (
              <ResponsiveContainer width="100%" height={500}>
                <BarChart data={sortedData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={160} />
                  <Bar dataKey="value">
                    {sortedData.map((row, i) => (
                      <Cell key={i} fill={barColor(row.value)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}

            {viewMode === "grid" && (
              <div className="overflow-x-auto pb-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-4 min-w-[320px]">
                  {sortedData.map((p) => {
                    const color =
                      p.value >= 6
                        ? "bg-red-100 border-red-500 text-red-900"
                        : p.value >= 3
                        ? "bg-amber-100 border-amber-500 text-amber-900"
                        : "bg-blue-100 border-blue-500 text-blue-900";

                    return (
                      <div
                        key={p.name}
                        onClick={() => setSelectedUser(p.name)}
                        onKeyDown={(e) => handleTileKeyDown(e, p.name)}
                        tabIndex={0}
                        role="button"
                        aria-label={`Open user details for ${shortName(p.name)}`}
                        className={`p-4 rounded-xl border shadow-sm cursor-pointer hover:shadow-md transition focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-blue-600 ${color}`}
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-gray-900">{shortName(p.name)}</span>
                          <span className="font-bold text-xl text-gray-900">{p.value}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
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

          {/* Roulette Panel */}
          <div className="bg-white p-6 rounded-2xl shadow-lg border flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Roulette Wheel</h2>
                <p className="text-sm text-gray-600">
                  Eligible: {rouletteUsers.length} people (not currently high risk)
                </p>
              </div>
              <button
                onClick={loadLists}
                className="text-sm px-3 py-2 rounded-md border bg-gray-50 text-gray-700 hover:bg-gray-100"
              >
                Refresh Lists
              </button>
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
                    <p className="text-sm text-gray-500">No eligible users</p>
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
