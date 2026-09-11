"use client"

import type {
  StoreConversationAttachmentDraft,
  StoreConversationAttachmentPolicy,
} from "@ewatrade/utils"
import {
  createStoreConversationAttachmentDraft,
  reduceStoreConversationAttachmentDraft,
} from "@ewatrade/utils"
import { useEffect, useRef, useState } from "react"

export const DEFAULT_CONVERSATION_ATTACHMENT_POLICY: StoreConversationAttachmentPolicy =
  {
    acceptedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
      "application/pdf",
      "audio/mp4",
      "audio/mpeg",
      "audio/ogg",
      "audio/wav",
      "audio/webm",
    ],
    allowedKinds: ["image", "document", "audio"],
    maxAudioBytes: 5_000_000,
    maxBytes: 10_000_000,
  }

export function useStoreConversationAttachmentDraft(input: {
  enabled: boolean
  onUpload: (input: {
    draft: StoreConversationAttachmentDraft
    file: File
    signal: AbortSignal
    updateProgress: (progress: number) => void
  }) => Promise<void>
  policy?: StoreConversationAttachmentPolicy
  scopeKey: string
}) {
  const [draft, setDraft] = useState<StoreConversationAttachmentDraft | null>(
    null,
  )
  const [notice, setNotice] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  const selectedFile = useRef<File | null>(null)
  const localReference = useRef<string | null>(null)
  const activeScope = useRef(input.scopeKey)
  const pickerScope = useRef<string | null>(null)
  const attemptGeneration = useRef(0)
  const uploading = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const policy = input.policy ?? DEFAULT_CONVERSATION_ATTACHMENT_POLICY

  function clearSelectedFile() {
    if (localReference.current?.startsWith("blob:")) {
      URL.revokeObjectURL(localReference.current)
    }
    localReference.current = null
    selectedFile.current = null
    pickerScope.current = null
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  useEffect(() => {
    activeScope.current = input.scopeKey
    attemptGeneration.current += 1
    controller.current?.abort()
    controller.current = null
    uploading.current = false
    setDraft(null)
    if (localReference.current?.startsWith("blob:")) {
      URL.revokeObjectURL(localReference.current)
    }
    localReference.current = null
    selectedFile.current = null
    setNotice(null)
    return () => {
      attemptGeneration.current += 1
      controller.current?.abort()
      if (localReference.current?.startsWith("blob:")) {
        URL.revokeObjectURL(localReference.current)
      }
      localReference.current = null
      selectedFile.current = null
    }
  }, [input.scopeKey])

  function chooseFile() {
    if (!input.enabled) return
    pickerScope.current = activeScope.current
    setNotice(null)
    fileInputRef.current?.click()
  }

  function selectFile(file: File | undefined) {
    if (!file || !input.enabled) return
    const previewReference =
      (file.type.startsWith("image/") || file.type.startsWith("audio/")) &&
      typeof URL !== "undefined"
        ? URL.createObjectURL(file)
        : file.name
    const result = createStoreConversationAttachmentDraft({
      file: {
        localReference: previewReference,
        mimeType: file.type,
        name: file.name,
        size: file.size,
      },
      operationId: crypto.randomUUID(),
      policy,
    })
    if (!result.ok) {
      if (previewReference.startsWith("blob:")) {
        URL.revokeObjectURL(previewReference)
      }
      setNotice(result.message)
      return
    }
    clearSelectedFile()
    localReference.current = previewReference
    selectedFile.current = file
    setNotice(null)
    setDraft(result.draft)
  }

  function acceptFile(file: File | undefined) {
    if (pickerScope.current !== activeScope.current) {
      pickerScope.current = null
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }
    pickerScope.current = null
    selectFile(file)
  }

  function acceptRecordedVoice(file: File) {
    if (!input.enabled || activeScope.current !== input.scopeKey) return false
    selectFile(file)
    return true
  }

  async function upload() {
    if (
      !draft ||
      draft.status === "uploading" ||
      !input.enabled ||
      uploading.current ||
      !selectedFile.current
    )
      return false
    uploading.current = true
    const attempt = attemptGeneration.current + 1
    attemptGeneration.current = attempt
    const attemptController = new AbortController()
    controller.current = attemptController
    const selected = reduceStoreConversationAttachmentDraft(draft, {
      type: "upload_started",
    })
    setDraft(selected)
    setNotice(null)
    try {
      await input.onUpload({
        draft: selected,
        file: selectedFile.current,
        signal: attemptController.signal,
        updateProgress: (progress) => {
          if (attemptGeneration.current !== attempt) return
          setDraft((current) =>
            current
              ? reduceStoreConversationAttachmentDraft(current, {
                  progress,
                  type: "upload_progressed",
                })
              : current,
          )
        },
      })
      if (attemptGeneration.current !== attempt) return false
      setDraft(null)
      clearSelectedFile()
      if (controller.current === attemptController) controller.current = null
      uploading.current = false
      if (fileInputRef.current) fileInputRef.current.value = ""
      return true
    } catch (error) {
      if (attemptGeneration.current !== attempt) return false
      const cancelled = attemptController.signal.aborted
      setDraft((current) =>
        current
          ? reduceStoreConversationAttachmentDraft(
              current,
              cancelled
                ? { type: "upload_cancelled" }
                : {
                    message:
                      error instanceof Error
                        ? error.message
                        : "Upload interrupted. Try again.",
                    type: "upload_failed",
                  },
            )
          : current,
      )
      if (controller.current === attemptController) controller.current = null
      uploading.current = false
      return false
    }
  }

  function cancel() {
    controller.current?.abort()
  }

  function retry() {
    setDraft((current) =>
      current
        ? reduceStoreConversationAttachmentDraft(current, {
            type: "upload_retried",
          })
        : current,
    )
    setNotice(null)
  }

  function remove() {
    attemptGeneration.current += 1
    controller.current?.abort()
    controller.current = null
    uploading.current = false
    setDraft(null)
    clearSelectedFile()
    setNotice(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return {
    acceptFile,
    acceptRecordedVoice,
    cancel,
    chooseFile,
    draft,
    fileInputRef,
    notice,
    policy,
    remove,
    retry,
    upload,
  }
}

export function StoreConversationAttachmentTray({
  draft,
  requestLabel,
  onCancel,
  onRemove,
  onRetry,
}: {
  draft: StoreConversationAttachmentDraft
  requestLabel: string
  onCancel: () => void
  onRemove: () => void
  onRetry: () => void
}) {
  return (
    <div
      aria-label={`${draft.file.name}. For ${requestLabel}. ${
        draft.status === "uploading"
          ? `${draft.progress}% uploaded`
          : draft.status === "failed"
            ? draft.failureMessage
            : "Ready to send"
      }`}
      className="relative size-14"
    >
      {draft.file.kind === "image" ? (
        <img
          alt={`Preview of ${draft.file.name}`}
          className="size-14 rounded-full border border-border object-cover"
          src={draft.file.localReference}
        />
      ) : draft.file.kind === "audio" ? (
        <LocalVoiceNoteAvatar source={draft.file.localReference} />
      ) : (
        <div className="grid size-14 place-items-center rounded-full border border-border bg-primary/10 text-primary">
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
        </div>
      )}
      {draft.status === "uploading" ? (
        <div
          aria-label={`${draft.progress}% uploaded`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={draft.progress}
          className="absolute inset-0 grid place-items-center rounded-full bg-background/70"
          role="progressbar"
          tabIndex={0}
        >
          <span
            aria-hidden="true"
            className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent"
          />
        </div>
      ) : null}
      {draft.status === "failed" ? (
        <button
          aria-label={`Retry ${draft.file.name}`}
          className="absolute -bottom-2 -left-2 grid size-11 place-items-center rounded-full border border-border bg-background text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onRetry}
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
      <button
        aria-label={
          draft.status === "uploading"
            ? `Cancel ${draft.file.name} upload`
            : `Remove ${draft.file.name}`
        }
        className="absolute -right-2 -top-2 grid size-11 place-items-center rounded-full border border-border bg-background text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={draft.status === "uploading" ? onCancel : onRemove}
        type="button"
      >
        <svg
          aria-hidden="true"
          className="size-4"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            d="m6 6 12 12M18 6 6 18"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
          />
        </svg>
      </button>
    </div>
  )
}

export function StoreConversationRestoredAttachmentAvatar({
  kind,
  onRemove,
}: {
  kind: "audio" | "document" | "image"
  onRemove: () => void
}) {
  return (
    <div
      aria-label={`Unsent ${kind} attachment restored. Reselect the file before sending.`}
      className="relative size-14"
    >
      <div className="grid size-14 place-items-center rounded-full border border-dashed border-border bg-primary/10 text-primary">
        {kind === "audio" ? (
          <svg
            aria-hidden="true"
            className="size-5"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              d="M12 3a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 19v3m-4 0h8"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        ) : kind === "image" ? (
          <svg
            aria-hidden="true"
            className="size-5"
            fill="none"
            viewBox="0 0 24 24"
          >
            <rect
              height="16"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.8"
              width="18"
              x="3"
              y="4"
            />
            <path
              d="m4 17 5-5 4 4 2-2 5 4M16 9h.01"
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
              d="M6 2h8l4 4v16H6V2Zm8 0v5h5M9 13h6m-6 4h6"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        )}
      </div>
      <button
        aria-label={`Remove restored ${kind} attachment`}
        className="absolute -right-2 -top-2 grid size-11 place-items-center rounded-full border border-border bg-background text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onRemove}
        type="button"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  )
}

function LocalVoiceNoteAvatar({ source }: { source: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  return (
    <>
      {/* biome-ignore lint/a11y/useMediaCaption: Voice-note transcription is explicitly out of scope. */}
      <audio
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        preload="metadata"
        ref={audioRef}
        src={source}
      />
      <button
        aria-label={
          playing ? "Pause voice note preview" : "Play voice note preview"
        }
        className="grid size-14 place-items-center rounded-full border border-border bg-primary/10 text-primary"
        onClick={() => {
          if (!audioRef.current) return
          if (audioRef.current.paused) void audioRef.current.play()
          else audioRef.current.pause()
        }}
        type="button"
      >
        <svg
          aria-hidden="true"
          className="size-5"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          {playing ? (
            <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
          ) : (
            <path d="m8 5 11 7-11 7z" />
          )}
        </svg>
      </button>
    </>
  )
}
