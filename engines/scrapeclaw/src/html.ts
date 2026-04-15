const TAG_STRIP_RE = /<[^>]+>/g
const WS_RE = /\s+/g
const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
}

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITY_MAP[m] ?? m)
}

export function collapseWhitespace(input: string): string {
  return decodeHtmlEntities(input).replace(WS_RE, ' ').trim()
}

export function stripHtml(input: string): string {
  return collapseWhitespace(
    input
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(TAG_STRIP_RE, ' '),
  )
}

export function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? collapseWhitespace(m[1] ?? '') || null : null
}

export function extractMetaDescription(html: string): string | null {
  const m =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i) ??
    html.match(/<meta[^>]+content=["']([\s\S]*?)["'][^>]+name=["']description["'][^>]*>/i)
  return m ? collapseWhitespace(m[1] ?? '') || null : null
}

export interface HtmlAnchor {
  href: string
  text: string
}

export function extractAnchors(html: string): HtmlAnchor[] {
  const out: HtmlAnchor[] = []
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = regex.exec(html)) !== null) {
    const href = m[1]?.trim()
    if (!href) continue
    out.push({ href, text: stripHtml(m[2] ?? '') })
  }
  return out
}
