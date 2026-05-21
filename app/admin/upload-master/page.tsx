"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type UploadResponse = {
  success: boolean;
  fileUrl: string;
  filePath: string;
  fileName: string;
  uploadedAt: string;
  error?: string;
};

type MasterResponse = {
  success: boolean;
  count?: number;
  error?: string;
};

type MasterFileInfoResponse = {
  success: boolean;
  uploadedAt: string | null;
  count: number;
  hasFile: boolean;
  error?: string;
};

export default function AdminUploadMasterPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loadingHeaders, setLoadingHeaders] = useState(false);
  const [masterInfo, setMasterInfo] = useState<MasterFileInfoResponse | null>(null);
  const [loadingMasterInfo, setLoadingMasterInfo] = useState(true);
  const [mapping, setMapping] = useState({
    firstName: "",
    lastName: "",
    fullName: "",
    email: "",
  });

  useEffect(() => {
    void loadMasterInfo();
  }, []);

  const loadMasterInfo = async () => {
    try {
      setLoadingMasterInfo(true);
      const res = await fetch("/api/master-file");
      const data: MasterFileInfoResponse = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to load current master file");
      }
      setMasterInfo(data);
    } catch (err) {
      setMasterInfo(null);
      setError((prev) => prev ?? (err instanceof Error ? err.message : "Failed to load current master file"));
    } finally {
      setLoadingMasterInfo(false);
    }
  };

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please choose a CSV file first.");
      return;
    }
    setError(null);
    setMessage(null);
    setIsUploading(true);
    setHeaders([]);
    setMapping({ firstName: "", lastName: "", fullName: "", email: "" });
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload-csv", {
        method: "POST",
        body: formData,
      });
      const data: UploadResponse = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Upload failed");
      }
      setUploadResult(data);
      await loadHeaders(data.fileUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const detectDelimiter = (line: string) => {
    const delimiters = [",", "\t", ";", "|"];
    const scored = delimiters.map((d) => ({
      d,
      count: (line.match(new RegExp(`\\${d}`, "g")) || []).length,
    }));
    const best = scored.sort((a, b) => b.count - a.count)[0];
    return best && best.count > 0 ? best.d : ",";
  };

  const loadHeaders = async (url: string) => {
    try {
      setLoadingHeaders(true);
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error("Failed to read CSV");
      }
      const text = await res.text();
      const firstLine = text.split(/\r?\n/)[0] ?? "";
      const delimiter = detectDelimiter(firstLine);
      const parsed = firstLine.split(delimiter).map((h) => h.replace(/^\uFEFF/, "").trim());
      setHeaders(parsed.filter(Boolean));
    } catch {
      setHeaders([]);
      setError("Could not read CSV headers for mapping");
    } finally {
      setLoadingHeaders(false);
    }
  };

  const allMapped =
    headers.length > 0 &&
    Boolean(mapping.email) &&
    (Boolean(mapping.fullName) ||
      (Boolean(mapping.firstName) && Boolean(mapping.lastName)));

  const updateMapping = (key: keyof typeof mapping, value: string) => {
    setMapping((prev) => ({ ...prev, [key]: value }));
  };

  const handleProcess = async () => {
    if (!uploadResult?.filePath && !uploadResult?.fileUrl) return;
    if (!allMapped) {
      setError("Please map all fields before processing (full name or first + last).");
      return;
    }
    setIsProcessing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/process-master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: uploadResult.filePath,
          fileUrl: uploadResult.fileUrl,
          mapping: {
            firstName: mapping.firstName || undefined,
            lastName: mapping.lastName || undefined,
            fullName: mapping.fullName || undefined,
            email: mapping.email || undefined,
          },
        }),
      });
      const data: MasterResponse = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Processing failed");
      }
      setMessage(`Master list saved (${data.count ?? 0} names)`);
      await loadMasterInfo();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-lg border border-gray-200 p-8 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400">Admin</p>
            <h1 className="text-3xl font-bold text-gray-900">Upload Master List</h1>
            <p className="text-sm text-gray-600 mt-1">
              Upload a monthly All_users.csv, map name columns, and save to the master list.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin/upload"
              className="text-sm text-blue-700 underline"
            >
              Upload weekly CSV
            </Link>
            <Link
              href="/admin/upload-photos"
              className="text-sm text-blue-700 underline"
            >
              Upload photos
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">Current Master File</p>
              <p className="text-sm text-gray-700 mt-1">
                Last updated:{" "}
                {loadingMasterInfo
                  ? "Loading..."
                  : masterInfo?.uploadedAt
                    ? new Date(masterInfo.uploadedAt).toLocaleString()
                    : "No master file yet"}
              </p>
              {!loadingMasterInfo && masterInfo?.hasFile ? (
                <p className="text-xs text-gray-500 mt-1">
                  {masterInfo.count} records in the normalized master file
                </p>
              ) : null}
            </div>
            {masterInfo?.hasFile ? (
              <a
                href="/api/master-file/export"
                className="inline-flex items-center justify-center px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-100"
              >
                Export Current Master
              </a>
            ) : (
              <span className="inline-flex items-center justify-center px-4 py-2 rounded-md border border-gray-200 bg-gray-100 text-sm font-semibold text-gray-400">
                Export Current Master
              </span>
            )}
          </div>
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
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold text-green-800">Upload successful</p>
              <p className="text-sm text-green-900 break-all">URL: {uploadResult.fileUrl}</p>
              <p className="text-xs text-green-900">
                Uploaded at: {new Date(uploadResult.uploadedAt).toLocaleString()}
              </p>
            </div>

            <div className="rounded-md border border-gray-200 bg-white p-3">
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-semibold text-gray-900">Header mapping</p>
                {loadingHeaders && <p className="text-xs text-gray-500">Loading headers...</p>}
              </div>
              {headers.length === 0 ? (
                <p className="text-xs text-gray-600">
                  Headers could not be detected. Please re-upload or check the file format.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {([
                      { key: "email", label: "User Email Address" },
                      { key: "fullName", label: "Full Name (combined)" },
                      { key: "firstName", label: "First Name" },
                      { key: "lastName", label: "Last Name" },
                    ] as const).map((field) => (
                      <label key={field.key} className="text-sm text-gray-700 flex flex-col gap-1">
                        <span className="font-medium">{field.label}</span>
                        <select
                          value={mapping[field.key]}
                          onChange={(e) => updateMapping(field.key, e.target.value)}
                          className="border rounded-md px-3 py-2 text-sm text-gray-800 bg-white shadow-sm"
                        >
                          <option value="">Select column</option>
                          {headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Map the email column, and either a combined Full Name column, or both First Name and Last Name.
                  </p>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={handleProcess}
              disabled={isProcessing || !allMapped}
              className="inline-flex items-center px-3 py-2 rounded-md bg-emerald-600 text-white text-sm font-semibold shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {isProcessing ? "Processing..." : "Process CSV Into Master"}
            </button>
          </div>
        )}

        {message && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-800">{message}</p>
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
