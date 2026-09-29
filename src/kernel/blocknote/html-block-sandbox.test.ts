import DOMPurify from 'dompurify'
import { describe, expect, it, vi } from 'vitest'
import {
  htmlBlockIframeSrcDoc,
  htmlBlockPreview,
  sanitizeHtmlBlockMarkup,
} from './html-block-sandbox'

describe('HTML block sandbox', () => {
  it('removes script execution surfaces and keeps static interactive markup', () => {
    const sanitized = sanitizeHtmlBlockMarkup([
      '<script>window.parent.document.body.remove()</script>',
      '<button onclick="window.parent.evil = true">Click</button>',
      '<a href="javascript:alert(1)">bad</a>',
      '<a href="https://example.com/docs">docs</a>',
      '<details open><summary>More</summary><p>Safe</p></details>',
    ].join(''))

    expect(sanitized).not.toContain('<script')
    expect(sanitized).not.toContain('onclick')
    expect(sanitized).not.toContain('javascript:')
    expect(sanitized).toContain('<button>Click</button>')
    expect(sanitized).toContain('<details open="">')
    expect(sanitized).toContain('href="https://example.com/docs"')
    expect(sanitized).toContain('target="_blank"')
    expect(sanitized).toContain('rel="noreferrer noopener"')
  })

  it('keeps attribute values where letters run into digits', () => {
    const sanitized = sanitizeHtmlBlockMarkup('<a href="page1.html">next</a>')

    expect(sanitized).toContain('href="page1.html"')
  })

  it('removes nested browsing contexts and remote-loading attributes', () => {
    const sanitized = sanitizeHtmlBlockMarkup([
      '<iframe src="https://example.com"></iframe>',
      '<img src="https://example.com/tracker.png" srcset="https://example.com/2x.png 2x">',
      '<div style="background-image: url(https://example.com/pixel.png); color: red">Styled</div>',
      '<style>@import url("https://example.com/a.css"); .ok { color: red }</style>',
    ].join(''))

    expect(sanitized).not.toContain('<iframe')
    expect(sanitized).not.toContain('src=')
    expect(sanitized).not.toContain('srcset=')
    expect(sanitized).not.toContain('url(')
    expect(sanitized).not.toContain('@import')
    expect(sanitized).toContain('<style>')
    expect(sanitized).toContain('.ok { color: red }')
    expect(sanitized).toContain('Styled')
  })

  it('keeps inline SVG and removes its script surfaces and remote loads', () => {
    const sanitized = sanitizeHtmlBlockMarkup([
      '<svg viewBox="0 0 10 10" role="img" onload="window.parent.evil = true">',
      '<path d="M463.7 50 l5 5 l-5 5 z"/>',
      '<rect class="a1" x="0" y="0" width="4" height="4" rx="1"><title>July</title></rect>',
      '<text x="5" y="5" text-anchor="middle">7 月</text>',
      '<image href="https://example.com/tracker.png"/>',
      '<script>window.parent.evil = true</script>',
      '</svg>',
    ].join(''))

    expect(sanitized).toContain('<svg viewBox="0 0 10 10" role="img">')
    expect(sanitized).toContain('<rect class="a1" x="0" y="0" width="4" height="4" rx="1"><title>July</title></rect>')
    expect(sanitized).toContain('<text x="5" y="5" text-anchor="middle">7 月</text>')
    expect(sanitized).toContain('<path d="M463.7 50 l5 5 l-5 5 z"></path>')
    expect(sanitized).not.toContain('onload')
    expect(sanitized).not.toContain('<script')
    expect(sanitized).not.toContain('example.com')
  })

  it('generates a srcdoc with a restrictive CSP and no script permission dependency', () => {
    const srcDoc = htmlBlockIframeSrcDoc('<h1>Hello</h1><script>window.evil = true</script>')

    expect(srcDoc).toContain("script-src 'none'")
    expect(srcDoc).toContain("default-src 'none'")
    expect(srcDoc).toContain('<h1>Hello</h1>')
    expect(srcDoc).not.toContain('<script>window.evil = true</script>')
  })

  it('places sanitized style blocks in the iframe head so user CSS applies', () => {
    const preview = htmlBlockPreview(
      '<style>.card { color: red }</style><main class="card"><h1>Styled</h1></main>',
    )
    const userStyleIndex = preview.srcDoc.indexOf('.card')
    const headCloseIndex = preview.srcDoc.indexOf('</head>')
    const bodyIndex = preview.srcDoc.indexOf('<body>')
    const bodyHtml = preview.srcDoc.slice(bodyIndex)

    expect(userStyleIndex).toBeGreaterThan(-1)
    expect(userStyleIndex).toBeLessThan(headCloseIndex)
    expect(bodyIndex).toBeGreaterThan(headCloseIndex)
    expect(bodyHtml).not.toContain('<style>')
    expect(bodyHtml).toContain('<main class="card"><h1>Styled</h1></main>')
  })

  it('builds sanitized preview output with one DOMPurify pass', () => {
    const sanitizeSpy = vi.spyOn(DOMPurify, 'sanitize')

    try {
      const preview = htmlBlockPreview([
        '<script>window.parent.document.body.remove()</script>',
        '<button onclick="window.parent.evil = true">Click</button>',
      ].join(''))

      expect(sanitizeSpy).toHaveBeenCalledTimes(1)
      expect(preview.sanitizedHtml).toContain('<button>Click</button>')
      expect(preview.srcDoc).toContain('<button>Click</button>')
      expect(preview.srcDoc).not.toContain('<script')
      expect(preview.srcDoc).not.toContain('onclick')
    } finally {
      sanitizeSpy.mockRestore()
    }
  })
})
