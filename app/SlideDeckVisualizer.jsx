"use client";

import React, { useState, useRef } from "react";
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

// No more demo data — start with empty dataset
export default function SlideDeckVisualizer() {
  const [data, setData] = useState([]);
  const [viewMode, setViewMode] = useState("chart");
  const fileInputRef = useRef(null);
  const [fileName, setFileName] = useState("No File Loaded");

  // AI State
  const [aiReport, setAiReport] = useState(null);
  const [loadingAi, setLoadingAi] = useState(false);

  // Derived stats
  const sortedData = [...data].sort((a, b) => b.value - a.value);
  const totalTasks = data.reduce((acc, curr) => acc + curr.value, 0);
  const averageTasks = data.length
    ? (totalTasks / data.length).toFixed(1)
    : 0;

  // CSV Parser — Name + Grand Total
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const rows = text
        .split("\n")
        .map((r) => r.trim())
        .filter((r) => r.length > 0);

      if (rows.length < 2) {
        alert("CSV must contain a header row and at least one data row.");
        return;
      }

      // Parse header row
      const header = rows[0]
        .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
        .map((h) => h.trim().toLowerCase());

      const nameIndex = header.indexOf("name");
      const valueIndex = header.indexOf("grand total");

      if (nameIndex === -1 || valueIndex === -1) {
        alert(`CSV must include columns: "Name" and "Grand Total"`);
        return;
      }

      // Parse data rows
      const parsedData = rows
        .slice(1)
        .map((row) => {
          const cols = row.split(
            /,(?=(?:(?:[^"]*"){2})*[^"]*$)/
          );

          const rawName = cols[nameIndex] || "";
          const rawValue = cols[valueIndex] || "";

          const name = rawName.replace(/^"|"$/g, "").trim();
          const value = parseInt(
            rawValue.replace(/^"|"$/g, "").trim(),
            10
          );

          // Ignore the "Grand Total" row completely
            if (!name || name.toLowerCase() === "grand total" || isNaN(value)) return null;

            return { name, value };

        })
        .filter(Boolean);

      if (parsedData.length === 0) {
        alert(
          `No valid data found. Ensure your CSV includes proper "Name" and "Grand Total" values.`
        );
        return;
      }

      setData(parsedData);
      setAiReport(null);
    };

    reader.readAsText(file);
  };

  const triggerUpload = () => {
    fileInputRef.current.click();
  };

  // Gemini API
  const generateAIReport = async () => {
  setAiReport(
    "AI analysis is not enabled. Once an OpenAI API key is added, this feature will automatically activate."
  );
};


  // Color logic
  const getBarColor = (value) => {
    if (value >= 6) return "#ef4444";
    if (value >= 3) return "#f59e0b";
    return "#3b82f6";
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans text-gray-800">
      {/* Upload Input */}
      <input
        type="file"
        accept=".csv"
        ref={fileInputRef}
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* HEADER */}
      <div className="max-w-6xl mx-auto mb-8 flex flex-col xl:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="mb-4 xl:mb-0">
          <h1 className="text-2xl font-bold text-gray-900">
            Team Status Overview
          </h1>
          <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
            <FileText size={14} />
            <span>Source: {fileName}</span>
            <span className="mx-2">|</span>
            <span>Total Items: {totalTasks}</span>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap justify-center">
          <button
            onClick={triggerUpload}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-gray-800 text-white hover:bg-black transition-colors"
          >
            <UploadCloud size={16} /> Import CSV
          </button>

          <div className="h-8 w-px bg-gray-300 mx-2 hidden md:block"></div>

          {/* NAV BUTTONS */}
          {[
            ["chart", "Chart", <BarChart2 size={16} />],
            ["grid", "Heatmap", <LayoutGrid size={16} />],
            ["summary", "Summary", <List size={16} />],
            ["ai-report", "AI Report", <Sparkles size={16} />],
          ].map(([mode, label, icon]) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                viewMode === mode
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="max-w-6xl mx-auto bg-white p-8 rounded-xl shadow-lg border border-gray-200 min-h-[600px]">
        {data.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 py-20">
            <UploadCloud size={48} className="mb-4 text-gray-300" />
            <p>No data found. Upload a CSV to begin.</p>
            <p className="text-sm mt-2">
              Required CSV Columns: <b>Name</b>, <b>Grand Total</b>
            </p>
          </div>
        ) : (
          <>
            {/* CHART VIEW */}
            {viewMode === "chart" && (
              <div className="h-full flex flex-col">
                <h2 className="text-xl font-bold mb-6">
                  Workload Distribution
                </h2>
                <div className="flex-grow h-[600px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={sortedData}
                      margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={false}
                        stroke="#e5e7eb"
                      />
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={140}
                        interval={0}
                        tick={{
                          fontSize: 12,
                          fill: "#374151",
                        }}
                      />
                      <Tooltip />
                      <Bar
                        dataKey="value"
                        radius={[0, 4, 4, 0]}
                        barSize={18}
                      >
                        {sortedData.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={getBarColor(entry.value)}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* GRID VIEW */}
            {viewMode === "grid" && (
              <div>
                <h2 className="text-xl font-bold mb-6">Team Heatmap</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {sortedData.map((person, idx) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-lg border ${
                        person.value >= 6
                          ? "bg-red-50 border-red-200"
                          : person.value >= 3
                          ? "bg-amber-50 border-amber-200"
                          : "bg-white border-gray-100"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-gray-700 truncate w-24">
                          {person.name}
                        </span>
                        <span
                          className={`text-2xl font-bold ${
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
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SUMMARY */}
            {viewMode === "summary" && (
              <div>
                <h2 className="text-xl font-bold mb-6">Executive Summary</h2>

                <div className="flex gap-10 mb-10">
                  <div>
                    <p className="text-sm text-gray-500">Total Items</p>
                    <p className="text-3xl font-bold text-blue-600">
                      {totalTasks}
                    </p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">Team Size</p>
                    <p className="text-3xl font-bold">{data.length}</p>
                  </div>

                  <div>
                    <p className="text-sm text-gray-500">Average</p>
                    <p className="text-3xl font-bold">{averageTasks}</p>
                  </div>
                </div>

                {/* List of high + medium loads */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-lg font-bold text-red-700">
                      High / Medium Load
                    </h3>
                    <div className="mt-4 space-y-3">
                      {sortedData
                        .filter((p) => p.value >= 3)
                        .map((p, i) => (
                          <div
                            key={i}
                            className="flex justify-between bg-red-50 rounded-lg p-3 border border-red-100"
                          >
                            <span>{p.name}</span>
                            <span className="font-bold text-red-600">
                              {p.value}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-green-700">
                      Low Load (1–2)
                    </h3>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {sortedData
                        .filter((p) => p.value <= 2)
                        .map((p, i) => (
                          <div
                            key={i}
                            className="bg-gray-50 border rounded p-2 flex justify-between"
                          >
                            <span className="truncate w-20">{p.name}</span>
                            <span className="text-gray-600">{p.value}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* AI REPORT */}
            {viewMode === "ai-report" && (
              <div>
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-xl font-bold text-purple-700 flex items-center gap-2">
                    <Sparkles /> AI Strategic Analysis
                  </h2>

                  <button
                    onClick={generateAIReport}
                    disabled={loadingAi}
                    className="px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                  >
                    {loadingAi ? "Analyzing..." : "Generate Analysis"}
                  </button>
                </div>

                {loadingAi && (
                  <div className="flex flex-col items-center py-20">
                    <Loader2
                      size={48}
                      className="animate-spin text-purple-600 mb-4"
                    />
                    <p className="text-gray-500">
                      Consulting Gemini AI...
                    </p>
                  </div>
                )}

                {!loadingAi && aiReport && (
                  <div className="bg-purple-50 p-8 border rounded-xl max-h-[600px] overflow-auto">
                    <pre className="whitespace-pre-wrap text-gray-700">
                      {aiReport}
                    </pre>
                  </div>
                )}

                {!loadingAi && !aiReport && (
                  <div className="text-center text-gray-500 py-20">
                    <Sparkles size={48} className="text-purple-300 mb-4" />
                    <p>Click "Generate Analysis" to begin.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="text-center mt-8 text-gray-400 text-sm">
        <p>
          Tip: Maximize window or zoom out (Ctrl -) to capture high-res
          screenshots.
        </p>
      </div>
    </div>
  );
}
