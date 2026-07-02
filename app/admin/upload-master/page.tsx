"use client";

import { FormEvent, useEffect, useState } from "react";
import { TopNav } from "@/components/ui/TopNav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBanner } from "@/components/ui/StatusBanner";

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
    <div className="min-h-screen bg-background">
      <TopNav />
      <div className="flex items-start justify-center px-4 py-12">
        <Card className="w-full max-w-3xl p-8 space-y-6">
          <PageHeader
            eyebrow="Admin"
            title="Upload Master List"
            description="Upload a monthly All_users.csv, map name columns, and save to the master list."
          />

          <div className="rounded-lg border border-border bg-surface-muted p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Current Master File</p>
                <p className="text-sm text-foreground/70 mt-1">
                  Last updated:{" "}
                  {loadingMasterInfo
                    ? "Loading..."
                    : masterInfo?.uploadedAt
                      ? new Date(masterInfo.uploadedAt).toLocaleString()
                      : "No master file yet"}
                </p>
                {!loadingMasterInfo && masterInfo?.hasFile ? (
                  <p className="text-xs text-foreground/50 mt-1">
                    {masterInfo.count} records in the normalized master file
                  </p>
                ) : null}
              </div>
              {masterInfo?.hasFile ? (
                <a
                  href="/api/master-file/export"
                  className="inline-flex items-center justify-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground shadow-sm hover:bg-surface-muted"
                >
                  Export Current Master
                </a>
              ) : (
                <span className="inline-flex items-center justify-center px-4 py-2 rounded-md border border-border bg-surface-muted text-sm font-semibold text-foreground/40">
                  Export Current Master
                </span>
              )}
            </div>
          </div>

          <form onSubmit={handleUpload} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-foreground/70">CSV file</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-2 block w-full text-sm text-foreground/70"
              />
            </label>
            <Button type="submit" disabled={isUploading}>
              {isUploading ? "Uploading..." : "Upload File"}
            </Button>
          </form>

          {uploadResult && (
            <div className="rounded-lg border border-success/20 bg-success-soft p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-success">Upload successful</p>
                <p className="text-sm text-foreground/80 break-all">URL: {uploadResult.fileUrl}</p>
                <p className="text-xs text-foreground/60">
                  Uploaded at: {new Date(uploadResult.uploadedAt).toLocaleString()}
                </p>
              </div>

              <div className="rounded-md border border-border bg-surface p-3">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-semibold text-foreground">Header mapping</p>
                  {loadingHeaders && <p className="text-xs text-foreground/50">Loading headers...</p>}
                </div>
                {headers.length === 0 ? (
                  <p className="text-xs text-foreground/60">
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
                        <label key={field.key} className="text-sm text-foreground/70 flex flex-col gap-1">
                          <span className="font-medium">{field.label}</span>
                          <select
                            value={mapping[field.key]}
                            onChange={(e) => updateMapping(field.key, e.target.value)}
                            className="border border-border rounded-md px-3 py-2 text-sm text-foreground bg-surface shadow-sm"
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
                    <p className="text-xs text-foreground/50 mt-2">
                      Map the email column, and either a combined Full Name column, or both First Name and Last Name.
                    </p>
                  </>
                )}
              </div>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleProcess}
                disabled={isProcessing || !allMapped}
              >
                {isProcessing ? "Processing..." : "Process CSV Into Master"}
              </Button>
            </div>
          )}

          {message && <StatusBanner tone="info">{message}</StatusBanner>}

          {error && <StatusBanner tone="danger">{error}</StatusBanner>}
        </Card>
      </div>
    </div>
  );
}
