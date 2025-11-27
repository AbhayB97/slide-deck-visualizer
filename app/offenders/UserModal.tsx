"use client";

import React from "react";
import { CsvRow } from "./processCsv";

interface UserModalProps {
  userName: string | null;
  rows: CsvRow[];
  onClose: () => void;
}

const pendingDays = (sentDate: string) => {
  const sent = new Date(sentDate);
  if (Number.isNaN(sent.getTime())) return "N/A";
  const diff = Date.now() - sent.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

export default function UserModal({ userName, rows, onClose }: UserModalProps) {
  if (!userName) return null;

  const sessions = rows.filter((row) => row.fullName === userName);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
      <div className="bg-white w-full max-w-3xl rounded-lg shadow-xl p-6 relative">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-xs uppercase text-gray-400 tracking-wide">User</p>
            <h2 className="text-2xl font-bold text-gray-900">{userName}</h2>
            <p className="text-sm text-gray-500 mt-1">
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
                  {session.type || "Unknown"}
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
}
