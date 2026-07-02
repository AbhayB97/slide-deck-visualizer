"use client";

import { useState } from "react";
import {
  DEFAULT_BLOB_BASE_URL,
  getAvatarUrls,
  getFallbackAvatarUrl,
} from "@/lib/avatarNames";

type AvatarProps = {
  name: string;
  size?: number;
  className?: string;
  blobBaseUrl?: string;
};

export function Avatar({
  name,
  size = 40,
  className = "",
  blobBaseUrl = process.env.NEXT_PUBLIC_BLOB_BASE_URL ?? DEFAULT_BLOB_BASE_URL,
}: AvatarProps) {
  const [variantIndex, setVariantIndex] = useState(0);
  const hasBlobBaseUrl = blobBaseUrl.trim().length > 0;
  const avatarUrls = hasBlobBaseUrl ? getAvatarUrls(name, blobBaseUrl) : [];
  const src = avatarUrls[variantIndex] ?? getFallbackAvatarUrl(name);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-full border border-border/60 object-cover ${className}`}
      onError={() => setVariantIndex((i) => i + 1)}
    />
  );
}
