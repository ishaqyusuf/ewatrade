"use client"

import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { type ComponentProps, useEffect, useRef } from "react"
import { useSetupAttachments } from "../setup-assistant/use-setup-attachments"
import { AssistantComposer } from "./assistant-composer"

const PHOTOS = "image/jpeg,image/png,image/webp,image/heic,image/heif"
const FILES = "application/pdf"

export type GeneralReadyAttachment = { attachmentId: string; fileName: string }

/**
 * The business chat box with + for receipt photos and PDFs. Files upload and
 * are read before they can be sent; ready ones go with the next message.
 */
export function GeneralAttachComposer({
  conversationId,
  photos,
  onReadyChange,
  ...composer
}: Omit<ComponentProps<typeof AssistantComposer>, "attach"> & {
  conversationId: string
  /** Photos can be read right now; otherwise only PDFs are offered. */
  photos: boolean
  onReadyChange: (ready: GeneralReadyAttachment[]) => void
}) {
  const attachments = useSetupAttachments({
    conversationId,
    onTranscript: () => undefined,
  })
  // Voice notes belong to the composer's mic; these are files only.
  const files = attachments.items.filter((item) => item.kind !== "AUDIO")
  const readyKey = files
    .filter((item) => item.phase === "ready" && item.attachmentId)
    .map((item) => `${item.attachmentId}\u0000${item.fileName}`)
    .join("\u0001")
  const report = useRef(onReadyChange)
  report.current = onReadyChange
  useEffect(() => {
    report.current(
      readyKey
        ? readyKey.split("\u0001").map((entry) => {
            const [attachmentId = "", fileName = ""] = entry.split("\u0000")
            return { attachmentId, fileName }
          })
        : [],
    )
  }, [readyKey])

  return (
    <AssistantComposer
      {...composer}
      attach={{
        accept: photos ? `${PHOTOS},${FILES}` : FILES,
        disabled: files.length >= 4,
        onFiles: (picked) => {
          for (const file of picked.slice(0, 4 - files.length))
            void attachments.add(file)
        },
        chips: files.length ? (
          <div className="flex flex-wrap gap-1.5 px-1.5 pt-0.5 pb-1">
            {files.map((item) => (
              <span
                key={item.localId}
                className="flex max-w-56 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs"
                title={item.error ?? item.summary ?? item.fileName}
              >
                <span className="truncate">{item.fileName}</span>
                <span
                  className={
                    item.phase === "failed"
                      ? "shrink-0 text-destructive"
                      : "shrink-0 text-muted-foreground"
                  }
                >
                  {item.phase === "ready"
                    ? "ready"
                    : item.phase === "failed"
                      ? "failed"
                      : item.phase === "reading"
                        ? "reading…"
                        : "uploading…"}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${item.fileName}`}
                  className="shrink-0"
                  onClick={() => attachments.remove(item.localId)}
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null,
      }}
    />
  )
}
