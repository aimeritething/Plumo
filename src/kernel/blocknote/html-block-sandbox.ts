import DOMPurify from 'dompurify'

const REMOTE_LOADING_ATTRIBUTES = [
  'action',
  'formaction',
  'ping',
  'poster',
  'src',
  'srcset',
  'xlink:href',
]
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const BASE_CSP_DIRECTIVES = [
  "default-src 'none'",
  "connect-src 'none'",
  "worker-src 'none'",
  "frame-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "img-src data: blob:",
  "media-src data: blob:",
  "font-src data:",
  "style-src 'unsafe-inline'",
]
const ALLOWED_URI_PATTERN = /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/iu

const SANITIZE_CONFIG = {
  ALLOWED_URI_REGEXP: ALLOWED_URI_PATTERN,
  USE_PROFILES: { html: true, svg: true, svgFilters: true },
  FORBID_TAGS: ['base', 'embed', 'iframe', 'link', 'meta', 'object', 'script'],
  WHOLE_DOCUMENT: true,
}

interface HtmlBlockPreview {
  sanitizedHtml: string
  srcDoc: string
}

interface CssSanitization {
  css: string
}

interface SanitizedHtmlBlockMarkup {
  bodyHtml: string
  scriptHtml: string
  styleHtml: string
}

function stripCssRemoteLoads({ css }: CssSanitization): string {
  return css
    .replace(/@import[^;]+;?/giu, '')
    .replace(/url\s*\([^)]*\)/giu, '')
}

function removeRemoteLoadingAttributes(element: Element): void {
  for (const attribute of REMOTE_LOADING_ATTRIBUTES) {
    element.removeAttribute(attribute)
  }
}

// An SVG element other than a link may only point at another element in the block.
function removeRemoteSvgReference(element: Element): void {
  if (element.namespaceURI !== SVG_NAMESPACE || element.localName === 'a') return

  const href = element.getAttribute('href')
  if (href !== null && !href.startsWith('#')) element.removeAttribute('href')
}

function sanitizeInlineStyle(element: Element): void {
  const style = element.getAttribute('style')
  if (style === null) return

  const sanitized = stripCssRemoteLoads({ css: style }).trim()
  if (sanitized.length > 0) {
    element.setAttribute('style', sanitized)
  } else {
    element.removeAttribute('style')
  }
}

function sanitizeStyleElement(element: Element): void {
  element.textContent = stripCssRemoteLoads({ css: element.textContent ?? '' })
}

function extractStyleAsHtml(documentObject: Document): string {
  const styleElements = Array.from(documentObject.querySelectorAll('style'))
  let styleHtml = ''
  for (const styleElement of styleElements) {
    styleHtml += styleElement.outerHTML
    styleElement.remove()
  }
  return styleHtml
}

function sanitizeAnchor(anchor: HTMLAnchorElement): void {
  if (!anchor.hasAttribute('href')) return

  anchor.setAttribute('target', '_blank')
  anchor.setAttribute('rel', 'noreferrer noopener')
}

function sanitizeParsedMarkup(documentObject: Document): SanitizedHtmlBlockMarkup {
  documentObject.querySelectorAll('*').forEach((element) => {
    removeRemoteLoadingAttributes(element)
    removeRemoteSvgReference(element)
    sanitizeInlineStyle(element)
    if (element instanceof HTMLStyleElement) sanitizeStyleElement(element)
    if (element instanceof HTMLAnchorElement) sanitizeAnchor(element)
  })
  const styleHtml = extractStyleAsHtml(documentObject)
  return {
    bodyHtml: documentObject.body.innerHTML,
    scriptHtml: '',
    styleHtml,
  }
}

function blockCsp(): string {
  const scriptPolicy = "script-src 'none'"
  return [BASE_CSP_DIRECTIVES.at(0) ?? "default-src 'none'", scriptPolicy, ...BASE_CSP_DIRECTIVES.slice(1)].join('; ')
}

function sanitizeMarkupParts(markup: string): SanitizedHtmlBlockMarkup {
  const sanitized = DOMPurify.sanitize(markup, SANITIZE_CONFIG)
  const parsed = new DOMParser().parseFromString(sanitized, 'text/html')
  return sanitizeParsedMarkup(parsed)
}

export function sanitizeHtmlBlockMarkup(markup: string): string {
  const sanitized = sanitizeMarkupParts(markup)
  return `${sanitized.styleHtml}${sanitized.bodyHtml}${sanitized.scriptHtml}`
}

function htmlBlockIframeSrcDocFromSanitizedHtml({
  bodyHtml,
  scriptHtml,
  styleHtml,
}: SanitizedHtmlBlockMarkup): string {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${blockCsp()}">`,
    '<style>',
    ':root { color-scheme: light dark; }',
    'html, body { margin: 0; min-height: 100%; }',
    'body { box-sizing: border-box; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: CanvasText; background: Canvas; }',
    'a { color: LinkText; }',
    '* { box-sizing: border-box; max-width: 100%; }',
    '</style>',
    styleHtml,
    '</head>',
    '<body>',
    bodyHtml,
    scriptHtml,
    '</body>',
    '</html>',
  ].join('')
}

export function htmlBlockPreview(markup: string): HtmlBlockPreview {
  const sanitized = sanitizeMarkupParts(markup)
  const sanitizedHtml = `${sanitized.styleHtml}${sanitized.bodyHtml}${sanitized.scriptHtml}`
  const srcDoc = htmlBlockIframeSrcDocFromSanitizedHtml(sanitized)
  return {
    sanitizedHtml,
    srcDoc,
  }
}

export function htmlBlockIframeSrcDoc(markup: string): string {
  return htmlBlockPreview(markup).srcDoc
}
