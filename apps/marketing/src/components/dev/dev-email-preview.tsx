"use client"

type DevEmailPreviewProps = {
  html: string
  subject?: string
}

/**
 * Dev-only component. Opens the provided email HTML in a new browser tab.
 * Used to preview outgoing emails when no email transport is configured.
 */
export function DevEmailPreview({
  html,
  subject = "Email preview",
}: DevEmailPreviewProps) {
  if (process.env.NODE_ENV !== "development") return null

  function openInTab() {
    const blob = new Blob([html], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    window.open(url, "_blank", "noopener,noreferrer")
    // Revoke after a short delay to allow the tab to open
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-amber-300/60 bg-amber-50">
      <div className="flex items-center justify-between border-b border-amber-200/80 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-amber-500" />
          <span className="text-xs font-semibold text-amber-800">
            DEV — Email not sent
          </span>
        </div>
        <span className="truncate text-xs text-amber-700">{subject}</span>
      </div>
      <div className="px-4 py-3">
        <p className="mb-2 text-xs text-amber-700">
          No email transport is configured in this environment. Preview the
          email that would have been sent:
        </p>
        <button
          type="button"
          onClick={openInTab}
          className="rounded-xl border border-amber-400/50 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm transition-colors hover:bg-amber-50 active:scale-95"
        >
          Open email in new tab →
        </button>
        <p className="mt-2 text-[11px] text-amber-600/80">
          Also check the server console for email details.
        </p>
      </div>
    </div>
  )
}
