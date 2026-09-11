"use client"

import {
  type StoreConversationAttachmentCapabilityProjection,
  type StoreConversationAttachmentTarget,
  type StoreConversationGuestMessagesAfterProjection,
  type StoreConversationSelectRequestInput,
  type StoreConversationTimelineProjection,
  type StoreConversationWhatsAppBridgeClientOperation,
  type StoreConversationWhatsAppBridgeIssueProjection,
  executeStoreConversationWhatsAppBridgeNavigation,
  resolveStoreConversationWhatsAppBridgeClientOperation,
} from "@ewatrade/service-commerce"
import {
  canSelectStoreConversationAttachment,
  createStoreConversationLocalDraft,
  drainMountedStoreConversationActionRecovery,
  latestStoreConversationSequence,
  mergeStoreConversationActionMessageUpdates,
  mergeStoreConversationSequence,
  parseStoreConversationLocalDraft,
  resolveStoreConversationAttachmentTargets,
  storeConversationAttachmentTargetKey,
  storeConversationLocalDraftKey,
} from "@ewatrade/utils"
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import { useStoreConversationAttachmentDraft } from "./store-conversation-attachment-draft"
import {
  type StoreConversationKeyedOperation,
  prependOlderStoreConversationMessages,
  resolveStoreConversationKeyedOperation,
  resolveStoreConversationOperationId,
  storeConversationRequestSelectionKey,
} from "./store-conversation-client-state"
import { useStoreConversationAlerts } from "./use-store-conversation-alerts"

type Conversation = StoreConversationTimelineProjection["conversation"]
type Message = StoreConversationTimelineProjection["messages"][number]
type ConversationAccess = "account" | "guest"

export type StoreConversationLoadState =
  | { kind: "loading" }
  | { code?: string; kind: "error"; message: string }
  | (StoreConversationTimelineProjection & {
      access: ConversationAccess
      kind: "ready"
    })

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { message?: string }
  if (!response.ok) {
    throw Object.assign(new Error(body.message ?? "Request failed."), {
      code: (body as { code?: string }).code,
    })
  }
  return body
}

function uploadAttachmentForm(input: {
  form: FormData
  onProgress: (progress: number) => void
  signal: AbortSignal
  uploadAuthorization: string
}) {
  return new Promise<{ message: Message }>((resolve, reject) => {
    const request = new XMLHttpRequest()
    const abort = () => request.abort()
    input.signal.addEventListener("abort", abort, { once: true })
    request.open("POST", "/api/store-conversations/attachments")
    request.setRequestHeader(
      "x-store-conversation-attachment-authorization",
      input.uploadAuthorization,
    )
    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total <= 0) return
      input.onProgress((event.loaded / event.total) * 100)
    })
    request.addEventListener("load", () => {
      input.signal.removeEventListener("abort", abort)
      try {
        const body = JSON.parse(request.responseText) as {
          message?: Message | string
        }
        if (request.status < 200 || request.status >= 300) {
          reject(
            new Error(
              typeof body.message === "string"
                ? body.message
                : "Attachment could not be sent.",
            ),
          )
          return
        }
        if (!body.message || typeof body.message === "string") {
          reject(new Error("Attachment response was incomplete."))
          return
        }
        resolve({ message: body.message })
      } catch {
        reject(new Error("Attachment response was unavailable."))
      }
    })
    request.addEventListener("error", () => {
      input.signal.removeEventListener("abort", abort)
      reject(new Error("Upload interrupted. Try again."))
    })
    request.addEventListener("abort", () => {
      input.signal.removeEventListener("abort", abort)
      reject(new DOMException("Upload cancelled.", "AbortError"))
    })
    request.send(input.form)
  })
}

