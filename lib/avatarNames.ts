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
