"use client";

import { FormEvent, useMemo, useState } from "react";
import { formatNameForBlob, getAvatarPath } from "@/lib/avatarNames";
import { TopNav } from "@/components/ui/TopNav";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBanner } from "@/components/ui/StatusBanner";

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
    <div className="min-h-screen bg-background">
      <TopNav />
      <div className="px-4 py-10">
        <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="p-8">
            <PageHeader
              eyebrow="Admin"
              title="Upload Grid Photos"
              description="Add or replace employee photos used by the Mega-Grid draw."
            />

            <form onSubmit={handleUpload} className="mt-8 space-y-5">
              <label className="block">
                <span className="text-sm font-medium text-foreground/70">Employee display name</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Example: Jane Doe"
                  className="mt-2 block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-foreground/70">Photo file</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="mt-2 block w-full text-sm text-foreground/70"
                />
              </label>

              <div className="rounded-lg border border-border bg-surface-muted p-4">
                <p className="text-sm font-semibold text-foreground">Destination preview</p>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[8rem_1fr]">
                  <dt className="font-medium text-foreground/60">Name slug</dt>
                  <dd className="break-all font-mono text-foreground">{slug || "Waiting for name"}</dd>
                  <dt className="font-medium text-foreground/60">Storage path</dt>
                  <dd className="break-all font-mono text-foreground">
                    {previewPath || "Choose a JPG or PNG to preview the final path"}
                  </dd>
                </dl>
              </div>

              <Button type="submit" disabled={isUploading}>
                {isUploading ? "Uploading..." : "Upload Photo"}
              </Button>
            </form>

            {uploadResult && (
              <div className="mt-6">
                <StatusBanner tone="success" title="Photo uploaded">
                  <p className="break-all">Path: {uploadResult.filePath}</p>
                  <p className="break-all">URL: {uploadResult.fileUrl}</p>
                  {uploadResult.uploadedAt && (
                    <p className="mt-1 text-xs">
                      Uploaded at: {new Date(uploadResult.uploadedAt).toLocaleString()}
                    </p>
                  )}
                </StatusBanner>
              </div>
            )}

            {error && (
              <div className="mt-6">
                <StatusBanner tone="danger">{error}</StatusBanner>
              </div>
            )}
          </Card>

          <aside className="space-y-4">
            <Card className="p-6">
              <h2 className="text-lg font-bold text-foreground">Team Workflow</h2>
              <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-foreground/70">
                <li>Find the employee name exactly as it appears in the grid or uploaded CSV.</li>
                <li>Enter that name in the display name field. The page will show the generated slug.</li>
                <li>Choose a square or centered headshot as a JPG or PNG, ideally at least 512 x 512 pixels and under 5 MB.</li>
                <li>Confirm the destination path starts with <code className="font-mono">avatars/</code>.</li>
                <li>Upload. The new photo replaces any existing file at the same path.</li>
                <li>Open the grid and use Refresh List, or refresh the browser, to check the image.</li>
              </ol>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-bold text-foreground">Naming Rules</h2>
              <div className="mt-4 space-y-3 text-sm text-foreground/70">
                <p>
                  The grid converts names to lowercase and replaces spaces, punctuation, and special
                  characters with hyphens.
                </p>
                <div className="rounded-lg bg-surface-muted p-3 font-mono text-xs text-foreground">
                  Jane Doe -&gt; avatars/jane-doe.jpg
                </div>
                <div className="rounded-lg bg-surface-muted p-3 font-mono text-xs text-foreground">
                  A. B. Smith -&gt; avatars/a-b-smith.png
                </div>
                <p>
                  The grid tries the JPG path first, then PNG. If both are missing, it shows an
                  initial-based fallback avatar.
                </p>
              </div>
            </Card>

            <Card className="border-warning/20 bg-warning-soft p-6">
              <h2 className="text-lg font-bold text-foreground">Before Uploading</h2>
              <p className="mt-3 text-sm text-foreground/80">
                Use photos your team is allowed to publish internally. Avoid screenshots with private
                information, group photos, or images where the person is hard to identify.
              </p>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}
