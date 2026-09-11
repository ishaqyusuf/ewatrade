"use client"

import type { StoreConversationAttachmentProjection } from "@ewatrade/service-commerce"
import { useEffect, useRef, useState } from "react"

const STATUS_COPY: Record<
  StoreConversationAttachmentProjection["state"],
  string
> = {
  deleted: "No longer available",
  pending: "Safety review in progress",
  quarantined: "Store review required",
  rejected: "Could not be accepted",
  retryable: "Needs another upload",
  safe: "Delivered privately",
}

export function StoreConversationAttachment({
  attachment,
  conversationId,
  customer,
  onRecover,
  publicToken,
}: {
  attachment: StoreConversationAttachmentProjection
  conversationId: string
  customer: boolean
  onRecover?: () => void
  publicToken: string
}) {
  const [voiceGrant, setVoiceGrant] = useState<{
    expiresAt: Date
    url: string
  } | null>(null)
  const [voiceLoading, setVoiceLoading] = useState(false)
  const [voiceError, setVoiceError] = useState(false)
  const [voicePlaying, setVoicePlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    if (!voiceGrant) return
    const timeout = window.setTimeout(
      () => setVoiceGrant(null),
      Math.max(0, voiceGrant.expiresAt.getTime() - Date.now()) + 50,
    )
    return () => window.clearTimeout(timeout)
  }, [voiceGrant])

  async function toggleVoiceNote() {
    if (voiceGrant && audioRef.current) {
      if (audioRef.current.paused) await audioRef.current.play()
      else audioRef.current.pause()
      return
    }
    if (voiceLoading) return
    setVoiceLoading(true)
    setVoiceError(false)
    try {
      const response = await fetch(
        "/api/store-conversations/voice-notes/grant",
        {
          body: JSON.stringify({
            conversationId,
            messageAttachmentId: attachment.id,
            publicToken,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      )
      const result = (await response.json()) as {
        expiresAt?: string
        url?: string
      }
      if (!response.ok || !result.expiresAt || !result.url) throw new Error()
      setVoiceGrant({ expiresAt: new Date(result.expiresAt), url: result.url })
      requestAnimationFrame(() => void audioRef.current?.play())
    } catch {
      setVoiceError(true)
    } finally {
      setVoiceLoading(false)
    }
  }

  return (
    <div
      aria-label={`${attachment.label}. ${STATUS_COPY[attachment.state]}`}
      className={`inline-flex items-center gap-1 rounded-full border p-1 ${
        customer
          ? "border-primary-foreground/25 bg-primary-foreground/10"
          : "border-border bg-muted/40"
      }`}
    >
      <span
        aria-hidden="true"
        className={`grid size-12 place-items-center rounded-full ${
          customer
            ? "bg-primary-foreground/15 text-primary-foreground"
            : "bg-background text-foreground"
        }`}
      >
        {attachment.kind === "audio" ? (
          <button
            aria-label={
              voicePlaying
                ? "Pause private voice note"
                : "Play private voice note"
            }
            className="grid size-12 place-items-center rounded-full"
            disabled={!attachment.viewable || voiceLoading}
            onClick={() => void toggleVoiceNote()}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="size-5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              {voicePlaying ? (
                <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
              ) : (
                <path d="m8 5 11 7-11 7z" />
              )}
            </svg>
          </button>
        ) : attachment.kind === "image" ? (
          <svg
            aria-hidden="true"
            className="size-5"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              d="M4 5h16v14H4zM7 15l3-3 2 2 2-2 3 3M8 9h.01"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        ) : (
          <svg
            aria-hidden="true"
            className="size-5"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              d="M6 3h8l4 4v14H6zM14 3v5h4M9 13h6M9 17h6"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        )}
      </span>
      {attachment.kind === "audio" && voiceGrant ? (
        // biome-ignore lint/a11y/useMediaCaption: Voice-note transcription is explicitly out of scope.
        <audio
          onEnded={() => setVoicePlaying(false)}
          onError={() => {
            setVoiceError(true)
            setVoiceGrant(null)
          }}
          onPause={() => setVoicePlaying(false)}
          onPlay={() => setVoicePlaying(true)}
          ref={audioRef}
          src={voiceGrant.url}
        />
      ) : null}
      {attachment.recovery && onRecover ? (
        <button
          aria-label={
            attachment.recovery === "contact_store"
              ? "Message the Store about this attachment"
              : "Upload a replacement attachment"
          }
          className="grid size-11 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onRecover}
          type="button"
        >
          <svg
            aria-hidden="true"
            className="size-4"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              d={
                attachment.recovery === "contact_store"
                  ? "M5 5h14v10H9l-4 4z"
                  : "M4 12a8 8 0 1 0 2-5.3M4 4v5h5"
              }
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        </button>
      ) : null}
      {voiceError ? (
        <span className="sr-only" role="alert">
          Voice note unavailable. Reauthorize and try again.
        </span>
      ) : null}
    </div>
  )
}
