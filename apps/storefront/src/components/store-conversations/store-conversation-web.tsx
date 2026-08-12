"use client"

import {
  StoreConversationRequestChoice,
  StoreConversationRequestRail,
} from "./store-conversation-request-ui"
import { useStoreConversation } from "./use-store-conversation"

export function StoreConversationWeb({
  publicToken,
  storeName,
}: {
  publicToken: string
  storeName: string
}) {
  const {
    bootstrap,
    changeDraft,
    draft,
    loadingOlder,
    loadOlder,
    loadTimeline,
    refreshNotice,
    selectRequest,
    selectingMessageId,
    sendError,
    sending,
    sendMessage,
    setStartingNewRequest,
    startingNewRequest,
    state,
    textareaRef,
  } = useStoreConversation(publicToken)

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
                What can the Store help you with?
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Send a message, then choose whether it belongs to a product,
                service, prescription, or an ongoing Request. No signup is
                required.
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

          {state.kind === "ready" ? (
            <StoreConversationRequestRail requests={state.requests} />
          ) : null}

          {state.kind === "ready"
            ? state.messages.map((message) => (
                <div className="grid gap-2" key={message.id}>
                  <article
                    className={`grid max-w-[85%] gap-1 rounded-2xl px-4 py-3 text-sm leading-6 ${
                      message.author.kind === "customer"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "mr-auto border border-border bg-card"
                    }`}
                  >
                    {message.request ? (
                      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-75">
                        {message.request.kind.replaceAll("_", " ")}
                      </p>
                    ) : null}
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
                  {message.author.kind === "customer" && !message.request ? (
                    <StoreConversationRequestChoice
                      conversationId={state.conversation.id}
                      disabled={selectingMessageId === message.id}
                      messageId={message.id}
                      onSelect={(target) =>
                        void selectRequest(message.id, target)
                      }
                      publicToken={publicToken}
                      requestKinds={state.availableRequestKinds}
                      requests={state.requests.filter(
                        (request) => request.lifecycle === "active",
                      )}
                    />
                  ) : null}
                </div>
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
            {state.requests.some(
              (request) => request.lifecycle === "active",
            ) ? (
              <div className="mx-auto mb-2 flex max-w-3xl items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  {startingNewRequest
                    ? "Your next message will ask you to choose a new Request type."
                    : "Messages continue the current Request when only one is active."}
                </p>
                <button
                  className="min-h-9 shrink-0 rounded-full border border-border px-3 text-xs font-semibold"
                  onClick={() => setStartingNewRequest(!startingNewRequest)}
                  type="button"
                >
                  {startingNewRequest
                    ? "Continue current"
                    : "Start new Request"}
                </button>
              </div>
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
                  changeDraft(event.target.value)
                }}
                placeholder={
                  state.conversation.state === "restricted"
                    ? "This conversation cannot accept messages"
                    : "Message the Store"
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
