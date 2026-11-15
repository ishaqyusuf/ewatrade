/** A report as plain sections, for the share text and the print page. */
export type ReportSharePack = {
  /** "Sales report" */
  title: string
  /** "Main store · Last 30 days · 17 Oct – 15 Nov" */
  subtitle: string
  sections: Array<{
    title: string
    rows: Array<[label: string, value: string]>
  }>
  /** Spreadsheet download; null when there is nothing to export. */
  csv: { fileName: string; text: string } | null
}

/** Message-friendly text: title, period, then "Label: value" lines. */
export function reportShareText(pack: ReportSharePack) {
  return [
    pack.title,
    pack.subtitle,
    ...pack.sections.flatMap((section) =>
      section.rows.length
        ? [
            "",
            section.title,
            ...section.rows.map(([label, value]) => `${label}: ${value}`),
          ]
        : [],
    ),
  ].join("\n")
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

/** A one-page A4 document for the browser's Print / Save as PDF. */
export function reportPrintDocument(pack: ReportSharePack) {
  const sections = pack.sections
    .filter((section) => section.rows.length)
    .map(
      (section) =>
        `<section><h2>${escapeHtml(section.title)}</h2><dl>${section.rows
          .map(
            ([label, value]) =>
              `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`,
          )
          .join("")}</dl></section>`,
    )
    .join("")
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(
    `${pack.title} · ${pack.subtitle}`,
  )}</title><style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:14px system-ui,-apple-system,"Segoe UI",sans-serif;color:#151b28;background:#fff;margin:0}h1{font-size:22px;margin:0 0 4px}header p{margin:0 0 20px;color:#545c69}h2{font-size:16px;margin:20px 0 6px}dl{margin:0}dl div{display:flex;justify-content:space-between;gap:24px;border-bottom:1px solid #dfe3e8;padding:7px 0;break-inside:avoid}dt{min-width:0;overflow-wrap:anywhere}dd{margin:0;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}h2{break-after:avoid}footer{margin-top:24px;color:#545c69;font-size:12px}</style></head><body><header><h1>${escapeHtml(
    pack.title,
  )}</h1><p>${escapeHtml(pack.subtitle)}</p></header>${sections}<footer>EwaTrade</footer></body></html>`
}
