/** Origin only, e.g. https://your-api.example.com (no trailing slash, no /api). */
export function normalizeApiOrigin(url: string): string {
  let normalized = url.trim();
  if (!normalized) return "";
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }
  return normalized.replace(/\/+$/, "");
}

export function getApiBasePath(origin: string): string {
  const base = normalizeApiOrigin(origin);
  return base ? `${base}/api` : "/api";
}

export function resolveDefaultApiOrigin(): string {
  const fromUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromUrl) return normalizeApiOrigin(fromUrl);

  const fromDomain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (fromDomain) return normalizeApiOrigin(fromDomain);

  return "https://workspaceapi-server-production-2b2a.up.railway.app";
}
