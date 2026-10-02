"use client"

import type { ReactNode } from "react"
import { cn } from "../lib/utils"
import { buttonVariants } from "./button"

export function MediaPreviewFrame({
  children,
  className,
}: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex min-h-72 min-w-0 items-center justify-center overflow-hidden border border-border bg-muted/30 p-3",
        className,
      )}
    >
      {children}
    </div>
  )
}

// The feature owner supplies a usable grant; this renderer never requests or caches one.
export function MediaPreview({
  url,
  mimeType,
  label,
  onError,
}: {
  url: string
  mimeType: string | null
  label: string
  onError: () => void
}) {
  const fallback = (
    <a
      href={url}
      rel="noreferrer"
      target="_blank"
      className={buttonVariants({ variant: "outline", appearance: "form" })}
    >
      Open authorized attachment
    </a>
  )
  if (mimeType?.startsWith("image/")) {
    // Keep short-lived private grants out of an image optimizer cache.
    return (
      <img
        src={url}
        alt={label}
        className="max-h-[60svh] max-w-full object-contain"
        onError={onError}
      />
    )
  }
  if (mimeType === "application/pdf") {
    return (
      <object
        aria-label={label}
        className="h-[min(32rem,60svh)] w-full"
        data={url}
        type="application/pdf"
        onError={onError}
      >
        {fallback}
      </object>
    )
  }
  if (mimeType?.startsWith("audio/")) {
    return (
      // biome-ignore lint/a11y/useMediaCaption: Customer voice-note transcription is not provided by this renderer.
      <audio
        aria-label={label}
        src={url}
        controls
        preload="none"
        className="w-full max-w-full"
        onError={onError}
      />
    )
  }
  if (mimeType?.startsWith("video/")) {
    return (
      // biome-ignore lint/a11y/useMediaCaption: Customer-uploaded videos have no caption track in the existing contract.
      <video
        aria-label={label}
        src={url}
        controls
        playsInline
        preload="none"
        className="max-h-[60svh] w-full"
        onError={onError}
      />
    )
  }
  return fallback
}
