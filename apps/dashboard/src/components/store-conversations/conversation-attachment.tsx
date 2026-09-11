"use client"

import { useTRPC } from "@/trpc/client"
import type { StoreConversationAttachmentProjection } from "@ewatrade/service-commerce"
import { useMutation } from "@tanstack/react-query"
import { useEffect, useState } from "react"

const STATUS_COPY: Record<
  StoreConversationAttachmentProjection["state"],
  string
> = {
  deleted: "This attachment is no longer available.",
  pending: "Safety review is still in progress.",
  quarantined: "This attachment is held for Store review.",
  rejected: "This attachment did not pass safety checks.",
  retryable: "Ask the customer to upload this attachment again.",
  safe: "Authorized Store staff can request a private view.",
}

export function ConversationAttachment({
  attachment,
  conversationId,
  storeId,
  onPrepareRecovery,
}: {
  attachment: StoreConversationAttachmentProjection
  conversationId: string
  storeId: string
  onPrepareRecovery?: () => void
}) {
  const trpc = useTRPC()
  const [grant, setGrant] = useState<{ expiresAt: Date; url: string } | null>(
    null,
  )
  const [loadFailed, setLoadFailed] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const authorize = useMutation(
    trpc.serviceCommerce.requestStoreConversationAttachmentViewerGrant.mutationOptions(
      {
        onError: () => setGrant(null),
        onSuccess: (result) => {
          setGrant(result)
          setLoadFailed(false)
          setNow(Date.now())
        },
      },
    ),
  )

  useEffect(() => {
    if (!grant) return
    const remaining = grant.expiresAt.getTime() - Date.now()
    if (remaining <= 0) {
      setNow(Date.now())
      return
    }
    const timeout = window.setTimeout(() => setNow(Date.now()), remaining + 50)
    return () => window.clearTimeout(timeout)
  }, [grant])

  const grantUsable = Boolean(
    grant && !loadFailed && grant.expiresAt.getTime() > now,
  )
  return (
    <div
      aria-label={`${attachment.label}. ${STATUS_COPY[attachment.state]}`}
      className="mt-2 inline-grid gap-2 text-foreground"
    >
      <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/70 p-1">
        <span
          aria-hidden="true"
          className="grid size-12 place-items-center rounded-full bg-muted"
        >
          {attachment.kind === "audio" ? (
            <svg
              aria-hidden="true"
              className="size-5"
              fill="none"
              viewBox="0 0 24 24"
            >
              <rect
                height="12"
                rx="4"
                stroke="currentColor"
                strokeWidth="1.8"
                width="8"
                x="8"
                y="3"
              />
              <path
                d="M5 11a7 7 0 0 0 14 0M12 18v3"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </svg>
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

        {attachment.viewable && !grantUsable ? (
          <button
            aria-label={
              grant
                ? "Reauthorize private attachment view"
                : "Authorize private attachment view"
            }
            className="grid size-11 place-items-center rounded-full border border-border disabled:opacity-50"
            disabled={authorize.isPending}
            onClick={() =>
              authorize.mutate({
                conversationId,
                messageAttachmentId: attachment.id,
                reason: "customer_request_attachment_review",
                storeId,
              })
            }
            type="button"
          >
            <svg
              aria-hidden="true"
              className="size-4"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </svg>
          </button>
        ) : null}

        {attachment.recovery && onPrepareRecovery ? (
          <button
            aria-label="Prepare an attachment recovery reply"
            className="grid size-11 place-items-center rounded-full border border-border"
            onClick={onPrepareRecovery}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="size-4"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                d="M4 12a8 8 0 1 0 2-5.3M4 4v5h5"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </svg>
          </button>
        ) : null}
      </div>

      {grantUsable && grant && attachment.kind === "audio" ? (
        // biome-ignore lint/a11y/useMediaCaption: Voice-note transcription is explicitly out of scope.
        <audio
          aria-label="Authorized private voice note"
          className="h-11 max-w-full"
          controls
          onError={() => setLoadFailed(true)}
          src={grant.url}
        />
      ) : grantUsable && grant ? (
        <object
          aria-label={`Authorized private ${attachment.label.toLowerCase()}`}
          className="h-80 w-full rounded-lg border bg-muted/30"
          data={grant.url}
          onError={() => setLoadFailed(true)}
        >
          <a href={grant.url} rel="noreferrer" target="_blank">
            Open authorized attachment
          </a>
        </object>
      ) : null}

      {authorize.isError || loadFailed ? (
        <span className="sr-only" role="alert">
          Private attachment view unavailable. Reauthorize and try again.
        </span>
      ) : null}
    </div>
  )
}
