"use client"
import { useTRPC } from "@/trpc/client"
import {
  Button,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@ewatrade/ui"
import {
  ArrowUp02Icon,
  Mic01Icon,
  StopIcon,
  Tick02Icon,
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
  stop: () => void
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
      staleTime: 5 * 60_000,
    }),
  )
  const [hint, setHint] = useState(false)
  const valueRef = useRef(props.value)
  valueRef.current = props.value
  const onChangeRef = useRef(props.onChange)
  onChangeRef.current = props.onChange
  const attachments = useSetupAttachments({
    conversationId,
    // The person checks and fixes the transcript before sending it as text.
    onTranscript: (text) => {
      const current = valueRef.current
      onChangeRef.current(
        current.trim() ? `${current.trimEnd()}\n${text}` : text,
      )
      setHint(true)
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
      void recorder.start()
    },
    stop: recorder.stop,
    cancel: recorder.cancel,
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
}: ComposerProps & { voice: Voice | null }) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  useLayoutEffect(() => {
    const textarea = inputRef.current
    if (!textarea) return
    textarea.style.height = ""
    if (!value) return
    const style = getComputedStyle(textarea)
    const lines = window.matchMedia("(min-width: 768px)").matches ? 5 : 3
    const maxHeight =
      Number.parseFloat(style.lineHeight) * lines +
      Number.parseFloat(style.paddingTop) +
      Number.parseFloat(style.paddingBottom)
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
  }, [value])
  const working = voice?.working === true
  const canSend =
    !busy &&
    !blocked &&
    !disabled &&
    !working &&
    value.trim().length > 0 &&
    value.length <= 8000
  const send = () => {
    if (canSend) onSend()
  }

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
      {voice?.recording ? (
        <output
          aria-live="polite"
          className="flex min-h-11 items-center gap-3 rounded-3xl border border-destructive/30 bg-background py-1.5 pr-1.5 pl-4"
        >
          <span className="size-2 shrink-0 motion-safe:animate-pulse rounded-full bg-destructive" />
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
            size="sm"
            variant="ghost"
            onClick={voice.cancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="icon"
            className="size-8 rounded-full"
            aria-label="Finish recording"
            onClick={voice.stop}
          >
            <HugeiconsIcon icon={Tick02Icon} className="size-4" />
          </Button>
        </output>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            send()
          }}
        >
          <InputGroup className="rounded-3xl border-border bg-background has-[textarea]:rounded-3xl">
            <InputGroupTextarea
              ref={inputRef}
              aria-label={label}
              placeholder={placeholder}
              rows={1}
              className="min-h-0 py-2.5 pl-4"
              maxLength={8000}
              value={value}
              disabled={disabled || working}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                // Enter is a new line; Ctrl/⌘+Enter sends.
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  send()
                }
              }}
            />
            <InputGroupAddon
              align="inline-end"
              className="self-end pr-1.5 pb-1.5"
            >
              {voice ? (
                <InputGroupButton
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="size-8 rounded-full text-muted-foreground"
                  aria-label="Record a voice note"
                  title="Record a voice note"
                  disabled={busy || disabled || working}
                  onClick={voice.start}
                >
                  <HugeiconsIcon icon={Mic01Icon} className="size-4" />
                </InputGroupButton>
              ) : null}
              {busy ? (
                <InputGroupButton
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  className="size-8 rounded-full"
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
                  className="size-8 rounded-full disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                  aria-label="Send"
                  title="Send (Ctrl+Enter)"
                  disabled={!canSend}
                >
                  <HugeiconsIcon icon={ArrowUp02Icon} className="size-4" />
                </InputGroupButton>
              )}
            </InputGroupAddon>
          </InputGroup>
        </form>
      )}
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
