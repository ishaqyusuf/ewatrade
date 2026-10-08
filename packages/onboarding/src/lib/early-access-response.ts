import { OnboardingContinuationError } from "@ewatrade/db/onboarding-continuation"
import { NextResponse } from "next/server"
import { EarlyAccessError } from "./early-access-service"

export const earlyAccessHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export function earlyAccessHtml(input: {
  title: string
  message: string
  status?: number
  actionUrl?: string
  actionLabel?: string
  emailHtml?: string
}) {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title><style>body{margin:0;background:#faf8f3;color:#222;font-family:system-ui}main{max-width:42rem;margin:8vh auto;padding:2rem}p{line-height:1.6}a{display:inline-block;padding:1rem;background:#ab4a2f;color:white}iframe{width:100%;height:38rem;border:1px solid #ddd;margin-top:1rem}</style></head><body><main><h1>${escapeHtml(input.title)}</h1><p>${escapeHtml(input.message)}</p>${input.actionUrl ? `<a href="${escapeHtml(input.actionUrl)}">${escapeHtml(input.actionLabel ?? "Continue setup")}</a>` : ""}${input.emailHtml ? `<details><summary>Preview email</summary><iframe sandbox="" title="QA email preview" srcdoc="${escapeHtml(input.emailHtml)}"></iframe></details>` : ""}</main></body></html>`,
    {
      status: input.status ?? 200,
      headers: {
        ...earlyAccessHeaders,
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  )
}

export function earlyAccessFailure(error: unknown) {
  if (error instanceof OnboardingContinuationError)
    return {
      message: error.message,
      status:
        error.code === "CONFLICT"
          ? 409
          : ["EXPIRED", "USED"].includes(error.code)
            ? 410
            : 403,
    }
  return {
    message:
      error instanceof EarlyAccessError
        ? error.message
        : "Setup is temporarily unavailable. Please try again.",
    status: error instanceof EarlyAccessError ? error.status : 503,
  }
}
