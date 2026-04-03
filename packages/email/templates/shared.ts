type EmailSection = {
  label: string
  value?: string | null
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function renderListItem(section: EmailSection) {
  if (!section.value) {
    return ""
  }

  return `<li style="margin: 0 0 8px;"><strong>${escapeHtml(section.label)}:</strong> ${escapeHtml(section.value)}</li>`
}

export function renderMarketingEmailTemplate(input: {
  ctaHref?: string
  ctaLabel?: string
  intro: string
  outro?: string
  sections?: EmailSection[]
  title: string
}) {
  const sections = (input.sections ?? [])
    .map((section) => renderListItem(section))
    .filter(Boolean)
    .join("")

  const html = `
    <div style="background:#f4f6fb;padding:32px 16px;font-family:Arial,sans-serif;color:#0f172a;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:32px;">
        <p style="margin:0 0 12px;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#0f766e;">ewatrade</p>
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;">${escapeHtml(input.title)}</h1>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#334155;">${escapeHtml(input.intro)}</p>
        ${sections ? `<ul style="margin:0 0 24px;padding-left:20px;color:#1e293b;">${sections}</ul>` : ""}
        ${
          input.ctaHref && input.ctaLabel
            ? `<p style="margin:0 0 24px;"><a href="${escapeHtml(input.ctaHref)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;">${escapeHtml(input.ctaLabel)}</a></p>`
            : ""
        }
        ${
          input.outro
            ? `<p style="margin:0;font-size:14px;line-height:1.7;color:#475569;">${escapeHtml(input.outro)}</p>`
            : ""
        }
      </div>
    </div>
  `.trim()

  const text = [
    input.title,
    "",
    input.intro,
    "",
    ...(input.sections ?? [])
      .filter((section) => Boolean(section.value))
      .map((section) => `${section.label}: ${section.value ?? ""}`),
    input.ctaHref && input.ctaLabel ? "" : null,
    input.ctaHref && input.ctaLabel ? `${input.ctaLabel}: ${input.ctaHref}` : null,
    input.outro ? "" : null,
    input.outro ?? null
  ]
    .filter(Boolean)
    .join("\n")

  return {
    html,
    text
  }
}
