"use client"

import { Button } from "@ewatrade/ui"
import { Attachment01Icon, Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useRef } from "react"
import { useSetupAttachments } from "../setup-assistant/use-setup-attachments"

const ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"

export type GeneralReadyAttachment = { attachmentId: string; fileName: string }

/**
 * Receipt photos and PDFs for the business chat. Files upload and are read
 * before they can be sent; ready ones are reported to the chat's send.
 */
export function GeneralAttachmentTray({
  conversationId,
  disabled,
  onReadyChange,
}: {
  conversationId: string
  disabled: boolean
  onReadyChange: (ready: GeneralReadyAttachment[]) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const attachments = useSetupAttachments({
    conversationId,
    onTranscript: () => undefined,
  })
  // Voice notes belong to the composer's mic; this tray shows files only.
  const files = attachments.items.filter((item) => item.kind !== "AUDIO")
  const readyKey = files
    .filter((item) => item.phase === "ready" && item.attachmentId)
    .map((item) => `${item.attachmentId}:${item.fileName}`)
    .join("|")
  const report = useRef(onReadyChange)
  report.current = onReadyChange
  useEffect(() => {
    report.current(
      readyKey
        ? readyKey.split("|").map((entry) => {
            const [attachmentId = "", ...name] = entry.split(":")
            return { attachmentId, fileName: name.join(":") }
          })
        : [],
    )
  }, [readyKey])

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <input
        ref={input}
        hidden
        multiple
        accept={ACCEPT}
        type="file"
        onChange={(event) => {
          for (const file of Array.from(event.target.files ?? []))
            void attachments.add(file)
          event.target.value = ""
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground"
        disabled={disabled || files.length >= 4}
        onClick={() => input.current?.click()}
      >
        <HugeiconsIcon icon={Attachment01Icon} className="size-3.5" />
        Attach receipt
      </Button>
      {files.map((item) => (
        <span
          key={item.localId}
          className="flex max-w-56 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs"
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
  )
}
