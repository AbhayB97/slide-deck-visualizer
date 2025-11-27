"use client";

import React, { useEffect, useMemo, useState } from "react";
import CsvUploader from "./CsvUploader";
import Heatmap from "./Heatmap";
import UserModal from "./UserModal";
import { CsvRow, isOffender } from "./processCsv";
import { loadHistory, OffenderHistoryItem, updateHistory } from "./historyStore";

export default function OffendersPage() {
  const [rawRows, setRawRows] = useState<CsvRow[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, OffenderHistoryItem>>({});

  const offenderRows = useMemo(() => rawRows.filter(isOffender), [rawRows]);

  const offenderCounts = useMemo(() => {
    return offenderRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.fullName] = (acc[row.fullName] ?? 0) + 1;
      return acc;
    }, {});
  }, [offenderRows]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    if (!offenderRows.length) return;
    setHistory(updateHistory(offenderRows));
  }, [offenderRows]);

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-8 flex justify-center">
      <div className="w-full max-w-6xl space-y-6">
        <header className="bg-white rounded-2xl shadow-md border border-gray-200 p-6">
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Slide Deck Visualizer</p>
              <h1 className="text-3xl font-bold text-gray-900">Incomplete Session Tracking</h1>
              <p className="text-sm text-gray-600 mt-1">
                Import the Arctic Wolf weekly export to surface offenders, track repeats, and drill into pending
                sessions.
              </p>
            </div>
            <CsvUploader onRowsParsed={setRawRows} />
          </div>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard label="Total Rows" value={rawRows.length} />
          <SummaryCard label="Incomplete Sessions" value={offenderRows.length} />
          <SummaryCard label="Unique Offenders" value={Object.keys(offenderCounts).length} />
          <SummaryCard label="History Tracked" value={Object.keys(history).length} helper="Stored locally" />
        </section>

        <section className="bg-white rounded-2xl shadow-md border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Heatmap</h2>
              <p className="text-sm text-gray-600">Click a user tile to see their incomplete sessions and age.</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <Legend color="bg-red-500" label="6+ pending" />
              <Legend color="bg-yellow-400" label="3-5 pending" />
              <Legend color="bg-blue-500" label="1-2 pending" />
            </div>
          </div>
          <Heatmap counts={offenderCounts} onSelect={setSelectedUser} />
        </section>
      </div>

      <UserModal userName={selectedUser} rows={offenderRows} onClose={() => setSelectedUser(null)} />
    </div>
  );
}

const SummaryCard = ({
  label,
  value,
  helper,
}: {
  label: string;
  value: number;
  helper?: string;
}) => (
  <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
    <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
    <p className="text-3xl font-bold text-gray-900">{value}</p>
    {helper && <p className="text-xs text-gray-500 mt-1">{helper}</p>}
  </div>
);

const Legend = ({ color, label }: { color: string; label: string }) => (
  <div className="flex items-center gap-1">
    <span className={`w-3 h-3 rounded-sm ${color}`}></span>
    <span>{label}</span>
  </div>
);
