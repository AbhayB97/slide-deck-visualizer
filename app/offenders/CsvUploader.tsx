"use client";

import React, { useRef } from "react";
import { parseCsv, CsvRow } from "./processCsv";

interface CsvUploaderProps {
  onRowsParsed: (rows: CsvRow[]) => void;
}

export default function CsvUploader({ onRowsParsed }: CsvUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const rows = parseCsv(text);

    if (!rows.length) {
      alert("Could not parse CSV. Ensure headers match Arctic Wolf export.");
      return;
    }

    onRowsParsed(rows);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        onChange={handleUpload}
        className="hidden"
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="px-4 py-2 bg-gray-900 text-white rounded-lg shadow-sm hover:bg-black transition text-sm font-semibold"
      >
        Import CSV
      </button>
      <p className="text-sm text-gray-500">
        Upload the full weekly export. We will keep only incomplete sessions in memory.
      </p>
    </div>
  );
}
