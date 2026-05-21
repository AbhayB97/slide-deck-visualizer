import { put } from "@vercel/blob";
import { getAvatarPath } from "@/lib/avatarNames";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Map<string, "jpg" | "png">([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
]);

export type UploadedAvatar = {
  url: string;
  pathname: string;
  uploadedAt: string;
  contentType: string;
};

export async function uploadAvatar(file: File, displayName: string): Promise<UploadedAvatar> {
  const normalizedName = displayName.trim();
  if (!normalizedName) {
    throw new Error("Display name is required");
  }

  const extension = ALLOWED_IMAGE_TYPES.get(file.type);
  if (!extension) {
    throw new Error("Photo must be a JPG or PNG image");
  }

  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("Photo must be 5 MB or smaller");
  }

  const pathname = getAvatarPath(normalizedName, extension);
  if (!pathname) {
    throw new Error("Display name must include at least one letter or number");
  }

  const arrayBuffer = await file.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: file.type });
  const result = await put(pathname, blob, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: file.type,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });

  return {
    url: result.url,
    pathname: result.pathname,
    uploadedAt: new Date().toISOString(),
    contentType: file.type,
  };
}
