"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  LayoutGrid,
  BarChart2,
  List,
  AlertCircle,
  Sparkles,
  Loader2,
} from "lucide-react";

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
  const [error, setError] = useState(null);

  const [viewMode, setViewMode] = useState("chart");
  const [aiReport, setAiReport] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  /* ---------- Load snapshot on mount ---------- */
  useEffect(() => {
    async function loadSnapshot() {
      try {
        setLoadingSnapshot(true);
        const res = await fetch("/api/latest-snapshot");

        if (!res.ok) throw new Error("Could not load snapshot");

        const json = await res.json();

        // FIXED: Your API does NOT return json.snapshot
        if (!json?.parsedRows || json.parsedRows.length === 0) {
          throw new Error("No snapshot found");
        }

        setSnapshot(json); // store full API response
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingSnapshot(false);
      }
    }
    loadSnapshot();
  }, []);

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

  const todayLabel = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const barColor = (v) => {
    if (v >= 6) return "#ef4444"; // red
    if (v >= 3) return "#f59e0b"; // amber
    return "#3b82f6"; // blue
  };

  /* ---------- AI Report (placeholder) ---------- */
  async function generateAIReport() {
    setLoadingAi(true);
    try {
      // Replace with real Gemini call later
      setAiReport(
        `AI Report Summary\n\nOffenders: ${JSON.stringify(data, null, 2)}`
      );
    } finally {
      setLoadingAi(false);
    }
  }

  /* ---------- UI States ---------- */
  if (loadingSnapshot) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        <Loader2 className="animate-spin mr-3" /> Loading dashboard…
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-red-600">
        <AlertCircle size={48} className="mb-4" />
        <p className="text-xl font-bold">Cannot load dashboard</p>
        <p className="mt-2">{error}</p>
        <p className="text-sm mt-4 text-gray-500">
          Make sure an admin uploaded a CSV via <code>/admin/upload</code>.
        </p>
      </div>
    );
  }

  if (!parsedRows.length) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-gray-500">
        <p className="text-xl font-bold">No data available</p>
        <p className="mt-2 text-gray-400">Ask admin to upload a CSV.</p>
      </div>
    );
  }

  /* ---------- MAIN UI ---------- */
  return (
    <div className="min-h-screen bg-gray-100 px-6 py-6 flex justify-center font-sans">
      <div className="w-full max-w-[1920px] flex flex-col gap-6">

        {/* HEADER */}
        <div className="bg-white px-6 py-4 rounded-2xl shadow-sm border flex flex-col xl:flex-row justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Team Status Overview
            </h1>
            <div className="text-sm text-gray-500 mt-1">
              <span>Snapshot Date: {todayLabel}</span>
              <span className="mx-2">|</span>
              <span>Total Items: {totalTasks}</span>
            </div>
          </div>

          {/* VIEW SWITCHER */}
          <div className="flex gap-2 flex-wrap mt-4 xl:mt-0">
            <button
              onClick={() => setViewMode("chart")}
              className={`px-4 py-2 rounded-lg ${
                viewMode === "chart"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              <BarChart2 size={16} /> Chart
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`px-4 py-2 rounded-lg ${
                viewMode === "grid"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              <LayoutGrid size={16} /> Heatmap
            </button>
            <button
              onClick={() => setViewMode("summary")}
              className={`px-4 py-2 rounded-lg ${
                viewMode === "summary"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              <List size={16} /> Summary
            </button>
            <button
              onClick={() => setViewMode("ai-report")}
              className={`px-4 py-2 rounded-lg border ${
                viewMode === "ai-report"
                  ? "bg-purple-600 text-white"
                  : "bg-purple-50 text-purple-700"
              }`}
            >
              <Sparkles size={16} /> AI Report
            </button>
          </div>
        </div>

        {/* MAIN CARD */}
        <div className="bg-white p-10 rounded-2xl shadow-lg border flex-1">

          {/* ---------- CHART VIEW ---------- */}
          {viewMode === "chart" && (
            <ResponsiveContainer width="100%" height={800}>
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

          {/* ---------- HEATMAP VIEW ---------- */}
          {/* ---------- HEATMAP VIEW ---------- */}
          {viewMode === "grid" && (
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
              {sortedData.map((p) => {
                const color =
                  p.value >= 6
                    ? "bg-red-50 border-red-300 text-red-700"
                    : p.value >= 3
                    ? "bg-amber-50 border-amber-300 text-amber-700"
                    : "bg-blue-50 border-blue-200 text-blue-700";

                return (
                  <div
                    key={p.name}
                    onClick={() => setSelectedUser(p.name)}
                    className={`p-4 rounded-xl border shadow-sm cursor-pointer hover:shadow-md transition ${color}`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{shortName(p.name)}</span>
                      <span className="font-bold text-xl">{p.value}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}


          {/* ---------- SUMMARY VIEW ---------- */}
          {viewMode === "summary" && (
            <div className="space-y-2">
              <h2 className="text-xl font-bold mb-4">Executive Summary</h2>

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


          {/* ---------- AI REPORT VIEW ---------- */}
          {viewMode === "ai-report" && (
            <div>
              <button
                onClick={generateAIReport}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg"
              >
                Generate AI Summary
              </button>

              {loadingAi && (
                <p className="mt-4 text-purple-600">Generating...</p>
              )}

              {!loadingAi && aiReport && (
                <pre className="mt-4 p-4 bg-purple-50 border rounded whitespace-pre-wrap">
                  {aiReport}
                </pre>
              )}
            </div>
          )}
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

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl border border-gray-200">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-900">{userName}</h2>
          <button
            onClick={onClose}
            className="text-sm px-3 py-1 rounded-md bg-gray-200 hover:bg-gray-300"
          >
            Close
          </button>
        </div>

        {/* Session list */}
        <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2">
          {sessions.map((s, i) => (
            <div
              key={i}
              className="p-4 rounded-lg border bg-gray-50 hover:bg-gray-100 transition shadow-sm"
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
