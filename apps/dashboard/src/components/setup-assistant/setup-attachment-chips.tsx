"use client"

import type {
  SetupAttachmentKind,
  SetupAttachmentPartData,
} from "@ewatrade/assistant/setup/attachments"
import { cn } from "@ewatrade/ui"
import {
  AlertCircleIcon,
  Cancel01Icon,
  File01Icon,
  Image01Icon,
  Loading03Icon,
  Pdf01Icon,
  VoiceIcon,
  Xls01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useState } from "react"
import type { SetupLocalAttachment } from "./use-setup-attachments"

const KIND_ICON: Record<SetupAttachmentKind, typeof File01Icon> = {
  IMAGE: Image01Icon,
  AUDIO: VoiceIcon,
  PDF: Pdf01Icon,
  SPREADSHEET: Xls01Icon,
  TEXT: File01Icon,
}

const PHASE_COPY: Record<SetupLocalAttachment["phase"], string> = {
  preparing: "Preparing…",
  uploading: "Uploading…",
  reading: "Reading…",
  ready: "Ready",
  failed: "Not sent",
}

export function AttachmentThumbnail({
  src,
  kind,
  className,
}: {
  src: string | null
  kind: SetupAttachmentKind | null
  className?: string
}) {
  const [broken, setBroken] = useState(false)
  if (src && !broken)
    return (
      // Private, owner-only preview bytes: no image optimizer or cache.
      <img
        src={src}
        alt=""
        onError={() => setBroken(true)}
        className={cn("size-9 shrink-0 rounded-md object-cover", className)}
      />
    )
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground",
        className,
      )}
    >
      <HugeiconsIcon
        icon={kind ? KIND_ICON[kind] : File01Icon}
        className="size-4"
      />
    </span>
  )
}

/** A file in the composer, with its upload/reading progress. */
export function SetupComposerAttachment({
  item,
  onRemove,
}: {
  item: SetupLocalAttachment
  onRemove: () => void
}) {
  const working = ["preparing", "uploading", "reading"].includes(item.phase)
  return (
    <li
      className={cn(
        "flex max-w-full items-center gap-2 rounded-lg border border-border bg-background py-1.5 pl-1.5 pr-1 sm:max-w-[280px]",
        item.phase === "failed" && "border-destructive/40",
      )}
    >
      <AttachmentThumbnail src={item.previewUrl} kind={item.kind} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground">
          {item.fileName}
        </p>
        <p
          className={cn(
            "flex items-center gap-1 text-[11px]",
            item.phase === "failed"
              ? "text-destructive"
              : "text-muted-foreground",
          )}
          role={item.phase === "failed" ? "alert" : undefined}
        >
          {working ? (
            <HugeiconsIcon
              icon={Loading03Icon}
              className="size-3 animate-spin"
            />
          ) : item.phase === "failed" ? (
            <HugeiconsIcon icon={AlertCircleIcon} className="size-3 shrink-0" />
          ) : null}
          <span className="line-clamp-2">
            {item.phase === "failed"
              ? item.error
              : item.phase === "ready"
                ? item.summary || PHASE_COPY.ready
                : PHASE_COPY[item.phase]}
          </span>
        </p>
      </div>
      <button
        type="button"
        aria-label={`Remove ${item.fileName}`}
        onClick={onRemove}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
      </button>
    </li>
  )
}

/** A file inside a sent message. Photos preview for their uploader only. */
export function SetupSentAttachment({
  data,
  inverted,
}: {
  data: SetupAttachmentPartData
  inverted?: boolean
}) {
  return (
    <div
      className={cn(
        "flex max-w-full items-center gap-2 rounded-lg py-1 pl-1 pr-2.5",
        inverted ? "bg-primary-foreground/10" : "bg-muted",
      )}
    >
      <AttachmentThumbnail
        src={
          data.kind === "IMAGE"
            ? `/api/assistant/attachments/${encodeURIComponent(data.attachmentId)}/content`
            : null
        }
        kind={data.kind}
        className={
          inverted
            ? "bg-primary-foreground/15 text-primary-foreground"
            : undefined
        }
      />
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">{data.fileName}</p>
        <p
          className={cn(
            "truncate text-[11px]",
            inverted ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          {data.summary}
        </p>
      </div>
    </div>
  )
}
