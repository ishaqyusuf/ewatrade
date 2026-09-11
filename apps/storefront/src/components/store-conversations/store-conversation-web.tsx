"use client"

import {
  projectStoreConversationWhatsAppAction,
  storeConversationWhatsAppObservedStatusLabel,
} from "@ewatrade/service-commerce"
import { useEffect, useState } from "react"
import { OpenInAppButton } from "./open-in-app-button"
import { StoreConversationAccountInvitation } from "./store-conversation-account-invitation"
import { StoreConversationAccountSecurity } from "./store-conversation-account-security"
import { StoreConversationAttachment } from "./store-conversation-attachment"
import {
  StoreConversationAttachmentTray,
  StoreConversationRestoredAttachmentAvatar,
} from "./store-conversation-attachment-draft"
import { StoreConversationNotificationControls } from "./store-conversation-notification-controls"
import { StoreConversationQuoteMessage } from "./store-conversation-quote-message"
import {
  StoreConversationRequestChoice,
  StoreConversationRequestRail,
} from "./store-conversation-request-ui"
import { useStoreConversation } from "./use-store-conversation"
import {
  formatStoreConversationVoiceElapsed,
  useStoreConversationVoiceNote,
} from "./use-store-conversation-voice-note"

const VOICE_WAVE_BAR_IDS = Array.from(
  { length: 28 },
  (_, index) => `voice-level-${index}`,
)

