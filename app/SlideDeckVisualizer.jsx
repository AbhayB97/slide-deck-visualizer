"use client";

import React, { useState, useRef, useMemo } from "react";
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
  UploadCloud,
  FileText,
  Sparkles,
  Loader2,
} from "lucide-react";

const HEADER_MAP = {
  firstName: ["user first name"],
  lastName: ["user last name"],
  status: ["status"],
  title: ["title"],
  sentDate: ["sent date (utc)", "sent date"],
};

const splitColumns = (line) =>
  line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((col) => col.replace(/^"|"$/g, "").trim());

const findIndex = (headers, keys) => headers.findIndex((header) => keys.some((key) => header === key));

const parseCsv = (text) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (!lines.length) return [];

  const headerLine = lines.shift();
  const headerParts = splitColumns(headerLine).map((h) => h.toLowerCase());

  const firstNameIdx = findIndex(headerParts, HEADER_MAP.firstName);
  const lastNameIdx = findIndex(headerParts, HEADER_MAP.lastName);
  const statusIdx = findIndex(headerParts, HEADER_MAP.status);
  const titleIdx = findIndex(headerParts, HEADER_MAP.title);
  const sentDateIdx = findIndex(headerParts, HEADER_MAP.sentDate);

  if ([firstNameIdx, lastNameIdx, statusIdx, titleIdx, sentDateIdx].some((idx) => idx === -1)) return [];

  return lines
    .map((line) => splitColumns(line))
    .map((cols) => {
      const firstName = cols[firstNameIdx] || "";
      const lastName = cols[lastNameIdx] || "";
      const fullName = `${firstName} ${lastName}`.trim();
      return {
        fullName,
        status: cols[statusIdx] || "",
        title: cols[titleIdx] || "",
        sentDate: cols[sentDateIdx] || "",
      };
    })
    .filter((row) => row.fullName);
};

const isOffender = (row) => {
  const normalized = row.status.toLowerCase();
  return normalized === "in progress" || normalized === "not started";
};

const aggregateOffenders = (rows) =>
  rows.reduce((acc, row) => {
    if (!isOffender(row)) return acc;
    acc[row.fullName] = (acc[row.fullName] || 0) + 1;
    return acc;
  }, {});

