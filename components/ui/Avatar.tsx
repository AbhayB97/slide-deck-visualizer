"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    setVariantIndex(0);
  }, [name]);

  const hasBlobBaseUrl = blobBaseUrl.trim().length > 0;
  const avatarUrls = hasBlobBaseUrl ? getAvatarUrls(name, blobBaseUrl) : [];
  const src = avatarUrls[variantIndex] ?? getFallbackAvatarUrl(name);

  function handleError() {
    setVariantIndex((current) =>
      current < avatarUrls.length ? current + 1 : current
    );
  }

  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      onError={handleError}
      className={`shrink-0 rounded-full object-cover ${className}`.trim()}
      style={{ width: size, height: size }}
    />
  );
}