export function StoreConversationWeb({
  publicToken,
  storeName,
}: {
  publicToken: string
  storeName: string
}) {
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false)
  const {
    attachmentCapability,
    attachmentCapabilityError,
    attachmentDraft,
    attachmentTargets,
    bootstrap,
    changeDraft,
    draft,
    loadingOlder,
    loadOlder,
    loadTimeline,
    openWhatsAppBridge,
    openingWhatsApp,
    refreshNotice,
    removeRestoredAttachment,
    prescriptionConsentAccepted,
    selectRequest,
    selectAttachmentTarget,
    selectedAttachmentTarget,
    restoredAttachmentKind,
    selectingMessageId,
    sendError,
    sending,
    sendMessage,
    setSoundAlerts,
    setStartingNewRequest,
    setPrescriptionConsentAccepted,
    startingNewRequest,
    state,
    soundAlertsEnabled,
    textareaRef,
  } = useStoreConversation(publicToken)
  const voiceCanRecord = Boolean(
    state.kind === "ready" &&
      state.conversation.state === "active" &&
      state.channelMode.composerEnabled &&
      selectedAttachmentTarget &&
      selectedAttachmentTarget.kind !== "new_prescription_request" &&
      attachmentCapability?.available &&
      attachmentCapability.allowedKinds.includes("audio") &&
      !attachmentDraft.draft,
  )
  const voice = useStoreConversationVoiceNote({
    acceptedMimeTypes: attachmentCapability?.acceptedMimeTypes ?? [],
    enabled: voiceCanRecord,
    maxDurationMs: attachmentCapability?.limits.maxDurationMs ?? 60_000,
    onReady: (file) => {
      attachmentDraft.acceptRecordedVoice(file)
      setAttachmentMenuOpen(false)
    },
    scopeKey: `${publicToken}:${state.kind === "ready" ? state.conversation.id : "unresolved"}`,
  })
  const voiceLevels = voice.state.kind === "recording" ? voice.state.levels : []

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              aria-label="Go back"
              className="grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => window.history.back()}
              type="button"
            >
              <svg
                aria-hidden="true"
                className="size-5"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  d="m15 18-6-6 6-6"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                />
              </svg>
            </button>
            <h1 className="truncate text-lg font-semibold">{storeName}</h1>
          </div>
          {state.kind === "ready" ? (
            <div className="flex items-center justify-end gap-2">
              <StoreConversationAccountSecurity
                conversationId={state.conversation.id}
                publicToken={publicToken}
              />
              <div className="hidden flex-wrap justify-end gap-2 sm:flex">
                <button
                  aria-pressed={soundAlertsEnabled}
                  className="min-h-11 rounded-full border border-border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => void setSoundAlerts(!soundAlertsEnabled)}
                  type="button"
                >
                  {soundAlertsEnabled ? "Sound on" : "Sound off"}
                </button>
                <button
                  className="min-h-11 rounded-full border border-border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => void loadTimeline(state.conversation)}
                  type="button"
                >
                  Refresh
                </button>
                <OpenInAppButton
                  conversationId={state.conversation.id}
                  publicToken={publicToken}
                />
              </div>
            </div>
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
                {state.code === "GUEST_CREDENTIAL_EXPIRED"
                  ? "This browser's guest access ended and cannot be recovered by phone or email. Sign in for conversations already linked to your account, or scan the Store QR code to start a new request."
                  : state.message}
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

          {state.kind === "ready" ? (
            <StoreConversationNotificationControls
              accountAccess={state.access === "account"}
              available={state.channelMode.composerEnabled}
              conversationId={state.conversation.id}
              publicToken={publicToken}
            />
          ) : null}

          {state.kind === "ready"
            ? state.messages.map((message) => (
                <div className="grid gap-2" key={message.id}>
                  {message.accountInvitation ? (
                    <StoreConversationAccountInvitation
                      conversationId={state.conversation.id}
                      invitation={message.accountInvitation}
                      messageId={message.id}
                      onRefresh={() => loadTimeline(state.conversation)}
                      publicToken={publicToken}
                    />
                  ) : message.actionMessage ? (
                    <StoreConversationQuoteMessage
                      accountAccess={state.access === "account"}
                      actionMessage={message.actionMessage}
                      conversationId={state.conversation.id}
                      messageId={message.id}
                      onContactStore={() => textareaRef.current?.focus()}
                      onRefresh={() => loadTimeline(state.conversation)}
                      publicToken={publicToken}
                    />
                  ) : (
                    <article
                      className={`grid max-w-[85%] gap-1 text-sm leading-6 ${
                        message.attachments.length > 0
                          ? message.author.kind === "customer"
                            ? "ml-auto"
                            : "mr-auto"
                          : message.author.kind === "customer"
                            ? "ml-auto bg-primary text-primary-foreground"
                            : "mr-auto border border-border bg-card"
                      } ${message.attachments.length > 0 ? "p-0" : "rounded-2xl px-4 py-3"}`}
                    >
                      {message.attachments.length === 0 && message.request ? (
                        <p className="text-[11px] font-semibold uppercase tracking-wide opacity-75">
                          {message.request.kind.replaceAll("_", " ")}
                        </p>
                      ) : null}
                      {message.attachments.map((attachment) => (
                        <StoreConversationAttachment
                          attachment={attachment}
                          conversationId={state.conversation.id}
                          customer={message.author.kind === "customer"}
                          key={attachment.id}
                          onRecover={
                            attachment.recovery
                              ? () => {
                                  if (attachment.recovery === "contact_store") {
                                    textareaRef.current?.focus()
                                    return
                                  }
                                  const target = attachmentTargets.find(
                                    (candidate) =>
                                      candidate.target.kind ===
                                        "existing_request" &&
                                      candidate.target.request.id ===
                                        message.request?.id &&
                                      candidate.target.request.kind ===
                                        message.request?.kind,
                                  )
                                  if (target) selectAttachmentTarget(target.key)
                                  setAttachmentMenuOpen(Boolean(target))
                                }
                              : undefined
                          }
                          publicToken={publicToken}
                        />
                      ))}
                      {message.attachments.length === 0 ? (
                        <>
                          <p>{message.text}</p>
                          <p
                            className={`text-[11px] ${message.author.kind === "customer" ? "text-primary-foreground/75" : "text-muted-foreground"}`}
                          >
                            {message.author.label} · {message.channel}
                            {message.whatsAppObservation
                              ? ` · ${storeConversationWhatsAppObservedStatusLabel(
                                  message.whatsAppObservation.status,
                                )}`
                              : ""}
                          </p>
                        </>
                      ) : null}
                    </article>
                  )}
                  {state.access === "guest" &&
                  message.author.kind === "customer" &&
                  !message.request ? (
                    <StoreConversationRequestChoice
                      conversationId={state.conversation.id}
                      disabled={
                        selectingMessageId === message.id ||
                        !state.channelMode.composerEnabled
                      }
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
            {state.conversation.moderation.state === "restricted" ? (
              <aside
                aria-live="polite"
                className="mx-auto mb-3 grid max-w-3xl gap-1 rounded-2xl border border-border bg-card px-4 py-3"
              >
                <p className="font-semibold">New messages are paused</p>
                <p className="text-sm leading-6 text-muted-foreground">
                  {state.conversation.moderation.customerMessage}
                </p>
              </aside>
            ) : null}
            {!state.channelMode.composerEnabled ? (
              <aside
                aria-live="polite"
                className="mx-auto mb-3 grid max-w-3xl gap-1 rounded-2xl border border-border bg-card px-4 py-3"
              >
                <p className="font-semibold">
                  {state.channelMode.effectiveMode === "whatsapp"
                    ? "Continue this conversation on WhatsApp"
                    : "Chat is currently unavailable"}
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  {state.channelMode.effectiveMode === "whatsapp"
                    ? "Your EwaTrade conversation history stays here, while new messages use the Store's current verified WhatsApp route."
                    : (state.availability.customerMessage ??
                      "The Store is not accepting new chat messages right now.")}
                </p>
                {state.availability.reopensAt ? (
                  <p className="text-sm leading-6 text-muted-foreground">
                    Chat is expected to reopen{" "}
                    <time dateTime={String(state.availability.reopensAt)}>
                      {new Date(state.availability.reopensAt).toLocaleString()}
                    </time>
                    .
                  </p>
                ) : null}
                <p className="text-sm leading-6 text-muted-foreground">
                  Your conversation history remains available.
                </p>
                {state.channelMode.whatsappAction ? (
                  <WhatsAppConversationAction
                    action={state.channelMode.whatsappAction}
                    onOpen={() => void openWhatsAppBridge()}
                    opening={openingWhatsApp}
                  />
                ) : null}
              </aside>
            ) : null}
            {state.channelMode.composerEnabled &&
            state.channelMode.whatsappAction ? (
              <div className="mx-auto mb-3 flex max-w-3xl justify-end">
                <WhatsAppConversationAction
                  action={state.channelMode.whatsappAction}
                  onOpen={() => void openWhatsAppBridge()}
                  opening={openingWhatsApp}
                />
              </div>
            ) : null}
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
            {attachmentDraft.notice || attachmentCapabilityError ? (
              <p
                className="mx-auto mb-2 max-w-3xl text-sm text-destructive"
                role="alert"
              >
                {attachmentDraft.notice ?? attachmentCapabilityError}
              </p>
            ) : null}
            {voice.state.kind === "unsupported" ? (
              <div className="mx-auto mb-2 flex min-h-11 max-w-3xl items-center justify-between gap-3 rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <p role="alert">{voice.state.message}</p>
                <button
                  aria-label="Dismiss voice note error"
                  className="grid size-11 shrink-0 place-items-center rounded-full"
                  onClick={voice.dismiss}
                  type="button"
                >
                  ×
                </button>
              </div>
            ) : null}
            {state.channelMode.composerEnabled &&
            attachmentTargets.length > 1 &&
            !attachmentDraft.draft ? (
              <fieldset className="mx-auto mb-2 grid max-w-3xl gap-2">
                <legend className="text-xs font-semibold text-muted-foreground">
                  Choose a Request to attach media
                </legend>
                <div className="flex flex-wrap gap-2">
                  {attachmentTargets.map((target) => (
                    <button
                      aria-pressed={
                        JSON.stringify(selectedAttachmentTarget) === target.key
                      }
                      className={`min-h-11 rounded-full px-4 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        JSON.stringify(selectedAttachmentTarget) === target.key
                          ? "bg-primary text-primary-foreground"
                          : "border border-border"
                      }`}
                      key={target.key}
                      onClick={() => selectAttachmentTarget(target.key)}
                      type="button"
                    >
                      {target.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {state.channelMode.composerEnabled &&
            selectedAttachmentTarget?.kind === "new_prescription_request" &&
            !attachmentDraft.draft ? (
              <label className="mx-auto mb-2 flex min-h-11 max-w-3xl cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3 text-xs leading-5">
                <input
                  checked={prescriptionConsentAccepted}
                  className="mt-1 size-4 accent-primary"
                  onChange={(event) =>
                    setPrescriptionConsentAccepted(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>
                  I consent to this prescription image or PDF being privately
                  processed by this Store for my prescription Request.
                </span>
              </label>
            ) : null}
            {state.channelMode.composerEnabled &&
            attachmentMenuOpen &&
            !attachmentDraft.draft ? (
              <div className="mx-auto mb-2 grid max-w-3xl gap-3 rounded-2xl border border-border bg-card p-3">
                {selectedAttachmentTarget && attachmentCapability?.available ? (
                  <button
                    className="min-h-11 justify-self-start rounded-full border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={attachmentDraft.chooseFile}
                    type="button"
                  >
                    Choose {attachmentCapability.allowedKinds.join(" or ")}
                  </button>
                ) : null}
                {selectedAttachmentTarget &&
                attachmentCapability &&
                !attachmentCapability.available ? (
                  <p className="text-xs text-muted-foreground">
                    Private attachments are unavailable for this Request.
                  </p>
                ) : null}
              </div>
            ) : null}
            {state.channelMode.composerEnabled &&
            state.access === "guest" &&
            state.requests.some((request) => request.lifecycle === "active") ? (
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
            {attachmentDraft.draft ? (
              <div
                className="mx-auto mb-2 flex max-w-3xl flex-row flex-wrap gap-2 px-1"
                id="attachments"
              >
                <StoreConversationAttachmentTray
                  draft={attachmentDraft.draft}
                  onCancel={attachmentDraft.cancel}
                  onRemove={attachmentDraft.remove}
                  onRetry={attachmentDraft.retry}
                  requestLabel={
                    attachmentTargets.find(
                      (target) =>
                        target.key === JSON.stringify(selectedAttachmentTarget),
                    )?.label ?? "selected Request"
                  }
                />
              </div>
            ) : null}
            {!attachmentDraft.draft && restoredAttachmentKind ? (
              <div
                className="mx-auto mb-2 flex max-w-3xl flex-row flex-wrap gap-2 px-1"
                id="restored-attachments"
              >
                <StoreConversationRestoredAttachmentAvatar
                  kind={restoredAttachmentKind}
                  onRemove={removeRestoredAttachment}
                />
              </div>
            ) : null}
            {voice.state.kind === "recording" ? (
              <div className="mx-auto flex min-h-16 max-w-3xl items-center gap-2 rounded-full border border-border bg-card p-2 shadow-sm">
                <output className="sr-only">
                  Recording voice note,{" "}
                  {formatStoreConversationVoiceElapsed(voice.state.elapsedMs)}
                </output>
                <button
                  aria-label="Cancel voice note"
                  className="grid size-11 shrink-0 place-items-center rounded-full text-2xl text-muted-foreground"
                  onClick={voice.cancel}
                  type="button"
                >
                  ×
                </button>
                <div
                  aria-hidden="true"
                  className="flex h-9 min-w-0 flex-1 items-center justify-center gap-1 overflow-hidden"
                >
                  {VOICE_WAVE_BAR_IDS.map((id, index) => (
                    <span
                      className="w-1 shrink-0 rounded-full bg-muted-foreground/70"
                      key={id}
                      style={{
                        height: `${6 + (voiceLevels[index] ?? 0) * 28}px`,
                      }}
                    />
                  ))}
                </div>
                <button
                  aria-label="Stop recording and preview"
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
                  onClick={voice.stop}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="size-3 rounded-sm bg-current"
                  />
                </button>
                <button
                  aria-label="Use this voice note"
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
                  onClick={voice.stop}
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    className="size-5"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M12 19V5m0 0-6 6m6-6 6 6"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                </button>
              </div>
            ) : (
              <div
                className="mx-auto flex min-h-16 max-w-3xl items-end gap-1 rounded-full border border-border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring"
                id="chatContainer"
              >
                <input
                  accept={attachmentDraft.policy.acceptedMimeTypes.join(",")}
                  aria-hidden="true"
                  className="sr-only"
                  onChange={(event) => {
                    attachmentDraft.acceptFile(event.target.files?.[0])
                    setAttachmentMenuOpen(false)
                  }}
                  ref={attachmentDraft.fileInputRef}
                  tabIndex={-1}
                  type="file"
                />
                <button
                  aria-expanded={attachmentMenuOpen}
                  aria-label={
                    state.conversation.state !== "active" ||
                    !state.channelMode.composerEnabled ||
                    attachmentTargets.length === 0 ||
                    !selectedAttachmentTarget ||
                    (selectedAttachmentTarget.kind ===
                      "new_prescription_request" &&
                      !prescriptionConsentAccepted)
                      ? "Private attachments unavailable"
                      : "Add a private attachment"
                  }
                  className="grid size-11 shrink-0 place-items-center rounded-full text-xl text-muted-foreground"
                  disabled={
                    state.conversation.state !== "active" ||
                    !state.channelMode.composerEnabled ||
                    sending ||
                    Boolean(attachmentDraft.draft) ||
                    attachmentTargets.length === 0 ||
                    !selectedAttachmentTarget ||
                    (selectedAttachmentTarget.kind ===
                      "new_prescription_request" &&
                      !prescriptionConsentAccepted)
                  }
                  onClick={() => setAttachmentMenuOpen((current) => !current)}
                  type="button"
                >
                  +
                </button>
                <textarea
                  aria-label="Message the Store"
                  className="max-h-32 min-h-11 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-2.5 text-base outline-none placeholder:text-muted-foreground"
                  disabled={
                    sending ||
                    state.conversation.state !== "active" ||
                    !state.channelMode.composerEnabled
                  }
                  maxLength={2_000}
                  onChange={(event) => {
                    const element = event.currentTarget
                    element.style.height = "auto"
                    element.style.height = `${Math.min(element.scrollHeight, 128)}px`
                    changeDraft(element.value)
                  }}
                  placeholder={
                    state.conversation.state !== "active" ||
                    !state.channelMode.composerEnabled
                      ? "Messaging is unavailable"
                      : "Message the Store"
                  }
                  ref={textareaRef}
                  rows={1}
                  value={draft}
                />
                <button
                  aria-label={
                    draft.trim() || attachmentDraft.draft?.status === "selected"
                      ? sending
                        ? "Sending message"
                        : "Send message"
                      : "Record a voice note"
                  }
                  className={`grid size-11 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${draft.trim() || attachmentDraft.draft?.status === "selected" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                  disabled={
                    sending ||
                    attachmentDraft.draft?.status === "uploading" ||
                    (!draft.trim() &&
                      attachmentDraft.draft?.status !== "selected" &&
                      !voiceCanRecord) ||
                    state.conversation.state !== "active" ||
                    !state.channelMode.composerEnabled
                  }
                  onClick={
                    !draft.trim() &&
                    attachmentDraft.draft?.status !== "selected"
                      ? () => void voice.start()
                      : undefined
                  }
                  type={
                    draft.trim() || attachmentDraft.draft?.status === "selected"
                      ? "submit"
                      : "button"
                  }
                >
                  {draft.trim() ||
                  attachmentDraft.draft?.status === "selected" ? (
                    <svg
                      aria-hidden="true"
                      className="size-5"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="m4 4 17 8-17 8 4-8zM8 12h13"
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
                      <rect
                        height="12"
                        rx="4"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        width="8"
                        x="8"
                        y="3"
                      />
                      <path
                        d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeWidth="1.8"
                      />
                    </svg>
                  )}
                </button>
              </div>
            )}
          </form>
        ) : null}
      </section>
    </main>
  )
}

export function WhatsAppConversationAction({
  action,
  onOpen,
  opening,
}: {
  action: "continue_on_whatsapp" | "reach_store_faster_on_whatsapp"
  onOpen: () => void
  opening: boolean
}) {
  const presentation = projectStoreConversationWhatsAppAction({
    action,
    opening,
  })
  return (
    <button
      className={`inline-flex min-h-11 w-fit items-center justify-center rounded-full px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${presentation.primary ? "bg-primary text-primary-foreground" : "border border-border bg-background"}`}
      disabled={opening}
      onClick={onOpen}
      type="button"
    >
      {presentation.label}
    </button>
  )
}
