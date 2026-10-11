"use client"
import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import {
  ArrowUp02Icon,
  Cancel01Icon,
  Mic01Icon,
  PlusSignIcon,
  StopIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useSetupAttachments } from "../setup-assistant/use-setup-attachments"
import {
  formatRecorderElapsed,
  useSetupVoiceRecorder,
} from "../setup-assistant/use-setup-voice-recorder"

type ComposerProps = {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  /** The assistant is replying; Send becomes Stop. */
  busy: boolean
  /** Extra reasons sending is not possible right now (loading, pending, …). */
  blocked: boolean
  /** The box itself is off (allowance used up, chat unavailable). */
  disabled: boolean
  placeholder: string
  label: string
  /** Voice notes are written out into this chat's box; null hides the mic. */
  voiceConversationId: string | null
  /** Shown under the box unless a voice hint replaces it. */
  footer?: ReactNode
  /** Files are ready to send, so an empty message may be sent. */
  hasAttachments?: boolean
  /** Shows the + button and the attached files inside the box. */
  attach?: ComposerAttach
}

export type ComposerAttach = {
  accept: string
  disabled: boolean
  onFiles: (files: File[]) => void
  /** Attached files, shown inside the box above the text. */
  chips: ReactNode
}

/**
 * The chat box shared by the assistant page and the quick-assistant widget.
 * One line to start, grows to 3 lines on phones and 5 on larger screens.
 * Enter adds a line; the round Send button or Ctrl/⌘+Enter sends.
 */
export function AssistantComposer(props: ComposerProps) {
  return props.voiceConversationId ? (
    <VoiceComposer
      key={props.voiceConversationId}
      {...props}
      conversationId={props.voiceConversationId}
    />
  ) : (
    <ComposerBox {...props} voice={null} />
  )
}

type Voice = {
  recording: boolean
  elapsedMs: number
  maxDurationMs: number
  levels: number[]
  /** Uploading or writing out a recording. */
  working: boolean
  status: string | null
  error: string | null
  hint: boolean
  start: () => void
  /** Stop and write the words into the box to check before sending. */
  stop: () => void
  /** Stop, write the words out and send them. */
  stopAndSend: () => void
  cancel: () => void
  dismiss: () => void
}

function VoiceComposer({
  conversationId,
  ...props
}: ComposerProps & { conversationId: string }) {
  const trpc = useTRPC()
  const capabilities = useQuery(
    trpc.setupAssistant.attachments.voiceCapabilities.queryOptions(undefined, {
      retry: false,
      // The local Whisper gateway can come and go; hide the mic when it does.
      staleTime: 30_000,
      refetchInterval: 60_000,
    }),
  )
  const [hint, setHint] = useState(false)
  const sendWhenWritten = useRef(false)
  const [pendingSend, setPendingSend] = useState<string | null>(null)
  const valueRef = useRef(props.value)
  valueRef.current = props.value
  const onChangeRef = useRef(props.onChange)
  onChangeRef.current = props.onChange
  const attachments = useSetupAttachments({
    conversationId,
    // The person checks and fixes the transcript before sending it as text.
    onTranscript: (text) => {
      const current = valueRef.current
      const next = current.trim() ? `${current.trimEnd()}\n${text}` : text
      onChangeRef.current(next)
      if (sendWhenWritten.current) {
        sendWhenWritten.current = false
        setPendingSend(next)
      } else setHint(true)
    },
  })
  const recorder = useSetupVoiceRecorder({
    onReady: (file, durationMs) => void attachments.add(file, { durationMs }),
  })
  // Voice notes here only become text: drop each recording once written out.
  const { items, remove } = attachments
  useEffect(() => {
    for (const item of items)
      if (item.kind === "AUDIO" && item.phase === "ready") remove(item.localId)
  }, [items, remove])
  useEffect(() => {
    if (!props.value) setHint(false)
  }, [props.value])
  // Send once the written-out words have reached the box.
  const { onSend } = props
  useEffect(() => {
    if (pendingSend === null || props.value !== pendingSend) return
    setPendingSend(null)
    onSend()
  }, [pendingSend, props.value, onSend])

  if (capabilities.data?.enabled !== true)
    return <ComposerBox {...props} voice={null} />
  const failed = items.find((item) => item.phase === "failed")
  const state = recorder.state
  const voice: Voice = {
    recording: state.kind === "recording",
    elapsedMs: state.kind === "recording" ? state.elapsedMs : 0,
    levels: state.kind === "recording" ? state.levels : [],
    maxDurationMs: recorder.maxDurationMs,
    working:
      attachments.busy ||
      state.kind === "requesting" ||
      state.kind === "preparing",
    status:
      state.kind === "requesting"
        ? "Allow microphone access to begin."
        : state.kind === "preparing"
          ? "Preparing your recording…"
          : attachments.busy
            ? "Writing out your voice note…"
            : null,
    error:
      state.kind === "unsupported"
        ? state.message
        : (failed?.error ??
          (failed ? "The voice note could not be read." : null)),
    hint,
    start: () => {
      setHint(false)
      sendWhenWritten.current = false
      void recorder.start()
    },
    stop: recorder.stop,
    stopAndSend: () => {
      sendWhenWritten.current = true
      recorder.stop()
    },
    cancel: () => {
      sendWhenWritten.current = false
      recorder.cancel()
    },
    dismiss: () => {
      recorder.dismiss()
      if (failed) remove(failed.localId)
    },
  }
  return <ComposerBox {...props} voice={voice} />
}

