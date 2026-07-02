export function formatNameForBlob(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getAvatarPath(name: string, extension: "jpg" | "png") {
  const formattedName = formatNameForBlob(name);
  return formattedName ? `avatars/${formattedName}.${extension}` : "";
}

export const DEFAULT_BLOB_BASE_URL =
  "https://f6k4nyqhrlhpfz4k.public.blob.vercel-storage.com";

export function getAvatarUrls(name: string, blobBaseUrl: string) {
  const formattedName = formatNameForBlob(name);
  const safeBaseUrl = blobBaseUrl.replace(/\/+$/, "");
  return [
    `${safeBaseUrl}/avatars/${formattedName}.jpg`,
    `${safeBaseUrl}/avatars/${formattedName}.png`,
  ];
}

export function getFallbackAvatarUrl(name: string) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name
  )}&background=random&color=ffffff&size=256&bold=true`;
}
