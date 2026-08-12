"use client"

import type { StoreConversationTimelineProjection } from "@ewatrade/service-commerce"
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react"

import {
  prependOlderStoreConversationMessages,
  resolveStoreConversationOperationId,
} from "./store-conversation-client-state"

type Conversation = StoreConversationTimelineProjection["conversation"]
type Message = StoreConversationTimelineProjection["messages"][number]

type LoadState =
  | { kind: "loading" }
  | { code?: string; kind: "error"; message: string }
  | {
      conversation: Conversation
      kind: "ready"
      messages: Message[]
      nextCursor: number | null
    }

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { message?: string }
  if (!response.ok) {
    throw Object.assign(new Error(body.message ?? "Request failed."), {
      code: (body as { code?: string }).code,
    })
  }
  return body
}

export function StoreConversationWeb({
  publicToken,
  storeName,
}: {
  publicToken: string
  storeName: string
}) {
  const [state, setState] = useState<LoadState>({ kind: "loading" })
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const operationIdRef = useRef<string | null>(null)

  const loadTimeline = useCallback(async (conversation: Conversation) => {
    const params = new URLSearchParams({ conversationId: conversation.id })
    const timeline = await parseResponse<StoreConversationTimelineProjection>(
      await fetch(`/api/store-conversations/timeline?${params}`, {
        cache: "no-store",
      }),
    )
    setState({
      conversation: timeline.conversation,
      kind: "ready",
      messages: timeline.messages,
      nextCursor: timeline.nextCursor,
    })
  }, [])

  const loadOlder = useCallback(async () => {
    if (state.kind !== "ready" || state.nextCursor === null || loadingOlder) {
      return
    }
    setLoadingOlder(true)
    try {
      const params = new URLSearchParams({
        beforeSequence: String(state.nextCursor),
        conversationId: state.conversation.id,
      })
      const timeline = await parseResponse<StoreConversationTimelineProjection>(
        await fetch(`/api/store-conversations/timeline?${params}`, {
          cache: "no-store",
        }),
      )
      setState({
        conversation: timeline.conversation,
        kind: "ready",
        messages: prependOlderStoreConversationMessages(
          state.messages,
          timeline.messages,
        ),
        nextCursor: timeline.nextCursor,
      })
    } catch (error) {
      setSendError(
        error instanceof Error
          ? error.message
          : "Older messages could not be loaded.",
      )
    } finally {
      setLoadingOlder(false)
    }
  }, [loadingOlder, state])

  const bootstrap = useCallback(
    async (resetGuest = false) => {
      setState({ kind: "loading" })
      try {
        const result = await parseResponse<{ conversation: Conversation }>(
          await fetch("/api/store-conversations/bootstrap", {
            body: JSON.stringify({ publicToken, resetGuest }),
            headers: { "content-type": "application/json" },
            method: "POST",
          }),
        )
        await loadTimeline(result.conversation)
      } catch (error) {
        setState({
          code:
            error instanceof Error && "code" in error
              ? String(error.code)
              : undefined,
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "The conversation is unavailable.",
        })
      }
    },
    [loadTimeline, publicToken],
  )

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (state.kind !== "ready" || sending || !draft.trim()) return
    setSending(true)
    setSendError(null)
    setRefreshNotice(null)
    operationIdRef.current = resolveStoreConversationOperationId(
      operationIdRef.current,
      () => crypto.randomUUID(),
    )
    try {
      const accepted = await parseResponse<{ message: Message }>(
        await fetch("/api/store-conversations/messages", {
          body: JSON.stringify({
            clientOperationId: operationIdRef.current,
            conversationId: state.conversation.id,
            publicToken,
            text: draft,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      )
      operationIdRef.current = null
      setDraft("")
      setState((current) =>
        current.kind === "ready" &&
        !current.messages.some((message) => message.id === accepted.message.id)
          ? {
              ...current,
              messages: [...current.messages, accepted.message],
            }
          : current,
      )
      try {
        await loadTimeline(state.conversation)
      } catch {
        setRefreshNotice(
          "Your message was sent. Refresh when you are ready to check for a reply.",
        )
      }
      textareaRef.current?.focus()
    } catch (error) {
      setSendError(
        error instanceof Error
          ? error.message
          : "Your message could not be sent.",
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate font-semibold">{storeName}</p>
            <p className="text-xs text-muted-foreground">
              Secure conversation on EwaTrade
            </p>
          </div>
          {state.kind === "ready" ? (
            <button
              className="min-h-11 rounded-full border border-border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => void loadTimeline(state.conversation)}
              type="button"
            >
              Refresh
            </button>
          ) : null}
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100dvh-69px)] max-w-3xl grid-rows-[1fr_auto]">
        <div
          aria-busy={state.kind === "loading"}
          aria-live="polite"
          className="grid content-end gap-4 px-4 py-8 sm:px-6"
        >
          {state.kind === "loading" ? (
            <div className="mx-auto grid max-w-sm justify-items-center gap-3 py-20 text-center">
              <span className="size-8 animate-pulse rounded-full bg-primary/20" />
              <p className="font-medium">Opening your Store conversation…</p>
              <p className="text-sm text-muted-foreground">
                Your device session stays private to this browser.
              </p>
            </div>
          ) : null}

          {state.kind === "error" ? (
            <div className="mx-auto grid max-w-sm gap-3 rounded-2xl border border-border bg-card p-6 text-center">
              <h1 className="font-semibold">Conversation unavailable</h1>
              <p className="text-sm leading-6 text-muted-foreground">
                {state.message}
              </p>
              <button
                className="mx-auto min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() =>
                  void bootstrap(state.code === "GUEST_CREDENTIAL_EXPIRED")
                }
                type="button"
              >
                {state.code === "GUEST_CREDENTIAL_EXPIRED"
                  ? "Start a new conversation"
                  : "Try again"}
              </button>
            </div>
          ) : null}

          {state.kind === "ready" && state.messages.length === 0 ? (
            <div className="mx-auto max-w-md py-16 text-center">
              <p className="text-sm font-medium text-primary">
                New conversation
              </p>
              <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight">
                What product can the Store help you find?
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Send a description. A Store attendant will review it and reply
                here. No signup is required.
              </p>
            </div>
          ) : null}

          {state.kind === "ready" && state.nextCursor !== null ? (
            <button
              className="mx-auto min-h-11 rounded-full border border-border px-5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={loadingOlder}
              onClick={() => void loadOlder()}
              type="button"
            >
              {loadingOlder ? "Loading…" : "Load older messages"}
            </button>
          ) : null}

          {state.kind === "ready"
            ? state.messages.map((message) => (
                <article
                  className={`grid max-w-[85%] gap-1 rounded-2xl px-4 py-3 text-sm leading-6 ${
                    message.author.kind === "customer"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "mr-auto border border-border bg-card"
                  }`}
                  key={message.id}
                >
                  <p>{message.text}</p>
                  <p
                    className={`text-[11px] ${
                      message.author.kind === "customer"
                        ? "text-primary-foreground/75"
                        : "text-muted-foreground"
                    }`}
                  >
                    {message.author.label} · {message.channel}
                  </p>
                </article>
              ))
            : null}
        </div>

        {state.kind === "ready" ? (
          <form
            className="sticky bottom-0 border-t border-border bg-background p-3 sm:p-4"
            onSubmit={sendMessage}
          >
            {sendError ? (
              <p
                className="mx-auto mb-2 max-w-3xl text-sm text-destructive"
                role="alert"
              >
                {sendError} Your draft is still here; try sending it again.
              </p>
            ) : null}
            {refreshNotice ? (
              <output className="mx-auto mb-2 block max-w-3xl text-sm text-muted-foreground">
                {refreshNotice}
              </output>
            ) : null}
            <div className="mx-auto grid grid-cols-[44px_minmax(0,1fr)_auto] items-end gap-2 rounded-[24px] border border-border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring">
              <button
                aria-label="Attachments will be available soon"
                className="grid size-11 place-items-center rounded-full text-xl text-muted-foreground"
                disabled
                type="button"
              >
                +
              </button>
              <textarea
                aria-label="Message the Store"
                className="max-h-32 min-h-11 resize-none bg-transparent px-1 py-2.5 text-base outline-none placeholder:text-muted-foreground"
                disabled={sending || state.conversation.state === "restricted"}
                maxLength={2_000}
                onChange={(event) => {
                  operationIdRef.current = null
                  setDraft(event.target.value)
                }}
                placeholder={
                  state.conversation.state === "restricted"
                    ? "This conversation cannot accept messages"
                    : "Describe the product you need"
                }
                ref={textareaRef}
                rows={1}
                value={draft}
              />
              <button
                className="min-h-11 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={
                  sending ||
                  !draft.trim() ||
                  state.conversation.state === "restricted"
                }
                type="submit"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </form>
        ) : null}
      </section>
    </main>
  )
}
