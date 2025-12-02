"use client";

import { FormEvent, useState } from "react";

type UploadResponse = {
  success: boolean;
  fileUrl: string;
  fileName: string;
  uploadedAt: string;
};

type SnapshotResponse = {
  success: boolean;
  snapshotPath?: string;
  offenderCount?: number;
  snapshot?: {
    snapshotId: string;
    snapshotUrl: string;
    uploadedAt: string;
    offenderCount: number;
  };
  error?: string;
};

export default function AdminUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [snapshotMessage, setSnapshotMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please choose a CSV file first.");
      return;
    }
    setError(null);
    setSnapshotMessage(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload-csv", {
        method: "POST",
        body: formData,
      });
      const data: UploadResponse = await res.json();
      if (!res.ok || !data.success) {
        throw new Error((data as any)?.error || "Upload failed");
      }
      setUploadResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleProcess = async () => {
    if (!uploadResult?.fileUrl) return;
    setIsProcessing(true);
    setError(null);
    setSnapshotMessage(null);
    try {
      const res = await fetch("/api/process-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileUrl: uploadResult.fileUrl }),
      });
      const data: SnapshotResponse = await res.json();
      if (!res.ok || !data.success || !data.snapshot) {
        throw new Error(data.error || "Processing failed");
      }
      setSnapshotMessage(
        `Snapshot created: ${data.snapshot.snapshotId} (${data.snapshot.offenderCount} incomplete)`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg border border-gray-200 p-8 space-y-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400">Admin</p>
          <h1 className="text-3xl font-bold text-gray-900">Upload & Process CSV</h1>
          <p className="text-sm text-gray-600 mt-1">
            Upload a CSV to Blob storage, then process it into a snapshot for the dashboard.
          </p>
        </div>

        <form onSubmit={handleUpload} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">CSV file</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-2 block w-full text-sm text-gray-700"
            />
          </label>
          <button
            type="submit"
            disabled={isUploading}
            className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {isUploading ? "Uploading..." : "Upload to Blob"}
          </button>
        </form>

        {uploadResult && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-2">
            <p className="text-sm font-semibold text-green-800">Upload successful</p>
            <p className="text-sm text-green-900 break-all">URL: {uploadResult.fileUrl}</p>
            <p className="text-xs text-green-900">Uploaded at: {new Date(uploadResult.uploadedAt).toLocaleString()}</p>
            <button
              type="button"
              onClick={handleProcess}
              disabled={isProcessing}
              className="inline-flex items-center px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-semibold shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {isProcessing ? "Processing..." : "Process CSV Into Snapshot"}
            </button>
          </div>
        )}

        {snapshotMessage && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-800">{snapshotMessage}</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-800">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
