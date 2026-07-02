"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
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
  const [headers, setHeaders] = useState<string[]>([]);
  const [loadingHeaders, setLoadingHeaders] = useState(false);
  const [mapping, setMapping] = useState({
    firstName: "",
    lastName: "",
    email: "",
    status: "",
    title: "",
    sentDate: "",
  });

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please choose a CSV file first.");
      return;
    }
    setError(null);
    setSnapshotMessage(null);
    setIsUploading(true);
    setMapping({
      firstName: "",
      lastName: "",
      email: "",
      status: "",
      title: "",
      sentDate: "",
    });
    setHeaders([]);
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

  const allMapped = Object.values(mapping).every(Boolean) && headers.length > 0;

  const updateMapping = (key: keyof typeof mapping, value: string) => {
    setMapping((prev) => ({ ...prev, [key]: value }));
  };

  const handleProcess = async () => {
    if (!uploadResult?.filePath && !uploadResult?.fileUrl) return;
    if (!allMapped) {
      setError("Please map all fields before processing.");
      return;
    }
    setIsProcessing(true);
    setError(null);
    setSnapshotMessage(null);
    try {
      const res = await fetch("/api/process-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: uploadResult.filePath,
          fileUrl: uploadResult.fileUrl,
          mapping,
        }),
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
    <div className="min-h-screen bg-background">
      <TopNav />
      <div className="flex items-start justify-center px-4 py-12">
        <Card className="w-full max-w-3xl p-8 space-y-6">
          <PageHeader
            eyebrow="Admin"
            title="Upload & Process CSV"
            description="Upload a CSV to object storage, map your columns, then process it into a snapshot for the dashboard."
          />
          <div className="text-xs text-primary -mt-4">
            <Link href="/templates/snapshot-template.csv" className="underline">
              Download template (optional)
            </Link>
            <span className="mx-2 text-foreground/30">·</span>
            <Link href="/admin/upload-master" className="underline">
              Upload master list
            </Link>
            <span className="mx-2 text-foreground/30">·</span>
            <Link href="/admin/upload-photos" className="underline">
              Upload grid photos
            </Link>
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {([
                      { key: "email", label: "User Email Address" },
                      { key: "firstName", label: "First Name" },
                      { key: "lastName", label: "Last Name" },
                      { key: "status", label: "Status" },
                      { key: "title", label: "Title" },
                      { key: "sentDate", label: "Sent Date" },
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
                )}
              </div>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleProcess}
                disabled={isProcessing || !allMapped}
              >
                {isProcessing ? "Processing..." : "Process CSV Into Snapshot"}
              </Button>
            </div>
          )}

          {snapshotMessage && <StatusBanner tone="info">{snapshotMessage}</StatusBanner>}

          {error && <StatusBanner tone="danger">{error}</StatusBanner>}
        </Card>
      </div>
    </div>
  );
}