function ComposerBox({
  value,
  onChange,
  onSend,
  onStop,
  busy,
  blocked,
  disabled,
  placeholder,
  label,
  footer,
  voice,
  hasAttachments = false,
  attach,
}: ComposerProps & { voice: Voice | null }) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  // Wrapped text stacks the box (text on top, buttons below) until cleared;
  // large screens are always stacked.
  const [wrapped, setWrapped] = useState(false)
  useLayoutEffect(() => {
    const textarea = inputRef.current
    if (!textarea) return
    textarea.style.height = ""
    if (!value) {
      setWrapped(false)
      return
    }
    const style = getComputedStyle(textarea)
    const lineHeight = Number.parseFloat(style.lineHeight)
    const padding =
      Number.parseFloat(style.paddingTop) +
      Number.parseFloat(style.paddingBottom)
    if (textarea.scrollHeight - padding > lineHeight * 1.5) setWrapped(true)
    const lines = window.matchMedia("(min-width: 768px)").matches ? 5 : 3
    textarea.style.height = `${Math.min(textarea.scrollHeight, lineHeight * lines + padding)}px`
  }, [value])
  const stacked = wrapped || value.includes("\n")
  const working = voice?.working === true
  const canSend =
    !busy &&
    !blocked &&
    !disabled &&
    !working &&
    (value.trim().length > 0 || hasAttachments) &&
    value.length <= 8000
  const send = () => {
    if (canSend) onSend()
  }
  const round = "size-9 shrink-0 rounded-[50%]"

  return (
    <div>
      {voice?.status ? (
        <output className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-3 motion-safe:animate-spin rounded-full border-2 border-border border-t-primary" />
          {voice.status}
        </output>
      ) : null}
      {voice?.error ? (
        <p role="alert" className="mb-2 text-xs text-destructive">
          {voice.error}{" "}
          <button type="button" className="underline" onClick={voice.dismiss}>
            OK
          </button>
        </p>
      ) : null}
      <form
        className="rounded-[26px] border border-border bg-background p-1.5 shadow-xs"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        {attach?.chips}
        {voice?.recording ? (
          <output
            aria-live="polite"
            className="flex min-h-9 items-center gap-2"
          >
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={`${round} text-muted-foreground`}
              aria-label="Cancel recording"
              title="Cancel recording"
              onClick={voice.cancel}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
            </Button>
            <span className="size-2 shrink-0 rounded-full bg-destructive" />
            <span className="shrink-0 text-xs tabular-nums">
              {formatRecorderElapsed(voice.elapsedMs)} /{" "}
              {formatRecorderElapsed(voice.maxDurationMs)}
            </span>
            <span
              aria-hidden
              className="flex h-5 min-w-0 flex-1 items-center gap-0.5 overflow-hidden"
            >
              {Array.from({ length: 24 }, (_, index) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed meter bars
                  key={index}
                  className="w-1 shrink-0 rounded-full bg-primary/70"
                  style={{
                    height: `${Math.max(15, (voice.levels[index % Math.max(1, voice.levels.length)] ?? 0) * 100)}%`,
                  }}
                />
              ))}
            </span>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={round}
              aria-label="Stop and put the words in the box"
              title="Stop and put the words in the box"
              onClick={voice.stop}
            >
              <HugeiconsIcon icon={StopIcon} className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              className={round}
              aria-label="Stop and send"
              title="Stop and send"
              onClick={voice.stopAndSend}
            >
              <HugeiconsIcon icon={ArrowUp02Icon} className="size-4" />
            </Button>
          </output>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            {attach ? (
              <>
                <input
                  ref={fileRef}
                  hidden
                  multiple
                  accept={attach.accept}
                  type="file"
                  onChange={(event) => {
                    attach.onFiles(Array.from(event.target.files ?? []))
                    event.target.value = ""
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className={`${round} ${stacked ? "order-2" : "order-1"} lg:order-2`}
                  aria-label="Attach a photo or PDF"
                  title="Attach a photo or PDF"
                  disabled={disabled || busy || attach.disabled}
                  onClick={() => fileRef.current?.click()}
                >
                  <HugeiconsIcon icon={PlusSignIcon} className="size-5" />
                </Button>
              </>
            ) : null}
            <div
              className={`relative min-w-0 ${stacked ? "order-1 basis-full" : "order-2 flex-1"} lg:order-1 lg:basis-full`}
            >
              <textarea
                ref={inputRef}
                aria-label={label}
                rows={1}
                className="block w-full resize-none bg-transparent px-3 py-2 text-sm leading-5 outline-none disabled:opacity-60"
                maxLength={8000}
                value={value}
                disabled={disabled || working}
                onChange={(event) => onChange(event.target.value)}
                onKeyDown={(event) => {
                  // Enter is a new line; Ctrl/⌘+Enter sends.
                  if (
                    event.key === "Enter" &&
                    (event.metaKey || event.ctrlKey)
                  ) {
                    event.preventDefault()
                    send()
                  }
                }}
              />
              {value ? null : (
                // One line only; the field's own placeholder would wrap.
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-3 top-2 truncate text-sm leading-5 text-muted-foreground"
                >
                  {placeholder}
                </span>
              )}
            </div>
            <span
              aria-hidden
              className={`${stacked ? "order-3 flex-1" : "hidden"} lg:order-3 lg:block lg:flex-1`}
            />
            <div className="order-4 flex items-center gap-1">
              {voice ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className={round}
                  aria-label="Record a voice note"
                  title="Record a voice note"
                  disabled={disabled || busy || working}
                  onClick={voice.start}
                >
                  <HugeiconsIcon icon={Mic01Icon} className="size-5" />
                </Button>
              ) : null}
              {busy ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className={round}
                  aria-label="Stop"
                  onClick={onStop}
                >
                  <HugeiconsIcon icon={StopIcon} className="size-4" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  className={`${round} disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100`}
                  aria-label="Send"
                  title="Send (Ctrl+Enter)"
                  disabled={!canSend}
                >
                  <HugeiconsIcon icon={ArrowUp02Icon} className="size-4" />
                </Button>
              )}
            </div>
          </div>
        )}
      </form>
      {value.length > 8000 ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          Shorten the message to 8,000 characters before sending.
        </p>
      ) : voice?.hint ? (
        <p className="mt-1.5 px-4 text-[11px] text-muted-foreground">
          Check the voice note text and fix anything it misheard before sending.
        </p>
      ) : footer ? (
        <div className="mt-1.5 px-4 text-[11px] text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </div>
  )
}
