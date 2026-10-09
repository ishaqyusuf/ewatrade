"use client"

import {
  SETUP_ATTACHMENT_PART,
  SETUP_ATTACHMENT_TYPES,
  type SetupAttachmentPartData,
} from "@ewatrade/assistant/setup/attachments"
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
import { useEffect, useRef, useState } from "react"
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
  inputLabel = "Tell the assistant about your business",
}: {
  conversationId: string
  /** The assistant is answering; sending waits, Stop is offered. */
  busy: boolean
  /** Photos, files and voice notes; when off, the owner only types. */
  mediaEnabled: boolean
  onSend: (parts: SetupComposerPart[]) => void
  onStop: () => void
  inputLabel?: string
}) {
  const [input, setInput] = useState("")
  const [transcriptHint, setTranscriptHint] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
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
    !attachments.busy &&
    !recording &&
    (input.trim().length > 0 || attachments.readyCount > 0)

  const send = () => {
    if (!canSend) return
    const text = input.trim()
    const ready = attachments.takeReady()
    onSend([
      ...(text ? [{ type: "text" as const, text }] : []),
      ...ready.map((data) => ({ type: SETUP_ATTACHMENT_PART, data })),
    ])
    setInput("")
    setTranscriptHint(false)
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
            />
          ))}
        </ul>
      ) : null}

      {recorder.state.kind === "recording" ? (
        <output
          aria-live="polite"
          className="mb-2 flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2"
        >
          <span className="size-2 animate-pulse rounded-full bg-destructive" />
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

      <form
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <InputGroup>
          <InputGroupTextarea
            ref={inputRef}
            aria-label={inputLabel}
            placeholder="Tell me what you sell, your prices and how many you have…"
            rows={2}
            maxLength={8000}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                send()
              }
            }}
          />
          <InputGroupAddon
            align="block-end"
            className={mediaEnabled ? "justify-between" : "justify-end"}
          >
            {mediaEnabled ? (
              <div className="flex items-center gap-1">
                <InputGroupButton
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Attach a photo or file"
                  disabled={recording}
                  onClick={() => fileRef.current?.click()}
                >
                  <HugeiconsIcon icon={Attachment01Icon} className="size-4" />
                </InputGroupButton>
                <InputGroupButton
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Record a voice note"
                  disabled={recording || recorder.state.kind === "requesting"}
                  onClick={() => void recorder.start()}
                >
                  <HugeiconsIcon icon={Mic01Icon} className="size-4" />
                </InputGroupButton>
              </div>
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
      <p className="mt-2 text-[11px] text-muted-foreground">
        {transcriptHint
          ? "Check the voice note text above and fix anything it misheard before sending."
          : "Nothing is added to your business until you confirm it. The assistant can make mistakes, so check each record."}
      </p>
    </div>
  )
}
