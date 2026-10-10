"use client"

import { useTRPC } from "@/trpc/client"
import {
  SETUP_ATTACHMENTS_PER_MESSAGE,
  SETUP_ATTACHMENT_LIMITS,
  type SetupAttachmentKind,
  type SetupAttachmentPartData,
  setupAttachmentContentTypeFor,
  validateSetupAttachmentIntent,
} from "@ewatrade/assistant/setup/attachments"
import { useEvents } from "@ewatrade/events/client"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"

export type SetupLocalAttachment = {
  localId: string
  fileName: string
  kind: SetupAttachmentKind | null
  previewUrl: string | null
  phase: "preparing" | "uploading" | "reading" | "ready" | "failed"
  attachmentId: string | null
  summary: string | null
  error: string | null
  retryable?: boolean
}

const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`

function refusalCopy(reason: string, kind: SetupAttachmentKind | null) {
  switch (reason) {
    case "UNSUPPORTED_TYPE":
      return "This file type isn't supported. Send a photo, voice note, CSV, Excel (.xlsx), PDF or text file."
    case "TOO_LARGE":
      return kind
        ? `This file is larger than ${megabytes(SETUP_ATTACHMENT_LIMITS[kind].maxBytes)}. For big lists, use Import instead.`
        : "This file is too large."
    case "TOO_LONG":
      return "Voice notes can be up to 2 minutes. Record a shorter note."
    case "ATTACHMENT_LIMIT":
      return "This setup already has the most files it can hold. Use Import for larger lists."
    case "UPLOADS_UNAVAILABLE":
      return "Files can't be sent right now. Type your list instead."
    case "CONVERSATION_CLOSED":
      return "Reopen setup to send files."
    default:
      return "This file could not be sent. Try again."
  }
}

async function sha256Hex(file: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

async function uploadError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string }
    return body.error ?? null
  } catch {
    return null
  }
}

/**
 * Files the owner is about to send: each is hashed, registered, uploaded and
 * read on the server before it can be sent. Voice transcripts are handed to
 * the composer so the owner can correct them before sending.
 */
export function useSetupAttachments(input: {
  conversationId: string
  onTranscript: (text: string) => void
}) {
  const trpc = useTRPC()
  const workflow = useDashboardWorkflow()
  const events = useEvents()
  const [items, setItemsState] = useState<SetupLocalAttachment[]>([])
  const itemsRef = useRef(items)
  const setItems = useCallback(
    (updater: (current: SetupLocalAttachment[]) => SetupLocalAttachment[]) => {
      itemsRef.current = updater(itemsRef.current)
      setItemsState(itemsRef.current)
    },
    [],
  )
  const transcribed = useRef(new Set<string>())
  const failedEvents = useRef(new Set<string>())
  const cancelled = useRef(new Set<string>())
  const mounted = useRef(true)
  const onTranscriptRef = useRef(input.onTranscript)
  onTranscriptRef.current = input.onTranscript

  const createIntent = useMutation(
    trpc.setupAssistant.attachments.createIntent.mutationOptions(),
  )
  const retryAttachment = useMutation(
    trpc.setupAssistant.attachments.retry.mutationOptions(),
  )
  const pending = useQuery(
    trpc.setupAssistant.attachments.pending.queryOptions(
      { conversationId: input.conversationId },
      { refetchOnWindowFocus: false },
    ),
  )
  const recovered = useRef(false)
  useEffect(() => {
    const rows = pending.data
    if (!rows || recovered.current) return
    recovered.current = true
    setItems((current) => [
      ...current,
      ...rows
        .filter(
          (row) =>
            !row.sent && !current.some((item) => item.attachmentId === row.id),
        )
        .map((row) => ({
          localId: row.id,
          fileName: row.fileName,
          kind: row.kind,
          previewUrl:
            row.kind === "AUDIO" || row.kind === "IMAGE"
              ? `/api/assistant/attachments/${encodeURIComponent(row.id)}/content`
              : null,
          phase: "reading" as const,
          attachmentId: row.id,
          summary: row.summary,
          error: row.error,
          retryable: row.retryable,
        })),
    ])
  }, [pending.data, setItems])
  const removeAttachment = useMutation(
    trpc.setupAssistant.attachments.remove.mutationOptions(),
  )

  const update = useCallback(
    (localId: string, patch: Partial<SetupLocalAttachment>) => {
      if (
        patch.phase === "failed" &&
        !failedEvents.current.has(localId) &&
        itemsRef.current.find((item) => item.localId === localId)?.kind ===
          "AUDIO"
      ) {
        failedEvents.current.add(localId)
        workflow.track("assistant_voice", "failed", {
          channel: "transcription",
        })
      }
      setItems((current) =>
        current.map((item) =>
          item.localId === localId ? { ...item, ...patch } : item,
        ),
      )
    },
    [setItems, workflow],
  )

  const reading = items
    .filter((item) => item.phase === "reading" && item.attachmentId)
    .map((item) => item.attachmentId as string)
  const status = useQuery(
    trpc.setupAssistant.attachments.list.queryOptions(
      { attachmentIds: reading },
      { enabled: reading.length > 0, refetchInterval: 1_500 },
    ),
  )

  useEffect(() => {
    for (const row of status.data ?? []) {
      const item = itemsRef.current.find(
        (entry) => entry.attachmentId === row.id,
      )
      if (!item || item.phase !== "reading") continue
      if (row.status === "READY") {
        update(item.localId, { phase: "ready", summary: row.summary })
        if (row.transcript && !transcribed.current.has(row.id)) {
          transcribed.current.add(row.id)
          workflow.track("assistant_voice", "completed", {
            channel: "transcription",
            item_count: 1,
          })
          onTranscriptRef.current(row.transcript)
        }
      } else if (row.status === "FAILED")
        update(item.localId, {
          phase: "failed",
          error: row.error ?? "This file could not be read.",
          retryable: row.retryable,
        })
    }
  }, [status.data, update, workflow])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      for (const item of itemsRef.current) {
        cancelled.current.add(item.localId)
        if (item.previewUrl?.startsWith("blob:"))
          URL.revokeObjectURL(item.previewUrl)
      }
    }
  }, [])

  const add = useCallback(
    async (file: File, options: { durationMs?: number } = {}) => {
      const localId = crypto.randomUUID()
      const contentType = setupAttachmentContentTypeFor(file)
      const checked = contentType
        ? validateSetupAttachmentIntent({
            contentType,
            sizeBytes: file.size,
            durationMs: options.durationMs,
          })
        : ({ ok: false, reason: "UNSUPPORTED_TYPE" } as const)
      const kind = checked.ok ? checked.kind : null
      if (kind === "AUDIO")
        workflow.track("assistant_voice", "started", {
          channel: "recording_upload",
          duration_ms: options.durationMs,
        })
      const pending = itemsRef.current.filter(
        (item) => item.phase !== "failed",
      ).length
      const base: SetupLocalAttachment = {
        localId,
        fileName: file.name || "attachment",
        kind,
        previewUrl:
          (kind === "AUDIO" || kind === "IMAGE") &&
          !/hei[cf]/.test(contentType ?? "")
            ? URL.createObjectURL(file)
            : null,
        phase: "preparing",
        attachmentId: null,
        summary: null,
        error: null,
      }
      if (!checked.ok || !contentType) {
        setItems((current) => [
          ...current,
          {
            ...base,
            phase: "failed",
            error: refusalCopy(checked.ok ? "" : checked.reason, kind),
          },
        ])
        return
      }
      if (pending >= SETUP_ATTACHMENTS_PER_MESSAGE) {
        setItems((current) => [
          ...current,
          {
            ...base,
            phase: "failed",
            error: `You can send up to ${SETUP_ATTACHMENTS_PER_MESSAGE} files in one message.`,
          },
        ])
        return
      }
      setItems((current) => [...current, base])
      try {
        const intent = await createIntent.mutateAsync({
          conversationId: input.conversationId,
          clientRequestId: localId,
          fileName: base.fileName,
          contentType,
          sizeBytes: file.size,
          contentDigest: await sha256Hex(file),
          durationMs: options.durationMs,
        })
        if (!intent.ok) {
          update(localId, {
            phase: "failed",
            error: refusalCopy(intent.reason, kind),
          })
          return
        }
        if (!mounted.current || cancelled.current.has(localId)) {
          void removeAttachment.mutateAsync({
            attachmentId: intent.attachment.id,
          })
          return
        }
        update(localId, {
          phase: "uploading",
          attachmentId: intent.attachment.id,
        })
        const response = await fetch(intent.uploadPath, {
          method: "PUT",
          body: file,
          credentials: "same-origin",
          headers: {
            "Content-Type": contentType,
            "x-ewatrade-analytics": events.canCollect() ? "allowed" : "denied",
          },
        })
        if (!response.ok) {
          update(localId, {
            phase: "failed",
            error:
              (await uploadError(response)) ??
              "This file could not be uploaded. Try again.",
          })
          return
        }
        update(localId, { phase: "reading" })
      } catch {
        update(localId, {
          phase: "failed",
          error: "This file could not be uploaded. Check your connection.",
        })
      }
    },
    [
      events,
      createIntent,
      removeAttachment,
      input.conversationId,
      update,
      workflow,
      setItems,
    ],
  )

  const remove = useCallback(
    (localId: string) => {
      const item = itemsRef.current.find((entry) => entry.localId === localId)
      if (!item) return
      cancelled.current.add(localId)
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      if (item.attachmentId)
        removeAttachment.mutate({ attachmentId: item.attachmentId })
      setItems((current) =>
        current.filter((entry) => entry.localId !== localId),
      )
    },
    [removeAttachment, setItems],
  )

  /** Ready files leave the composer once they are in a sent message. */
  const takeReady = useCallback(
    (clear = true): SetupAttachmentPartData[] => {
      const ready = itemsRef.current.filter(
        (item) => item.phase === "ready" && item.attachmentId && item.kind,
      )
      if (clear) {
        setItems((current) => current.filter((item) => item.phase !== "ready"))
        for (const item of ready)
          if (item.previewUrl?.startsWith("blob:"))
            URL.revokeObjectURL(item.previewUrl)
      }
      return ready.map((item) => ({
        attachmentId: item.attachmentId as string,
        kind: item.kind as SetupAttachmentKind,
        fileName: item.fileName,
        summary: item.summary ?? "",
      }))
    },
    [setItems],
  )

  return {
    items,
    add,
    remove,
    retry: async (localId: string) => {
      const item = itemsRef.current.find((row) => row.localId === localId)
      if (!item?.attachmentId || !item.retryable) return
      failedEvents.current.delete(localId)
      workflow.track("assistant_voice", "started", { channel: "retry" })
      update(localId, { phase: "reading", error: null })
      try {
        const result = await retryAttachment.mutateAsync({
          attachmentId: item.attachmentId,
        })
        if (!result.retried)
          update(localId, {
            phase: "failed",
            retryable: false,
            error: "Please remove this note and record again.",
          })
      } catch {
        update(localId, {
          phase: "failed",
          error: "Check your connection and try again.",
        })
      }
    },
    takeReady,
    busy: items.some((item) =>
      ["preparing", "uploading", "reading"].includes(item.phase),
    ),
    readyCount: items.filter((item) => item.phase === "ready").length,
  }
}
