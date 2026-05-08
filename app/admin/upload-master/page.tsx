"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, FileUp, Loader2, ShieldCheck } from "lucide-react";

type UploadResponse = {
  success: boolean;
  fileUrl: string;
  filePath: string;
  fileName: string;
  uploadedAt: string;
};

type MasterResponse = {
  success: boolean;
  count?: number;
  error?: string;
};

type ReviewResponse = {
  success: boolean;
  headers?: string[];
  sourceRowCount?: number;
  acceptedRowCount?: number;
  rejectedRowCount?: number;
  blankRowCount?: number;
  duplicateEmails?: Array<{ email: string; count: number }>;
  rejectedRows?: Array<{ rowNumber: number; reason: string }>;
  error?: string;
};

export default function AdminUploadMasterPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loadingHeaders, setLoadingHeaders] = useState(false);
  const [mapping, setMapping] = useState({
    firstName: "",
    lastName: "",
    fullName: "",
    email: "",
  });

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError("Please choose a CSV file first.");
      return;
    }

    setError(null);
    setMessage(null);
    setReview(null);
    setIsUploading(true);
    setHeaders([]);
    setMapping({ firstName: "", lastName: "", fullName: "", email: "" });

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload-csv", {
        method: "POST",
        body: formData,
      });
      const data: UploadResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error((data as { error?: string }).error || "Upload failed");
      }

      setUploadResult(data);
      await loadHeaders(data.filePath || data.fileUrl);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const loadHeaders = async (fileRef: string) => {
    try {
      setLoadingHeaders(true);
      const response = await fetch("/api/upload-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: fileRef, mode: "master" }),
      });
      const data: ReviewResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not load headers");
      }
      setHeaders(data.headers ?? []);
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
    setMapping((current) => ({ ...current, [key]: value }));
  };

  const handleReview = async () => {
    if (!uploadResult?.filePath && !uploadResult?.fileUrl) return;
    if (!allMapped) {
      setError("Map the email column and either a full name or first + last name before review.");
      return;
    }

    setIsReviewing(true);
    setError(null);
    setReview(null);

    try {
      const response = await fetch("/api/upload-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: uploadResult.filePath,
          fileUrl: uploadResult.fileUrl,
          mode: "master",
          mapping,
        }),
      });
      const data: ReviewResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Review failed");
      }
      setReview(data);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Review failed");
    } finally {
      setIsReviewing(false);
    }
  };

  const handleProcess = async () => {
    if (!uploadResult?.filePath && !uploadResult?.fileUrl) return;
    if (!allMapped || !review) {
      setError("Run review before processing the master list.");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/process-master", {
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
      const data: MasterResponse = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Processing failed");
      }

      setMessage(`Master list saved (${data.count ?? 0} names)`);
      setReview(null);
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : "Processing failed");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#f9f3e6_0%,#efe4d0_42%,#e4d7bf_100%)] px-4 py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="rounded-[2rem] border border-stone-300/70 bg-white/90 p-8 shadow-[0_30px_90px_rgba(120,93,35,0.12)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-700">Admin Flow</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight text-stone-950">
                Master List Intake
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
                Refresh the master population with an explicit review step so duplicates and missing names
                are visible before the list is committed.
              </p>
            </div>
            <Link href="/admin/upload" className="rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white">
              Upload weekly CSV
            </Link>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-4">
          <StepCard index="01" title="Upload" description="Stage the latest master file." active />
          <StepCard index="02" title="Map Fields" description="Match email and either combined or split name columns." active={Boolean(uploadResult)} />
          <StepCard index="03" title="Review" description="Check duplicates, rejects, and accepted rows." active={Boolean(review)} />
          <StepCard index="04" title="Process" description="Write the reviewed master list for downstream reporting." active={Boolean(message)} />
        </section>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[2rem] border border-stone-300/70 bg-white/90 p-8 shadow-[0_25px_70px_rgba(120,93,35,0.1)]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Step 1</p>
              <h2 className="mt-2 text-2xl font-black text-stone-950">Upload source file</h2>
            </div>
            <form onSubmit={handleUpload} className="mt-6 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-stone-700">CSV file</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  className="mt-2 block w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-700"
                />
              </label>
              <button
                type="submit"
                disabled={isUploading}
                className="inline-flex items-center gap-2 rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-60"
              >
                {isUploading ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
                {isUploading ? "Uploading..." : "Upload CSV"}
              </button>
            </form>

            {uploadResult ? (
              <div className="mt-6 rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-5 py-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-5 text-emerald-700" />
                  <div>
                    <p className="font-semibold text-emerald-900">Upload complete</p>
                    <p className="mt-1 text-sm text-emerald-800 break-all">{uploadResult.filePath}</p>
                    <p className="mt-1 text-xs text-emerald-700">
                      Uploaded {new Date(uploadResult.uploadedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-[2rem] border border-stone-300/70 bg-white/90 p-8 shadow-[0_25px_70px_rgba(120,93,35,0.1)] space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Step 2</p>
              <h2 className="mt-2 text-2xl font-black text-stone-950">Map name fields</h2>
              <p className="mt-2 text-sm text-stone-600">
                Email is required. Use either a combined full-name column or separate first and last names.
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50/70 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-stone-900">Detected headers</p>
                {loadingHeaders ? <p className="text-xs text-stone-500">Loading...</p> : null}
              </div>
              {headers.length === 0 ? (
                <p className="mt-3 text-sm text-stone-500">
                  Upload a CSV first. Header detection is handled by the server preview route.
                </p>
              ) : (
                <>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    {([
                      { key: "email", label: "User Email Address" },
                      { key: "fullName", label: "Full Name (combined)" },
                      { key: "firstName", label: "First Name" },
                      { key: "lastName", label: "Last Name" },
                    ] as const).map((field) => (
                      <label key={field.key} className="flex flex-col gap-1.5 text-sm text-stone-700">
                        <span className="font-medium">{field.label}</span>
                        <select
                          value={mapping[field.key]}
                          onChange={(event) => updateMapping(field.key, event.target.value)}
                          className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
                        >
                          <option value="">Select column</option>
                          {headers.map((header) => (
                            <option key={header} value={header}>
                              {header}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-stone-500">
                    Combined full name is preferred when available. Split first and last name is also accepted.
                  </p>
                </>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleReview}
                disabled={isReviewing || !allMapped}
                className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isReviewing ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                {isReviewing ? "Reviewing..." : "Run Review"}
              </button>
              <button
                type="button"
                onClick={handleProcess}
                disabled={isProcessing || !allMapped || !review}
                className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isProcessing ? <Loader2 className="size-4 animate-spin" /> : <ChevronRight className="size-4" />}
                {isProcessing ? "Processing..." : "Process Master List"}
              </button>
            </div>
          </section>
        </div>

        {review ? (
          <section className="rounded-[2rem] border border-stone-300/70 bg-white/90 p-8 shadow-[0_25px_70px_rgba(120,93,35,0.1)]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">Step 3</p>
              <h2 className="mt-2 text-2xl font-black text-stone-950">Review before commit</h2>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <ReviewMetric label="Source Rows" value={review.sourceRowCount ?? 0} />
              <ReviewMetric label="Accepted Rows" value={review.acceptedRowCount ?? 0} />
              <ReviewMetric label="Rejected Rows" value={review.rejectedRowCount ?? 0} />
              <ReviewMetric label="Blank Rows" value={review.blankRowCount ?? 0} />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50/70 p-5">
                <p className="text-sm font-semibold text-stone-900">Duplicate emails</p>
                {review.duplicateEmails?.length ? (
                  <div className="mt-3 space-y-2">
                    {review.duplicateEmails.map((item) => (
                      <div key={item.email} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm text-stone-700">
                        <span>{item.email}</span>
                        <span>{item.count} rows</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-stone-500">No duplicate emails detected.</p>
                )}
              </div>

              <div className="rounded-[1.5rem] border border-stone-200 bg-stone-50/70 p-5">
                <p className="text-sm font-semibold text-stone-900">Sample rejection reasons</p>
                {review.rejectedRows?.length ? (
                  <div className="mt-3 space-y-2">
                    {review.rejectedRows.map((row) => (
                      <div key={`${row.rowNumber}-${row.reason}`} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm text-stone-700">
                        <span>Row {row.rowNumber}</span>
                        <span>{row.reason}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-stone-500">No sampled rejects. This file looks clean.</p>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {message ? (
          <div className="rounded-[1.75rem] border border-blue-200 bg-blue-50 px-5 py-4">
            <p className="text-sm font-semibold text-blue-900">{message}</p>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-[1.75rem] border border-red-200 bg-red-50 px-5 py-4">
            <p className="text-sm font-semibold text-red-900">{error}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StepCard({
  index,
  title,
  description,
  active = false,
}: {
  index: string;
  title: string;
  description: string;
  active?: boolean;
}) {
  return (
    <div className={`rounded-[1.5rem] border p-5 shadow-sm ${active ? "border-stone-900 bg-stone-950 text-white" : "border-stone-300/70 bg-white/85 text-stone-900"}`}>
      <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${active ? "text-stone-300" : "text-stone-500"}`}>{index}</p>
      <h3 className="mt-2 text-xl font-black">{title}</h3>
      <p className={`mt-2 text-sm leading-6 ${active ? "text-stone-300" : "text-stone-600"}`}>{description}</p>
    </div>
  );
}

function ReviewMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1.4rem] border border-stone-200 bg-white px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">{label}</p>
      <p className="mt-2 text-3xl font-black text-stone-950">{value}</p>
    </div>
  );
}
