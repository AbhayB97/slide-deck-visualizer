"use client";

import React from "react";

interface HeatmapProps {
  counts: Record<string, number>;
  onSelect: (fullName: string) => void;
}

const getTileColor = (count: number) => {
  if (count >= 6) return "bg-red-500 text-white";
  if (count >= 3) return "bg-yellow-400 text-gray-900";
  return "bg-blue-500 text-white";
};

export default function Heatmap({ counts, onSelect }: HeatmapProps) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    return (
      <div className="flex flex-col items-center justify-center text-gray-400 py-10">
        <p className="text-lg font-semibold">No offenders found yet.</p>
        <p className="text-sm">Upload a CSV to visualize incomplete sessions.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      {entries.map(([name, count]) => (
        <button
          key={name}
          onClick={() => onSelect(name)}
          className={`cursor-pointer rounded-lg shadow-sm hover:opacity-80 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${getTileColor(
            count
          )} p-4 flex flex-col items-start`}
          title={name}
        >
          <span className="text-sm font-semibold truncate w-full">{name}</span>
          <span className="text-2xl font-bold mt-2 leading-none">{count}</span>
          <span className="text-xs opacity-80 mt-1">incomplete</span>
        </button>
      ))}
    </div>
  );
}
