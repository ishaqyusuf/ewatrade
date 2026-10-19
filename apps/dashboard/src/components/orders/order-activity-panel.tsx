"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { useAttachmentAccess } from "@/hooks/use-attachment-access"
import { useTRPC } from "@/trpc/client"
import { Button, Textarea } from "@ewatrade/ui"
import {
  Attachment01Icon,
  Cancel01Icon,
  File01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { put } from "@vercel/blob/client"
import { useEffect, useRef, useState } from "react"

const VIDEO_TYPES = ["video/mp4", "video/quicktime"]
const ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  ...VIDEO_TYPES,
].join(",")
const MAX_BYTES = 10 * 1024 * 1024
const MAX_VIDEO_BYTES = 100 * 1024 * 1024
const MAX_FILES = 6

const isVideo = (type: string) => VIDEO_TYPES.includes(type)

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

function contentPath(attachmentId: string) {
  return `/api/orders/attachments/${encodeURIComponent(attachmentId)}/content`
}

/** The note box at the foot of an order's Activity: text, photos, PDFs, videos. */
export function OrderNoteComposer({ orderId }: { orderId: string }) {
  const attachments = useAttachmentAccess(orderId)
  const pickerCheck = useRef<(() => Promise<boolean>) | null>(null)
  const selectedOrder = useRef<string | null>(null)
  const trpc = useTRPC()
  const client = useQueryClient()
  const add = useMutation(trpc.orders.activity.add.mutationOptions())
  const uploadTarget = useMutation(
    trpc.orders.activity.uploadTarget.mutationOptions(),
  )
  const confirmUpload = useMutation(
    trpc.orders.activity.confirmUpload.mutationOptions(),
  )
  const [progress, setProgress] = useState<number | null>(null)
  const [body, setBody] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  // Kept across retries so a failed upload resumes the same entry.
  const clientActivityId = useRef(`activity-${crypto.randomUUID()}`)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    setFiles([])
    selectedOrder.current = orderId
    pickerCheck.current = null
  }, [orderId])

  async function choose(list: FileList | null) {
    if (!pickerCheck.current || !(await pickerCheck.current())) return
    selectedOrder.current = orderId
    const picked = Array.from(list ?? [])
    if (picked.some((file) => !ACCEPT.split(",").includes(file.type))) {
      setError(
        "Attach photos (JPG, PNG, WebP, HEIC), PDFs or videos (MP4, MOV).",
      )
      return
    }
    if (
      picked.some(
        (file) =>
          file.size > (isVideo(file.type) ? MAX_VIDEO_BYTES : MAX_BYTES),
      )
    ) {
      setError("Photos and PDFs can be up to 10 MB, videos up to 100 MB.")
      return
    }
    setError(null)
    setFiles((current) => [...current, ...picked].slice(0, MAX_FILES))
  }

  async function post() {
    if (posting || (!body.trim() && files.length === 0)) return
    setPosting(true)
    setError(null)
    try {
      if (
        files.length &&
        (selectedOrder.current !== orderId || !(await attachments.allow()))
      )
        return
      const read = await Promise.all(
        files.map(async (file) => ({ file, digest: await sha256(file) })),
      )
      if (files.length && !(await attachments.allow())) return
      const entry = await add.mutateAsync({
        attachments: read.map(({ file, digest }) => ({
          contentDigest: digest,
          contentType: file.type,
          fileName: file.name,
          sizeBytes: file.size,
        })),
        body: body.trim() || undefined,
        clientActivityId: clientActivityId.current,
        orderId,
      })
      const pending = [...entry.attachments]
      for (const { file } of read) {
        const index = pending.findIndex(
          (row) => row.contentType === file.type && row.sizeBytes === file.size,
        )
        const attachment = index >= 0 ? pending.splice(index, 1)[0] : undefined
        if (attachment?.status !== "PENDING_UPLOAD") continue
        if (!(await attachments.allow())) return
        const route = await uploadTarget.mutateAsync({
          attachmentId: attachment.id,
        })
        if (!(await attachments.allow())) return
        if (route.mode === "direct") {
          // Live files go straight to private storage, then get checked.
          await put(route.pathname, file, {
            access: "private",
            contentType: route.contentType,
            multipart: true,
            token: route.clientToken,
            onUploadProgress: ({ percentage }) => setProgress(percentage),
          })
          if (!(await attachments.allow())) return
          await confirmUpload.mutateAsync({ attachmentId: attachment.id })
          continue
        }
        const response = await fetch(route.path, {
          body: file,
          credentials: "same-origin",
          headers: { "Content-Type": file.type },
          method: "PUT",
        })
        if (!response.ok) {
          const result = (await response.json().catch(() => null)) as {
            error?: string
          } | null
          throw new Error(result?.error ?? "A file didn't upload.")
        }
      }
      setBody("")
      setFiles([])
      clientActivityId.current = `activity-${crypto.randomUUID()}`
    } catch (failure) {
      setError(
        `${failure instanceof Error ? failure.message : "Could not save."} Select Post to try again.`,
      )
    } finally {
      setPosting(false)
      setProgress(null)
      await client.invalidateQueries({
        queryKey: trpc.orders.activity.list.queryKey({ orderId }),
      })
    }
  }

  return (
    <div className="grid gap-2">
      {attachments.dialog}
      <Textarea
        aria-label="Order note"
        disabled={posting}
        maxLength={2000}
        placeholder="Add a note — what happened, what was agreed…"
        rows={2}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      {files.length ? (
        <ul className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-1 border border-border px-2 py-1 text-xs"
            >
              <span className="max-w-40 truncate">{file.name}</span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                disabled={posting}
                onClick={() =>
                  setFiles((current) =>
                    current.filter((_, position) => position !== index),
                  )
                }
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <FormFeedback appearance="dashboard">{error}</FormFeedback>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <input
          ref={input}
          hidden
          multiple
          accept={ACCEPT}
          type="file"
          onChange={async (event) => {
            const target = event.currentTarget
            try {
              await choose(target.files)
            } finally {
              target.value = ""
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={posting || files.length >= MAX_FILES}
          onClick={async () => {
            pickerCheck.current = attachments.allow
            if (await attachments.allow()) input.current?.click()
          }}
        >
          <HugeiconsIcon icon={Attachment01Icon} className="size-4" />
          Photo, PDF or video{attachments.knownFree ? " · Locked" : ""}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={posting || (!body.trim() && files.length === 0)}
          onClick={() => void post()}
        >
          {posting
            ? progress !== null
              ? `Uploading ${Math.round(progress)}%`
              : "Saving…"
            : "Post"}
        </Button>
      </div>
    </div>
  )
}

type NoteAttachment = {
  id: string
  status: string
  kind: string
  contentType: string
  originalFileName: string | null
}

/** Photos open full size, videos play in place; PDFs and HEIC open as files. */
export function OrderNoteAttachments({
  attachments,
}: { attachments: NoteAttachment[] }) {
  if (!attachments.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((attachment) =>
        attachment.status !== "READY" ? (
          <span
            key={attachment.id}
            className="border border-dashed border-border px-2 py-1 text-xs text-muted-foreground"
          >
            Uploading…
          </span>
        ) : attachment.kind === "VIDEO" ? (
          // biome-ignore lint/a11y/useMediaCaption: Staff clips of goods and deliveries have no captions.
          <video
            key={attachment.id}
            controls
            preload="metadata"
            playsInline
            src={contentPath(attachment.id)}
            aria-label={attachment.originalFileName ?? "Order video"}
            className="max-h-64 w-full max-w-sm border border-border bg-black"
          />
        ) : attachment.kind === "IMAGE" &&
          !["image/heic", "image/heif"].includes(attachment.contentType) ? (
          <a
            key={attachment.id}
            href={contentPath(attachment.id)}
            rel="noreferrer"
            target="_blank"
          >
            {/* Authenticated, uncached content; next/image cannot optimise it. */}
            <img
              alt={attachment.originalFileName ?? "Order photo"}
              className="size-20 border border-border object-cover"
              src={contentPath(attachment.id)}
            />
          </a>
        ) : (
          <a
            key={attachment.id}
            className="flex items-center gap-1 border border-border px-2 py-1 text-xs"
            href={contentPath(attachment.id)}
            rel="noreferrer"
            target="_blank"
          >
            <HugeiconsIcon icon={File01Icon} className="size-4" />
            {attachment.originalFileName ?? "File"}
          </a>
        ),
      )}
    </div>
  )
}
