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
  Trophy,
  AlertCircle,
  Sparkles,
  Loader2,
} from "lucide-react";

const shortName = (fullName) => {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0] || "";
  const lastInitial = parts[1] ? `${parts[1][0].toUpperCase()}.` : "";
  return `${first} ${lastInitial}`.trim();
};

const isOffender = (row) => {
  if (!row?.status) return false;
  const normalized = row.status.toLowerCase();
  return normalized === "not started" || normalized === "in progress";
};

export default function SlideDeckVisualizer() {
  const [snapshot, setSnapshot] = useState(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);
  const [error, setError] = useState(null);

  const [viewMode, setViewMode] = useState("chart"); // chart | grid | summary | ai-report
  const [aiReport, setAiReport] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // 🔵 Load snapshot from server on page load
  useEffect(() => {
    async function loadData() {
      try {
        setLoadingSnapshot(true);
        const res = await fetch("/api/latest-snapshot");
        if (!res.ok) throw new Error("Could not load snapshot");

        const json = await res.json();
        if (!json?.snapshot) throw new Error("No snapshot found");

        setSnapshot(json.snapshot);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoadingSnapshot(false);
      }
    }
    loadData();
  }, []);

  // 🔵 Derived data from snapshot
  const parsedRows = snapshot?.parsedRows || [];
  const offenderRows = parsedRows.filter(isOffender);

  // Build offender count map
  const offenderCounts = useMemo(() => {
    const counts = {};
    for (const row of offenderRows) {
      counts[row.fullName] = (counts[row.fullName] || 0) + 1;
    }
    return counts;
  }, [offenderRows]);

  const data = Object.entries(offenderCounts).map(([name, value]) => ({
    name,
    value,
  }));

  const sortedData = data.sort((a, b) => b.value - a.value);
  const totalTasks = data.reduce((acc, curr) => acc + curr.value, 0);
  const averageTasks = data.length
    ? (totalTasks / data.length).toFixed(1)
    : 0;

  const todayLabel = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const selectedSessions = offenderRows.filter(
    (row) => row.fullName === selectedUser
  );

  const getBarColor = (value) => {
    if (value >= 6) return "#ef4444";
    if (value >= 3) return "#f59e0b";
    return "#3b82f6";
  };

  async function generateAIReport() {
    setLoadingAi(true);
    const prompt = `Analyze the following offender dataset: ${JSON.stringify(
      data
    )}`;

    try {
      // Use Gemini or any model
      setAiReport("AI summary goes here...");
    } finally {
      setLoadingAi(false);
    }
  }

  // LOADING SCREEN
  if (loadingSnapshot) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        <Loader2 className="animate-spin mr-3" /> Loading latest report…
      </div>
    );
  }

  // ERROR SCREEN
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-red-600">
        <AlertCircle size={48} className="mb-4" />
        <p className="text-xl font-bold">Cannot load dashboard</p>
        <p className="mt-2">{error}</p>
        <p className="text-sm mt-4 text-gray-500">
          Make sure an admin has uploaded a CSV via <code>/admin/upload</code>.
        </p>
      </div>
    );
  }

  // EMPTY SNAPSHOT
  if (!parsedRows.length) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-gray-500">
        <p className="text-xl font-bold">No data available</p>
        <p className="mt-2 text-gray-400">Ask an admin to upload a CSV.</p>
      </div>
    );
  }

  // 🔵 MAIN UI (same as your original — only data source changed)
  return (
    <div className="min-h-screen bg-gray-100 px-6 py-6 font-sans text-gray-800 flex justify-center">
      <div className="w-full max-w-[1920px] min-h-[1080px] flex flex-col gap-6">
        
        {/* HEADER */}
        <div className="w-full mb-2 flex flex-col xl:flex-row justify-between items-start xl:items-center bg-white px-6 py-4 rounded-2xl shadow-sm border border-gray-200">
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

          <div className="flex gap-2 flex-wrap justify-center">
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

        {/* MAIN DASHBOARD */}
        <div className="w-full bg-white px-10 py-8 rounded-2xl shadow-lg border flex-1">

          {/* CHART VIEW */}
          {viewMode === "chart" && (
            <div className="h-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={sortedData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={160} />
                  <Bar dataKey="value">
                    {sortedData.map((entry, i) => (
                      <Cell key={i} fill={getBarColor(entry.value)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* GRID VIEW (Heatmap) */}
          {viewMode === "grid" && (
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
              {sortedData.map((person) => (
                <div
                  key={person.name}
                  className="p-4 rounded-xl border bg-white hover:bg-gray-50"
                  onClick={() => setSelectedUser(person.name)}
                >
                  <div className="flex justify-between items-center">
                    <span>{shortName(person.name)}</span>
                    <span className="font-bold text-xl">{person.value}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* SUMMARY VIEW */}
          {viewMode === "summary" && (
            <div>
              <h2 className="text-xl font-bold mb-4">Executive Summary</h2>
              <p>Total Incomplete: {totalTasks}</p>
              <p>Users with items: {data.length}</p>
              <p>Average Load: {averageTasks}</p>
            </div>
          )}

          {/* AI REPORT */}
          {viewMode === "ai-report" && (
            <div>
              <button
                onClick={generateAIReport}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg"
              >
                Generate AI Summary
              </button>

              {!loadingAi && aiReport && (
                <pre className="mt-4 p-4 bg-purple-50 border rounded">
                  {aiReport}
                </pre>
              )}

              {loadingAi && (
                <p className="mt-4 text-purple-600">Generating...</p>
              )}
            </div>
          )}
        </div>

        <UserModal
          userName={selectedUser}
          sessions={selectedSessions}
          onClose={() => setSelectedUser(null)}
        />
      </div>
    </div>
  );
}

// User Modal
const pendingDays = (sentDate) => {
  const sent = new Date(sentDate);
  if (Number.isNaN(sent.getTime())) return "N/A";
  return Math.floor((Date.now() - sent.getTime()) / 86400000);
};

const UserModal = ({ userName, sessions, onClose }) => {
  if (!userName) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg w-full max-w-2xl">
        <div className="flex justify-between items-start">
          <h2 className="text-xl font-bold">{userName}</h2>
          <button onClick={onClose}>Close</button>
        </div>

        {sessions.map((s, i) => (
          <div key={i} className="border p-3 rounded mt-3 bg-gray-50">
            <p className="font-semibold">{s.title}</p>
            <p>Status: {s.status}</p>
            <p>Sent: {s.sentDate}</p>
            <p>Pending: {pendingDays(s.sentDate)} days</p>
          </div>
        ))}
      </div>
    </div>
  );
};
