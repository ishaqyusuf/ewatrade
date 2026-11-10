"use client"

import { useState } from "react"
import { PlatformIcon } from "./icons"

/** Native share where available, otherwise copies the public page link. */
export function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false)
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Dismissed share sheets and blocked clipboards need no message.
    }
  }
  return (
    <button
      type="button"
      className="btn btn-line btn-sm btn-sq"
      onClick={share}
      aria-label={copied ? "Link copied" : "Share"}
      title={copied ? "Link copied" : "Share"}
    >
      <PlatformIcon name="share" />
      <span className="sr" aria-live="polite">
        {copied ? "Link copied" : ""}
      </span>
    </button>
  )
}