export function useStoreConversation(publicToken: string) {
  const [state, setState] = useState<StoreConversationLoadState>({
    kind: "loading",
  })
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [openingWhatsApp, setOpeningWhatsApp] = useState(false)
  const [startingNewRequest, setStartingNewRequestState] = useState(false)
  const [selectingMessageId, setSelectingMessageId] = useState<string | null>(
    null,
  )
  const [selectedAttachmentTarget, setSelectedAttachmentTarget] =
    useState<StoreConversationAttachmentTarget | null>(null)
  const [attachmentCapability, setAttachmentCapability] =
    useState<StoreConversationAttachmentCapabilityProjection | null>(null)
  const [attachmentCapabilityError, setAttachmentCapabilityError] = useState<
    string | null
  >(null)
  const [prescriptionConsentAccepted, setPrescriptionConsentAccepted] =
    useState(false)
  const [restoredAttachmentKind, setRestoredAttachmentKind] = useState<
    "audio" | "document" | "image" | null
  >(null)
  const [draftHydratedScope, setDraftHydratedScope] = useState<string | null>(
    null,
  )
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const stateRef = useRef(state)
  stateRef.current = state
  const accessRef = useRef<ConversationAccess>("guest")
  const operationIdRef = useRef<string | null>(null)
  const acknowledgedSequenceRef = useRef(0)
  const progressOperationRef = useRef<{
    id: string
    sequence: number
  } | null>(null)
  const selectionOperationRef = useRef<StoreConversationKeyedOperation | null>(
    null,
  )
  const whatsAppBridgeOperationRef =
    useRef<StoreConversationWhatsAppBridgeClientOperation | null>(null)
  const attachmentTargets = useMemo(
    () =>
      state.kind === "ready" && state.access === "guest"
        ? resolveStoreConversationAttachmentTargets(state)
        : [],
    [state],
  )
  const alerts = useStoreConversationAlerts()
  const realtimeConversationId =
    state.kind === "ready" ? state.conversation.id : null
  const realtimeAccess = state.kind === "ready" ? state.access : null

  const loadTimeline = useCallback(
    async (
      conversation: Conversation,
      access: ConversationAccess = accessRef.current,
    ) => {
      accessRef.current = access
      const params = new URLSearchParams({
        access,
        conversationId: conversation.id,
        publicToken,
      })
      const timeline = await parseResponse<StoreConversationTimelineProjection>(
        await fetch(`/api/store-conversations/timeline?${params}`, {
          cache: "no-store",
        }),
      )
      setState({ ...timeline, access, kind: "ready" })
    },
    [publicToken],
  )

  useEffect(() => {
    if (
      selectedAttachmentTarget &&
      attachmentTargets.some(
        (option) =>
          option.key ===
          storeConversationAttachmentTargetKey(selectedAttachmentTarget),
      )
    )
      return
    setSelectedAttachmentTarget(
      attachmentTargets.length === 1
        ? (attachmentTargets[0]?.target ?? null)
        : null,
    )
    setPrescriptionConsentAccepted(false)
  }, [attachmentTargets, selectedAttachmentTarget])

  useEffect(() => {
    if (
      state.kind !== "ready" ||
      state.access === "account" ||
      !selectedAttachmentTarget
    ) {
      setAttachmentCapability(null)
      setAttachmentCapabilityError(null)
      return
    }
    const controller = new AbortController()
    setAttachmentCapability(null)
    setAttachmentCapabilityError(null)
    void fetch("/api/store-conversations/attachments/capability", {
      body: JSON.stringify({
        conversationId: state.conversation.id,
        publicToken,
        target: selectedAttachmentTarget,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
      signal: controller.signal,
    })
      .then((response) =>
        parseResponse<StoreConversationAttachmentCapabilityProjection>(
          response,
        ),
      )
      .then(setAttachmentCapability)
      .catch((error) => {
        if (controller.signal.aborted) return
        setAttachmentCapabilityError(
          error instanceof Error
            ? error.message
            : "Private attachments are unavailable.",
        )
      })
    return () => controller.abort()
  }, [publicToken, selectedAttachmentTarget, state])

  useEffect(() => {
    if (!realtimeConversationId || !realtimeAccess) return
    acknowledgedSequenceRef.current = 0
    progressOperationRef.current = null
    const controller = new AbortController()
    let polling = false
    let queuedPoll = false
    const poll = async () => {
      if (polling) {
        queuedPoll = true
        return
      }
      if (
        controller.signal.aborted ||
        document.visibilityState !== "visible" ||
        !navigator.onLine
      )
        return
      polling = true
      try {
        const current = stateRef.current
        if (
          current.kind !== "ready" ||
          current.conversation.id !== realtimeConversationId
        )
          return
        const afterSequence = latestStoreConversationSequence(current.messages)
        const actionMessageIds = current.messages
          .filter((message) => Boolean(message.actionMessage))
          .map((message) => message.id)
        const actionMessageUpdates: StoreConversationGuestMessagesAfterProjection["actionMessageUpdates"] =
          []
        let availability:
          | StoreConversationGuestMessagesAfterProjection["availability"]
          | null = null
        let channelMode:
          | StoreConversationGuestMessagesAfterProjection["channelMode"]
          | null = null
        let moderation:
          | StoreConversationGuestMessagesAfterProjection["moderation"]
          | null = null
        const update =
          await drainMountedStoreConversationActionRecovery<Message>({
            actionMessageIds,
            afterSequence,
            fetchPage: async (batch, cursor) => {
              const params = new URLSearchParams({
                access: current.access,
                afterSequence: String(cursor),
                conversationId: realtimeConversationId,
                limit: "100",
                publicToken,
              })
              for (const messageId of batch) {
                params.append("actionMessageId", messageId)
              }
              const page =
                await parseResponse<StoreConversationGuestMessagesAfterProjection>(
                  await fetch(
                    `/api/store-conversations/messages/after?${params}`,
                    {
                      cache: "no-store",
                      signal: controller.signal,
                    },
                  ),
                )
              availability = page.availability
              channelMode = page.channelMode
              moderation = page.moderation
              actionMessageUpdates.push(...page.actionMessageUpdates)
              return page
            },
            sequenceOf: (message) => message.sequence,
          })
        const hasStoreResponse = update.messages.some(
          (message) => message.author.kind === "store_attendant",
        )
        if (
          update.messages.length > 0 ||
          actionMessageUpdates.length > 0 ||
          availability ||
          channelMode ||
          moderation
        ) {
          setState((currentState) =>
            currentState.kind === "ready" &&
            currentState.conversation.id === realtimeConversationId
              ? {
                  ...currentState,
                  ...(availability ? { availability } : {}),
                  ...(channelMode ? { channelMode } : {}),
                  ...(moderation
                    ? {
                        conversation: {
                          ...currentState.conversation,
                          moderation,
                          state:
                            moderation.state === "restricted"
                              ? ("restricted" as const)
                              : currentState.conversation.state === "restricted"
                                ? ("active" as const)
                                : currentState.conversation.state,
                        },
                      }
                    : {}),
                  messages: mergeStoreConversationActionMessageUpdates(
                    mergeStoreConversationSequence(
                      currentState.messages,
                      update.messages,
                    ),
                    actionMessageUpdates,
                  ),
                }
              : currentState,
          )
        }
        if (hasStoreResponse) {
          setRefreshNotice("New response from the Store.")
          alerts.alertStoreResponse()
        }
        const latestSequence = Math.max(afterSequence, update.throughSequence)
        if (latestSequence <= acknowledgedSequenceRef.current) return
        const operation =
          progressOperationRef.current?.sequence === latestSequence
            ? progressOperationRef.current
            : { id: crypto.randomUUID(), sequence: latestSequence }
        progressOperationRef.current = operation
        await parseResponse(
          await fetch("/api/store-conversations/progress", {
            body: JSON.stringify({
              clientOperationId: operation.id,
              conversationId: realtimeConversationId,
              deliveredThroughSequence: latestSequence,
              publicToken,
              readThroughSequence: latestSequence,
            }),
            headers: { "content-type": "application/json" },
            method: "POST",
            signal: controller.signal,
          }),
        )
        acknowledgedSequenceRef.current = latestSequence
        progressOperationRef.current = null
      } catch (error) {
        if (controller.signal.aborted) return
        setRefreshNotice(
          error instanceof Error
            ? "Reconnecting. Messages already shown remain available."
            : "Reconnecting to the Store conversation.",
        )
      } finally {
        polling = false
        if (queuedPoll && !controller.signal.aborted) {
          queuedPoll = false
          queueMicrotask(() => void poll())
        }
      }
    }
    const interval = window.setInterval(() => void poll(), 5_000)
    const resume = () => void poll()
    window.addEventListener("focus", resume)
    window.addEventListener("online", resume)
    document.addEventListener("visibilitychange", resume)
    void poll()
    return () => {
      controller.abort()
      window.clearInterval(interval)
      window.removeEventListener("focus", resume)
      window.removeEventListener("online", resume)
      document.removeEventListener("visibilitychange", resume)
    }
  }, [
    alerts.alertStoreResponse,
    publicToken,
    realtimeAccess,
    realtimeConversationId,
  ])

  const attachmentDraft = useStoreConversationAttachmentDraft({
    enabled:
      state.kind === "ready" &&
      state.access === "guest" &&
      state.conversation.state === "active" &&
      state.channelMode.composerEnabled &&
      canSelectStoreConversationAttachment({
        capabilityAvailable: Boolean(attachmentCapability?.available),
        prescriptionConsentAccepted,
        target: selectedAttachmentTarget,
      }),
    onUpload: async ({ draft: localDraft, file, signal, updateProgress }) => {
      if (state.kind !== "ready" || !selectedAttachmentTarget) {
        throw new Error("Choose the exact Request for this attachment.")
      }
      const currentCapability = await fetch(
        "/api/store-conversations/attachments/capability",
        {
          body: JSON.stringify({
            conversationId: state.conversation.id,
            publicToken,
            target: selectedAttachmentTarget,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
          signal,
        },
      ).then((response) =>
        parseResponse<StoreConversationAttachmentCapabilityProjection>(
          response,
        ),
      )
      if (!currentCapability.uploadAuthorization) {
        throw new Error("Refresh attachment access before sending this file.")
      }
      setAttachmentCapability(currentCapability)
      const form = new FormData()
      form.set("clientMediaId", `${localDraft.operationId}:media`)
      form.set("clientOperationId", localDraft.operationId)
      form.set("conversationId", state.conversation.id)
      form.set("file", file)
      form.set("kind", localDraft.file.kind)
      form.set("publicToken", publicToken)
      if (
        selectedAttachmentTarget.kind === "new_prescription_request" &&
        prescriptionConsentAccepted
      ) {
        form.set("prescriptionConsentAccepted", "true")
      }
      form.set("target", JSON.stringify(selectedAttachmentTarget))
      const accepted = await uploadAttachmentForm({
        form,
        onProgress: updateProgress,
        signal,
        uploadAuthorization: currentCapability.uploadAuthorization.token,
      })
      setState((current) =>
        current.kind === "ready" &&
        !current.messages.some((message) => message.id === accepted.message.id)
          ? { ...current, messages: [...current.messages, accepted.message] }
          : current,
      )
      await loadTimeline(state.conversation)
    },
    policy: attachmentCapability?.available
      ? {
          acceptedMimeTypes: attachmentCapability.acceptedMimeTypes,
          allowedKinds: attachmentCapability.allowedKinds,
          maxBytes: attachmentCapability.limits.maxBytes,
        }
      : {
          acceptedMimeTypes: [],
          allowedKinds: [],
          maxBytes: 0,
        },
    scopeKey: `${publicToken}:${state.kind === "ready" ? state.conversation.id : "unresolved"}`,
  })

  useEffect(() => {
    if (!attachmentDraft.draft) return
    setRestoredAttachmentKind(null)
  }, [attachmentDraft.draft])

  useEffect(() => {
    if (state.kind !== "ready") return
    const scope = `${publicToken}:${state.conversation.id}`
    if (draftHydratedScope === scope) return
    const key = storeConversationLocalDraftKey({
      conversationId: state.conversation.id,
      publicToken,
    })
    const restored = parseStoreConversationLocalDraft(
      window.localStorage.getItem(key),
    )
    if (!restored) window.localStorage.removeItem(key)
    else {
      setDraft(restored.text)
      setRestoredAttachmentKind(restored.attachmentKind)
      setRefreshNotice(
        restored.attachmentKind
          ? "An unsent browser draft was restored. Reselect its attachment before sending."
          : "An unsent message draft was restored.",
      )
    }
    setDraftHydratedScope(scope)
  }, [draftHydratedScope, publicToken, state])

  useEffect(() => {
    if (state.kind !== "ready") return
    const scope = `${publicToken}:${state.conversation.id}`
    if (draftHydratedScope !== scope) return
    const key = storeConversationLocalDraftKey({
      conversationId: state.conversation.id,
      publicToken,
    })
    const timeout = window.setTimeout(() => {
      const value = createStoreConversationLocalDraft({
        attachmentKind:
          attachmentDraft.draft?.file.kind ?? restoredAttachmentKind,
        text: draft,
      })
      if (value) window.localStorage.setItem(key, JSON.stringify(value))
      else window.localStorage.removeItem(key)
    }, 150)
    return () => window.clearTimeout(timeout)
  }, [
    attachmentDraft.draft?.file.kind,
    draft,
    draftHydratedScope,
    publicToken,
    restoredAttachmentKind,
    state,
  ])

  const bootstrap = useCallback(
    async (resetGuest = false) => {
      setDraft("")
      setRestoredAttachmentKind(null)
      setDraftHydratedScope(null)
      setState({ kind: "loading" })
      try {
        const requestBootstrap = async () =>
          parseResponse<{
            access: ConversationAccess
            conversation: Conversation
            rotationPrepared?: boolean
          }>(
            await fetch("/api/store-conversations/bootstrap", {
              body: JSON.stringify({ publicToken, resetGuest }),
              headers: { "content-type": "application/json" },
              method: "POST",
            }),
          )
        let result = await requestBootstrap()
        if (result.rotationPrepared) {
          result = await requestBootstrap()
        }
        await loadTimeline(result.conversation, result.access)
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

  const openWhatsAppBridge = useCallback(async () => {
    if (state.kind !== "ready" || openingWhatsApp) return
    const scope = `${state.access}:${publicToken}:${state.conversation.id}`
    const operation = resolveStoreConversationWhatsAppBridgeClientOperation({
      createId: () => crypto.randomUUID(),
      createToken: () =>
        `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", ""),
      current: whatsAppBridgeOperationRef.current,
      scope,
    })
    whatsAppBridgeOperationRef.current = operation
    setOpeningWhatsApp(true)
    setSendError(null)
    try {
      await executeStoreConversationWhatsAppBridgeNavigation({
        issue: async (current) =>
          parseResponse<StoreConversationWhatsAppBridgeIssueProjection>(
            await fetch("/api/store-conversations/whatsapp-bridge", {
              body: JSON.stringify({
                access: state.access,
                bridgeToken: current.bridgeToken,
                clientOperationId: current.clientOperationId,
                conversationId: state.conversation.id,
                publicToken,
              }),
              headers: { "content-type": "application/json" },
              method: "POST",
            }),
          ),
        navigate: (navigationUrl) => window.location.assign(navigationUrl),
        operation,
      })
    } catch (error) {
      setSendError(
        error instanceof Error
          ? error.message
          : "WhatsApp could not be opened. Try again from this conversation.",
      )
    } finally {
      setOpeningWhatsApp(false)
    }
  }, [openingWhatsApp, publicToken, state])

  const loadOlder = useCallback(async () => {
    if (state.kind !== "ready" || state.nextCursor === null || loadingOlder) {
      return
    }
    setLoadingOlder(true)
    try {
      const params = new URLSearchParams({
        access: state.access,
        beforeSequence: String(state.nextCursor),
        conversationId: state.conversation.id,
        publicToken,
      })
      const timeline = await parseResponse<StoreConversationTimelineProjection>(
        await fetch(`/api/store-conversations/timeline?${params}`, {
          cache: "no-store",
        }),
      )
      setState({
        ...timeline,
        access: state.access,
        kind: "ready",
        messages: prependOlderStoreConversationMessages(
          state.messages,
          timeline.messages,
        ),
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
  }, [loadingOlder, publicToken, state])

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      state.kind !== "ready" ||
      !state.channelMode.composerEnabled ||
      sending ||
      (!draft.trim() && !attachmentDraft.draft)
    )
      return
    if (attachmentDraft.draft) {
      const uploaded = await attachmentDraft.upload()
      if (!uploaded || !draft.trim()) return
    }
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
            access: state.access,
            clientOperationId: operationIdRef.current,
            conversationId: state.conversation.id,
            publicToken,
            requestIntent: startingNewRequest
              ? "choose_request"
              : "continue_current",
            text: draft,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      )
      operationIdRef.current = null
      setDraft("")
      setRestoredAttachmentKind(null)
      window.localStorage.removeItem(
        storeConversationLocalDraftKey({
          conversationId: state.conversation.id,
          publicToken,
        }),
      )
      setStartingNewRequestState(false)
      setState((current) =>
        current.kind === "ready" &&
        !current.messages.some((message) => message.id === accepted.message.id)
          ? { ...current, messages: [...current.messages, accepted.message] }
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

  async function selectRequest(
    messageId: string,
    target: StoreConversationSelectRequestInput["target"],
  ) {
    if (
      state.kind !== "ready" ||
      state.access === "account" ||
      !state.channelMode.composerEnabled ||
      selectingMessageId
    )
      return
    setSelectingMessageId(messageId)
    setSendError(null)
    const operation = resolveStoreConversationKeyedOperation(
      selectionOperationRef.current,
      storeConversationRequestSelectionKey(messageId, target),
      () => crypto.randomUUID(),
    )
    selectionOperationRef.current = operation
    try {
      await parseResponse(
        await fetch("/api/store-conversations/select-request", {
          body: JSON.stringify({
            clientOperationId: operation.id,
            conversationId: state.conversation.id,
            messageId,
            publicToken,
            target,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      )
      selectionOperationRef.current = null
      await loadTimeline(state.conversation)
    } catch (error) {
      setSendError(
        error instanceof Error
          ? error.message
          : "The Request could not be selected.",
      )
    } finally {
      setSelectingMessageId(null)
    }
  }

  function changeDraft(value: string) {
    operationIdRef.current = null
    setDraft(value)
  }

  function setStartingNewRequest(value: boolean) {
    operationIdRef.current = null
    setStartingNewRequestState(value)
  }

  function selectAttachmentTarget(key: string) {
    const option = attachmentTargets.find((item) => item.key === key)
    if (!option) return
    attachmentDraft.remove()
    setRestoredAttachmentKind(null)
    setPrescriptionConsentAccepted(false)
    setSelectedAttachmentTarget(option.target)
  }

  return {
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
    removeRestoredAttachment: () => setRestoredAttachmentKind(null),
    setSoundAlerts: alerts.setSound,
    selectRequest,
    selectAttachmentTarget,
    selectedAttachmentTarget,
    restoredAttachmentKind,
    prescriptionConsentAccepted,
    selectingMessageId,
    sendError,
    sending,
    sendMessage,
    setStartingNewRequest,
    setPrescriptionConsentAccepted,
    startingNewRequest,
    state,
    soundAlertsEnabled: alerts.soundEnabled,
    textareaRef,
  }
}
