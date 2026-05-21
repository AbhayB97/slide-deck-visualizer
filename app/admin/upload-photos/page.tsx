"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { formatNameForBlob, getAvatarPath } from "@/lib/avatarNames";

type UploadPhotoResponse = {
  success: boolean;
  fileUrl?: string;
  filePath?: string;
  uploadedAt?: string;
  contentType?: string;
  slug?: string;
  error?: string;
};

function extensionForFile(file: File | null): "jpg" | "png" | null {
  if (!file) return null;
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  return null;
}

export default function AdminUploadPhotosPage() {
  const [displayName, setDisplayName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadPhotoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const slug = useMemo(() => formatNameForBlob(displayName), [displayName]);
  const extension = extensionForFile(file);
  const previewPath = slug && extension ? getAvatarPath(displayName, extension) : "";

  const handleUpload = async (e: FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError("Enter the person's display name exactly as it appears in the grid.");
      return;
    }
    if (!file) {
      setError("Choose a JPG or PNG photo first.");
      return;
    }
    if (!extension) {
      setError("Photo must be a JPG or PNG image.");
      return;
    }

    setError(null);
    setUploadResult(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("displayName", displayName);
      formData.append("file", file);

      const res = await fetch("/api/upload-photo", {
        method: "POST",
        body: formData,
      });
      const data: UploadPhotoResponse = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Upload failed");
      }
      setUploadResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 px-4 py-10">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <main className="rounded-2xl border border-gray-200 bg-white p-8 shadow-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Admin</p>
              <h1 className="text-3xl font-bold text-gray-900">Upload Grid Photos</h1>
              <p className="mt-1 text-sm text-gray-600">
                Add or replace employee photos used by the Mega-Grid draw.
              </p>
            </div>
            <Link href="/admin/upload" className="text-sm font-semibold text-blue-700 underline">
              Back to CSV upload
            </Link>
          </div>

          <form onSubmit={handleUpload} className="mt-8 space-y-5">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Employee display name</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Example: Jane Doe"
                className="mt-2 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-gray-700">Photo file</span>
              <input
                type="file"
                accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-2 block w-full text-sm text-gray-700"
              />
            </label>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-900">Destination preview</p>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
                <dt className="font-medium text-gray-600">Name slug</dt>
                <dd className="break-all font-mono text-gray-900">{slug || "Waiting for name"}</dd>
                <dt className="font-medium text-gray-600">Blob path</dt>
                <dd className="break-all font-mono text-gray-900">
                  {previewPath || "Choose a JPG or PNG to preview the final path"}
                </dd>
              </dl>
            </div>

            <button
              type="submit"
              disabled={isUploading}
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {isUploading ? "Uploading..." : "Upload Photo"}
            </button>
          </form>

          {uploadResult && (
            <div className="mt-6 rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-sm font-semibold text-green-800">Photo uploaded</p>
              <p className="mt-1 break-all text-sm text-green-900">Path: {uploadResult.filePath}</p>
              <p className="break-all text-sm text-green-900">URL: {uploadResult.fileUrl}</p>
              {uploadResult.uploadedAt && (
                <p className="mt-1 text-xs text-green-900">
                  Uploaded at: {new Date(uploadResult.uploadedAt).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-800">{error}</p>
            </div>
          )}
        </main>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900">Team Workflow</h2>
            <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-gray-700">
              <li>Find the employee name exactly as it appears in the grid or uploaded CSV.</li>
              <li>Enter that name in the display name field. The page will show the generated slug.</li>
              <li>Choose a square or centered headshot as a JPG or PNG, ideally at least 512 x 512 pixels and under 5 MB.</li>
              <li>Confirm the destination path starts with <code className="font-mono">avatars/</code>.</li>
              <li>Upload. The new photo replaces any existing file at the same path.</li>
              <li>Open the grid and use Refresh List, or refresh the browser, to check the image.</li>
            </ol>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900">Naming Rules</h2>
            <div className="mt-4 space-y-3 text-sm text-gray-700">
              <p>
                The grid converts names to lowercase and replaces spaces, punctuation, and special
                characters with hyphens.
              </p>
              <div className="rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-900">
                Jane Doe -&gt; avatars/jane-doe.jpg
              </div>
              <div className="rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-900">
                A. B. Smith -&gt; avatars/a-b-smith.png
              </div>
              <p>
                The grid tries the JPG path first, then PNG. If both are missing, it shows an
                initial-based fallback avatar.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <h2 className="text-lg font-bold text-amber-950">Before Uploading</h2>
            <p className="mt-3 text-sm text-amber-900">
              Use photos your team is allowed to publish internally. Avoid screenshots with private
              information, group photos, or images where the person is hard to identify.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
