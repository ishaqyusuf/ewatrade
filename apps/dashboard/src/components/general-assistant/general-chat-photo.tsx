"use client"
import { cn } from "@ewatrade/ui"
import { Attachment01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"

/** Owner-only bytes of a file sent in this chat; never public or cached. */
export function chatAttachmentUrl(attachmentId: string) {
  return `/api/assistant/attachments/${encodeURIComponent(attachmentId)}/content`
}

/**
 * A photo sent in the chat, shown as the picture itself. PDFs, expired
 * files and photos the browser can't show fall back to the file name.
 */
export function GeneralSentFile({
  file,
}: {
  file: {
    attachmentId: string
    kind: string
    fileName: string
    expired?: boolean
  }
}) {
  const [broken, setBroken] = useState(false)
  const url = chatAttachmentUrl(file.attachmentId)
  if (file.kind === "IMAGE" && !file.expired && !broken)
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block max-w-[85%] overflow-hidden rounded-2xl border border-border"
      >
        {/* Private preview bytes: no image optimizer or cache. */}
        <img
          src={url}
          alt={file.fileName}
          onError={() => setBroken(true)}
          className="block max-h-80 w-auto max-w-full sm:max-w-72"
        />
      </a>
    )
  return (
    <span className="flex max-w-[85%] items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
      <HugeiconsIcon icon={Attachment01Icon} className="size-3.5 shrink-0" />
      <span className="truncate">
        {file.fileName}
        {file.expired ? " · removed" : ""}
      </span>
    </span>
  )
}

/** A small square of a chat photo; hides itself when there is nothing to show. */
export function GeneralChatPhotoThumb({
  attachmentId,
  className,
}: {
  attachmentId: string
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  if (broken) return null
  return (
    <img
      src={chatAttachmentUrl(attachmentId)}
      alt=""
      onError={() => setBroken(true)}
      className={cn(
        "size-16 shrink-0 rounded-md border object-cover",
        className,
      )}
    />
  )
}
