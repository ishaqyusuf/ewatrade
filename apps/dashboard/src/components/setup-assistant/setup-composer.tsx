"use client"

import { useTRPC } from "@/trpc/client"
import {
  SETUP_ATTACHMENT_PART,
  SETUP_ATTACHMENT_TYPES,
  type SetupAttachmentPartData,
} from "@ewatrade/assistant/setup/attachments"
import { useDashboardWorkflow } from "@ewatrade/events/dashboard-client"
import {
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@ewatrade/ui"
import {
  ArrowUp02Icon,
  Attachment01Icon,
  Mic01Icon,
  StopIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { SetupComposerAttachment } from "./setup-attachment-chips"
import { useSetupAttachments } from "./use-setup-attachments"
import {
  formatRecorderElapsed,
  useSetupVoiceRecorder,
} from "./use-setup-voice-recorder"

export type SetupComposerPart =
  | { type: "text"; text: string }
  | { type: typeof SETUP_ATTACHMENT_PART; data: SetupAttachmentPartData }

const ACCEPT = [
  ...Object.values(SETUP_ATTACHMENT_TYPES).flat(),
  ".csv",
  ".tsv",
  ".xlsx",
  ".txt",
  ".heic",
].join(",")

export function SetupComposer({
  conversationId,
  busy,
  mediaEnabled,
  onSend,
  onStop,
  assistantMode = "setup",
  inputLabel = "Tell the assistant about your business",
}: {
  conversationId: string
  /** The assistant is answering; sending waits, Stop is offered. */
  busy: boolean
  /** Photos, files and voice notes; when off, the owner only types. */
  mediaEnabled: boolean
  onSend: (parts: SetupComposerPart[]) => Promise<boolean>
  onStop: () => void
  inputLabel?: string
  assistantMode?: "setup" | "product"
}) {
  const workflow = useDashboardWorkflow()
  const typed = useRef(false)
  const trpc = useTRPC()
  const capabilities = useQuery(
    trpc.setupAssistant.attachments.voiceCapabilities.queryOptions(),
  )
  const voiceEnabled = capabilities.data?.enabled === true
  const [sending, setSending] = useState(false)
  const [input, setInput] = useState("")
  const [transcriptHint, setTranscriptHint] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  // One line by default; grows with the message up to three lines, then scrolls.
  useLayoutEffect(() => {
    const textarea = inputRef.current
    if (!textarea) return
    textarea.style.height = ""
    if (!input) return
    const style = getComputedStyle(textarea)
    const maxHeight =
      Number.parseFloat(style.lineHeight) * 3 +
      Number.parseFloat(style.paddingTop) +
      Number.parseFloat(style.paddingBottom)
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
  }, [input])
  const fileRef = useRef<HTMLInputElement | null>(null)
  const attachments = useSetupAttachments({
    conversationId,
    // The owner checks and corrects the transcript before it is sent.
    onTranscript: (text) => {
      setInput((current) =>
        current.trim() ? `${current.trimEnd()}\n${text}` : text,
      )
      setTranscriptHint(true)
      inputRef.current?.focus()
    },
  })
  const recorder = useSetupVoiceRecorder({
    assistantMode,
    onReady: (file, durationMs) => void attachments.add(file, { durationMs }),
  })
  const recording = recorder.state.kind === "recording"
  const levels =
    recorder.state.kind === "recording" ? recorder.state.levels : []

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const canSend =
    !busy &&
    !sending &&
    recorder.state.kind !== "preparing" &&
    recorder.state.kind !== "requesting" &&
    !attachments.busy &&
    !recording &&
    input.length <= 8000 &&
    (!attachments.items.some(
      (item) => item.kind === "AUDIO" && item.phase === "ready",
    ) ||
      input.trim().length > 0) &&
    (input.trim().length > 0 || attachments.readyCount > 0)

  const send = async () => {
    if (!canSend) return
    const text = input.trim()
    const ready = attachments.takeReady(false)
    setSending(true)
    try {
      const accepted = await onSend([
        ...(text ? [{ type: "text" as const, text }] : []),
        ...ready.map((data) => ({ type: SETUP_ATTACHMENT_PART, data })),
      ])
      if (accepted) {
        typed.current = false
        attachments.takeReady()
        setInput((current) => (current.trim() === text ? "" : current))
        setTranscriptHint(false)
      }
    } catch {
      // The chat displays the send error; keep the editable draft and audio.
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="border-t border-border px-4 py-3 sm:px-6">
      {attachments.items.length > 0 ? (
        <ul aria-label="Files to send" className="mb-2 flex flex-wrap gap-2">
          {attachments.items.map((item) => (
            <SetupComposerAttachment
              key={item.localId}
              item={item}
              onRemove={() => attachments.remove(item.localId)}
              onRetry={() => void attachments.retry(item.localId)}
              disabled={busy || sending}
            />
          ))}
        </ul>
      ) : null}

      {recorder.state.kind === "recording" ? (
        <output
          aria-live="polite"
          className="mb-2 flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2"
        >
          <span className="size-2 motion-safe:animate-pulse rounded-full bg-destructive" />
          <span className="text-xs tabular-nums text-foreground">
            {formatRecorderElapsed(recorder.state.elapsedMs)} /{" "}
            {formatRecorderElapsed(recorder.maxDurationMs)}
          </span>
          <span aria-hidden className="flex h-5 flex-1 items-center gap-0.5">
            {Array.from({ length: 12 }, (_, index) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed meter bars
                key={index}
                className="w-1 rounded-full bg-primary/70"
                style={{
                  height: `${Math.max(12, (levels[index] ?? 0) * 100)}%`,
                }}
              />
            ))}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={recorder.cancel}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={recorder.stop}>
            Done
          </Button>
        </output>
      ) : recorder.state.kind === "unsupported" ? (
        <p role="alert" className="mb-2 text-xs text-destructive">
          {recorder.state.message}{" "}
          <button
            type="button"
            className="underline"
            onClick={recorder.dismiss}
          >
            OK
          </button>
        </p>
      ) : null}

      {recorder.state.kind === "requesting" ||
      recorder.state.kind === "preparing" ? (
        <output className="mb-2 block text-xs text-muted-foreground">
          {recorder.state.kind === "requesting"
            ? "Allow microphone access to begin."
            : "Preparing your recording…"}
        </output>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <InputGroup>
          <InputGroupTextarea
            ref={inputRef}
            aria-label={inputLabel}
            placeholder="Tell me what you sell…"
            rows={1}
            className="min-h-0"
            maxLength={8000}
            value={input}
            onChange={(event) => {
              if (event.target.value.trim() && !typed.current) {
                typed.current = true
                workflow.track("assistant_typing", "started", {
                  channel: "composer",
                  assistant_mode: assistantMode,
                })
              }
              setInput(event.target.value)
            }}
          />
          <InputGroupAddon align="inline-end" className="self-end">
            {mediaEnabled ? (
              <div className="flex items-center gap-1">
                <InputGroupButton
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Attach a photo or file"
                  disabled={recording || busy || sending}
                  onClick={() => fileRef.current?.click()}
                >
                  <HugeiconsIcon icon={Attachment01Icon} className="size-4" />
                </InputGroupButton>
              </div>
            ) : null}
            <div className="flex items-center gap-1">
              {voiceEnabled ? (
                <InputGroupButton
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Record a voice note"
                  title="Record a voice note"
                  disabled={
                    busy ||
                    sending ||
                    attachments.busy ||
                    recorder.state.kind !== "idle"
                  }
                  onClick={() => void recorder.start()}
                >
                  <HugeiconsIcon icon={Mic01Icon} className="size-4" />
                </InputGroupButton>
              ) : null}
              {busy ? (
                <InputGroupButton
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label="Stop"
                  onClick={onStop}
                >
                  <HugeiconsIcon icon={StopIcon} className="size-4" />
                </InputGroupButton>
              ) : (
                <InputGroupButton
                  type="submit"
                  size="icon-sm"
                  variant="default"
                  aria-label="Send"
                  disabled={!canSend}
                >
                  <HugeiconsIcon icon={ArrowUp02Icon} className="size-4" />
                </InputGroupButton>
              )}
            </div>
          </InputGroupAddon>
        </InputGroup>
        {mediaEnabled ? (
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              for (const file of Array.from(event.target.files ?? []))
                void attachments.add(file)
              event.target.value = ""
            }}
          />
        ) : null}
      </form>
      {input.length > 8000 ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          Shorten the message to 8,000 characters before sending.
        </p>
      ) : null}
      <p className="mt-2 text-[11px] text-muted-foreground">
        {transcriptHint
          ? "Check the voice note text above and fix anything it misheard before sending."
          : "Nothing is added to your business until you confirm it. The assistant can make mistakes, so check each record."}
      </p>
    </div>
  )
}