export default function SlideDeckVisualizer() {
  const [data, setData] = useState([]);
  const [viewMode, setViewMode] = useState("chart"); // chart, grid, summary, ai-report
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState("No File Loaded");
  const [rawRows, setRawRows] = useState([]);

  // AI State
  const [aiReport, setAiReport] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);

  const todayLabel = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  // Sort data descending so charts look organized
  const sortedData = [...data].sort((a, b) => b.value - a.value);

  const totalTasks = data.reduce((acc, curr) => acc + curr.value, 0);
  const averageTasks = data.length ? (totalTasks / data.length).toFixed(1) : 0;

  // CSV Parsing Logic for Arctic Wolf export
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const parsedRows = parseCsv(text);
      setRawRows(parsedRows);

      const offenderCounts = aggregateOffenders(parsedRows);
      const parsedData = Object.entries(offenderCounts).map(([name, value]) => ({ name, value }));

      setData(parsedData);
      setAiReport(null); // Reset AI report when new data loads
    };
    reader.readAsText(file);
  };

  const offenderRows = useMemo(() => rawRows.filter(isOffender), [rawRows]);
  const [selectedUser, setSelectedUser] = useState(null);

  const selectedSessions = useMemo(() => {
    if (!selectedUser) return [];
    return offenderRows.filter((row) => row.fullName === selectedUser);
  }, [offenderRows, selectedUser]);

  // Helper to open file dialog
  const triggerUpload = () => {
    fileInputRef.current.click();
  };

  // Gemini API Call
  const generateAIReport = async () => {
    setLoadingAi(true);
    const apiKey = ""; // The execution environment provides the key at runtime.

    // Construct the prompt
    const prompt = `Act as a senior project manager analyzing team capacity.
    Here is the workload data (Name: Count of 'Not Started' items): 
    ${JSON.stringify(data)}

    Total Items: ${totalTasks}
    Team Size: ${data.length}
    Average Load: ${averageTasks}

    Please provide a professional, concise executive summary suitable for a slide deck.
    Format your response with the following sections using simple headers:
    
    1. dYs" Critical Bottlenecks
    Identify specific individuals with high loads (>= 6) and the risk they pose to the timeline.
    
    2. dY"S Workload Balance Analysis
    Comment on the overall distribution. Is the work evenly distributed or skewed? What percentage of the team is on track (<= 2 items)?
    
    3. Recommended Management Actions
    Provide 3 specific, actionable bullet points to resolve the backlog this week.
    
    Keep the tone professional, objective, and action-oriented. Avoid markdown formatting like **bold** or # headers if possible, just use plain text with line breaks or simple caps for headers to look good in a plain text block, or use standard markdown if the renderer supports it. (I will render this in a whitespace-pre-wrap container).`;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );

      const result = await response.json();
      const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (generatedText) {
        setAiReport(generatedText);
      } else {
        setAiReport("Could not generate report. Please try again.");
      }
    } catch (error) {
      console.error("AI Error:", error);
      setAiReport("Error connecting to AI service. Please check your connection.");
    } finally {
      setLoadingAi(false);
    }
  };

  // Color logic for urgency
  const getBarColor = (value) => {
    if (value >= 6) return "#ef4444"; // Red for high
    if (value >= 3) return "#f59e0b"; // Orange for medium
    return "#3b82f6"; // Blue for normal
  };

  return (
    <div className="min-h-screen bg-gray-100 px-6 py-6 font-sans text-gray-800 flex justify-center">
      <div className="w-full max-w-[1920px] min-h-[1080px] flex flex-col gap-6">
        {/* Hidden Input for File Upload */}
        <input
          type="file"
          accept=".csv"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Header & Controls */}
        <div className="w-full mb-2 flex flex-col xl:flex-row justify-between items-start xl:items-center bg-white px-6 py-4 rounded-2xl shadow-sm border border-gray-200">
          <div className="mb-4 xl:mb-0">
            <h1 className="text-3xl font-bold text-gray-900">Team Status Overview</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 mt-1">
              <FileText size={14} />
              <span>Source: {fileName}</span>
              <span className="mx-2 hidden sm:inline">|</span>
              <span>Total Items: {totalTasks}</span>
              <span className="mx-2 hidden sm:inline">|</span>
              <span>Date: {todayLabel}</span>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap justify-center">
            <button
              onClick={triggerUpload}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-gray-800 text-white hover:bg-black transition-colors mr-2"
            >
              <UploadCloud size={16} /> Import CSV
            </button>

            <div className="h-8 w-px bg-gray-300 mx-2 hidden md:block"></div>

            <button
              onClick={() => setViewMode("chart")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "chart"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <BarChart2 size={16} /> Chart
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "grid"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <LayoutGrid size={16} /> Heatmap
            </button>
            <button
              onClick={() => setViewMode("summary")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === "summary"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <List size={16} /> Summary
            </button>
            <button
              onClick={() => setViewMode("ai-report")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-purple-200 ${
                viewMode === "ai-report"
                  ? "bg-purple-600 text-white"
                  : "bg-purple-50 text-purple-700 hover:bg-purple-100"
              }`}
            >
              <Sparkles size={16} /> AI Report
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="w-full bg-white px-10 py-8 rounded-2xl shadow-lg border border-gray-200 flex-1 min-h-[760px]">
          {data.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 py-20">
              <UploadCloud size={48} className="mb-4 text-gray-300" />
              <p>No data found. Upload a CSV file to begin.</p>
              <p className="text-sm mt-2">Upload the Arctic Wolf export; required columns: User First/Last Name, Status, Title, Sent Date (UTC).</p>
            </div>
          ) : (
            <>
              {/* CHART VIEW */}
              {viewMode === "chart" && (
                <div className="h-full flex flex-col">
                  <div className="mb-6 flex flex-col lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-800">Workload Distribution</h2>
                      <p className="text-gray-500 text-sm">
                        Sorted by count of "Not Started" items. Highlighting outliers.
                      </p>
                    </div>
                    <p className="text-xs text-gray-400 mt-3 lg:mt-0">Canvas optimized for 1920 x 1080 export</p>
                  </div>
                  <div className="flex-grow min-h-[720px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        layout="vertical"
                        data={sortedData}
                        margin={{ top: 10, right: 40, left: 60, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                        <XAxis type="number" hide />
                        <YAxis
                          dataKey="name"
                          type="category"
                          width={160}
                          tick={{ fontSize: 12, fill: "#374151" }}
                          interval={0}
                        />
                        <Tooltip
                          cursor={{ fill: "#f3f4f6" }}
                          contentStyle={{
                            borderRadius: "8px",
                            border: "none",
                            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                          }}
                        />
                        <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={20}>
                          {sortedData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getBarColor(entry.value)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* GRID VIEW */}
              {viewMode === "grid" && (
                <div className="h-full flex flex-col gap-6">
                  <div className="flex justify-between items-end">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-800">Team Heatmap</h2>
                      <p className="text-gray-500 text-sm">Visualizing item density across the team.</p>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-red-500 rounded-sm"></div> High Load (6+)
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-amber-400 rounded-sm"></div> Medium (3-5)
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-3 h-3 bg-blue-100 rounded-sm"></div> Low (1-2)
                      </div>
                    </div>
                  </div>

                  <div className="relative w-full aspect-[16/9] overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-white shadow-inner">
                    <div className="absolute inset-6">
                      <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-4 h-full overflow-auto">
                        {sortedData.map((person, idx) => (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedUser(person.name)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") setSelectedUser(person.name);
                            }}
                            key={idx}
                            className={`p-4 rounded-xl border flex flex-col justify-between items-start transition-all h-full
                              ${
                                person.value >= 6
                                  ? "bg-red-50 border-red-200"
                                  : person.value >= 3
                                  ? "bg-amber-50 border-amber-200"
                                  : "bg-white border-gray-100 hover:border-blue-300 shadow-sm"
                              }
                            `}
                          >
                            <span
                              className={`text-xs font-semibold uppercase tracking-wider mb-2 
                              ${
                                person.value >= 6
                                  ? "text-red-600"
                                  : person.value >= 3
                                  ? "text-amber-600"
                                  : "text-gray-400"
                              }`}
                            >
                              {person.value >= 6 ? "Action Needed" : " "}
                            </span>

                            <div className="w-full flex justify-between items-end">
                              <span className="font-medium text-gray-700 truncate w-32" title={person.name}>
                                {person.name}
                              </span>
                              <span
                                className={`text-3xl font-bold 
                                ${
                                  person.value >= 6
                                    ? "text-red-600"
                                    : person.value >= 3
                                    ? "text-amber-600"
                                    : "text-gray-800"
                                }`}
                              >
                                {person.value}
                              </span>
                            </div>

                            {/* Progress bar visual */}
                            <div className="w-full h-2 bg-gray-100 rounded-full mt-3 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${getBarColor(person.value)}`}
                                style={{ width: `${(person.value / 10) * 100}%` }}
                              ></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SUMMARY VIEW */}
              {viewMode === "summary" && (
                <div className="flex flex-col h-full">
                  <div className="mb-8 border-b border-gray-100 pb-4">
                    <h2 className="text-2xl font-bold text-gray-800">Executive Summary</h2>
                    <div className="flex gap-8 mt-4">
                      <div>
                        <span className="block text-sm text-gray-500">Total "Not Started"</span>
                        <span className="text-3xl font-bold text-blue-600">{totalTasks}</span>
                      </div>
                      <div>
                        <span className="block text-sm text-gray-500">Team Size</span>
                        <span className="text-3xl font-bold text-gray-800">{data.length}</span>
                      </div>
                      <div>
                        <span className="block text-sm text-gray-500">Average per Person</span>
                        <span className="text-3xl font-bold text-gray-800">{averageTasks}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    {/* Focus Areas */}
                    <div className="bg-red-50 p-6 rounded-xl border border-red-100">
                      <div className="flex items-center gap-2 mb-4">
                        <AlertCircle className="text-red-600" />
                        <h3 className="text-lg font-bold text-red-800">Primary Focus Areas</h3>
                      </div>
                      <p className="text-sm text-red-600 mb-4">
                        These team members have a significantly higher volume of "Not Started" items.
                      </p>
                      <div className="space-y-3">
                        {sortedData
                          .filter((d) => d.value >= 6)
                          .map((person, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm border-l-4 border-red-500"
                            >
                              <span className="font-bold text-gray-800">{person.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">Items:</span>
                                <span className="text-xl font-bold text-red-600">{person.value}</span>
                              </div>
                            </div>
                          ))}
                        {sortedData
                          .filter((d) => d.value >= 3 && d.value < 6)
                          .map((person, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm border-l-4 border-amber-400"
                            >
                              <span className="font-bold text-gray-800">{person.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">Items:</span>
                                <span className="text-xl font-bold text-amber-600">{person.value}</span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* On Track */}
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                          <Trophy size={16} />
                        </div>
                        <h3 className="text-lg font-bold text-gray-800">Within Standard Range (1-2)</h3>
                      </div>
                      <p className="text-sm text-gray-500 mb-4">
                        The majority of the team ({sortedData.filter((d) => d.value <= 2).length} members) has a
                        manageable backlog.
                      </p>

                      {/* Updated to Grid for Screenshot visibility */}
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                        {sortedData
                          .filter((d) => d.value <= 2)
                          .map((person, i) => (
                            <div
                              key={i}
                              className="flex justify-between items-center p-2 bg-gray-50 rounded border border-gray-100"
                            >
                              <span className="text-sm font-medium text-gray-600 truncate mr-2" title={person.name}>
                                {person.name}
                              </span>
                              <span className="text-xs font-bold bg-white px-2 py-1 rounded text-gray-500 border min-w-[24px] text-center">
                                {person.value}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* AI REPORT VIEW */}
              {viewMode === "ai-report" && (
                <div className="h-full flex flex-col items-center">
                  <div className="mb-8 w-full border-b border-gray-100 pb-4 flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-purple-800 flex items-center gap-2">
                      <Sparkles className="text-purple-600" />
                      AI Strategic Analysis
                    </h2>
                    <button
                      onClick={generateAIReport}
                      disabled={loadingAi}
                      className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      {loadingAi ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                      {aiReport ? "Regenerate Analysis" : "Generate Analysis"}
                    </button>
                  </div>

                  {loadingAi && (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                      <Loader2 size={48} className="animate-spin text-purple-600 mb-4" />
                      <p className="text-lg font-medium">Analyzing team workload data...</p>
                      <p className="text-sm">Consulting Gemini AI for strategic insights.</p>
                    </div>
                  )}

                  {!loadingAi && !aiReport && (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                      <Sparkles size={64} className="mb-4 text-purple-200" />
                      <p className="text-lg text-gray-600 font-medium">Ready to analyze your data</p>
                      <p className="max-w-md text-center mt-2">
                        Click the "Generate Analysis" button to have Gemini AI read your current data set and produce an
                        executive summary suitable for your slide deck.
                      </p>
                      <button
                        onClick={generateAIReport}
                        className="mt-6 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-bold shadow-lg shadow-purple-200"
                      >
                        Generate Report
                      </button>
                    </div>
                  )}

                  {!loadingAi && aiReport && (
                    <div className="w-full bg-purple-50 p-8 rounded-xl border border-purple-100 shadow-inner overflow-auto max-h-[720px]">
                      <div className="prose prose-purple max-w-none whitespace-pre-wrap font-medium text-gray-700 leading-relaxed">
                        {aiReport}
                      </div>
                      <div className="mt-8 pt-4 border-t border-purple-200 text-center text-xs text-purple-400">
                        Generated by Gemini AI - Review before sharing
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="text-center text-gray-400 text-sm">
          <p>Tip: Maximize window or zoom out (Ctrl -) to capture high-res screenshots for your slide deck.</p>
        </div>
      </div>
      <UserModal userName={selectedUser} sessions={selectedSessions} onClose={() => setSelectedUser(null)} />
    </div>
  );
}

const pendingDays = (sentDate) => {
  const sent = new Date(sentDate);
  if (Number.isNaN(sent.getTime())) return "N/A";
  const diff = Date.now() - sent.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const UserModal = ({ userName, sessions, onClose }) => {
  if (!userName) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
      <div className="bg-white w-full max-w-3xl rounded-lg shadow-xl p-6 relative">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-xs uppercase text-gray-400 tracking-wide">User</p>
            <h2 className="text-2xl font-bold text-gray-900">{userName}</h2>
            <p className="text-sm text-gray-600 mt-1">
              {sessions.length} incomplete session{sessions.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 transition text-sm font-semibold"
          >
            Close
          </button>
        </div>

        <div className="space-y-3 max-h-[60vh] overflow-auto pr-1">
          {sessions.map((session, idx) => (
            <div
              key={`${session.title}-${idx}`}
              className="border border-gray-200 rounded-lg p-4 bg-gray-50 flex flex-col gap-1"
            >
              <div className="flex justify-between items-center">
                <p className="font-semibold text-gray-900 truncate" title={session.title}>
                  {session.title || "Untitled Session"}
                </p>
                <span className="text-xs px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                  {session.status || "Unknown"}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <span className="text-gray-400">Sent:</span> {session.sentDate || "Unknown"}
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-gray-400">Pending:</span> {pendingDays(session.sentDate)} days
                </span>
              </div>
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="text-center text-gray-500 py-8">
              No incomplete sessions found for this user.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
