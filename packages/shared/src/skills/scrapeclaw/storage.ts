// ─────────────────────────────────────────────────────────────────────────────
// ScrapeClaw storage utilities — canonical Supabase Storage path builders.
//
// These helpers produce deterministic storage paths for ScrapeClaw demo
// package attachments. All ScrapeClaw file uploads should use these paths
// to ensure consistency across the API, worker, and web app.
// ─────────────────────────────────────────────────────────────────────────────

export interface ScrapeClawAttachmentPathInput {
  userId: string
  packageId: string
  filename: string
}

export function buildScrapeClawPackagePrefix(userId: string, packageId: string): string {
  return `users/${userId}/scrapeclaw/packages/${packageId}`
}

export function buildScrapeClawAttachmentPath({
  userId,
  packageId,
  filename,
}: ScrapeClawAttachmentPathInput): string {
  const normalizedFilename = filename.replace(/^\/+/, '')
  return `${buildScrapeClawPackagePrefix(userId, packageId)}/${normalizedFilename}`
}
