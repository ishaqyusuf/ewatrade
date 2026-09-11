import { getBaseUrl } from "@/lib/base-url"
import {
  clearCustomerConversationDraft,
  getCustomerConversationDraft,
  setCustomerConversationDraft,
} from "@/lib/customer-conversation-draft-store"
import {
  type CustomerOperation,
  isCustomerCredentialError,
  isDefinitiveCustomerTransferError,
  resolveCustomerOperation,
} from "@/lib/customer-conversation-state"
import {
  clearCustomerConversationSession,
  clearPendingCustomerTransfer,
  completeCustomerCredentialRotation,
  getCustomerConversationSession,
  getCustomerInstallationToken,
  getOrCreatePendingCustomerCredentialRotation,
  setCustomerConversationSession,
  updateCustomerConversationExpiry,
  updateLastCustomerConversation,
} from "@/lib/customer-conversation-store"
import { useCustomerTRPC } from "@/trpc/customer-client"
import type {
  RouterInputs,
  RouterOutputs,
} from "@ewatrade/api/trpc/routers/_app"
import {
  type StoreConversationWhatsAppBridgeClientOperation,
  executeStoreConversationWhatsAppBridgeNavigation,
  isStoreConversationGuestCredentialRotationDue,
  resolveStoreConversationWhatsAppBridgeClientOperation,
} from "@ewatrade/service-commerce"
import {
  type StoreConversationAttachmentPolicy,
  canSelectStoreConversationAttachment,
  mergeStoreConversationActionMessageUpdates,
  mergeStoreConversationSequence,
  resolveStoreConversationAttachmentTargets,
  storeConversationAttachmentTargetKey,
} from "@ewatrade/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import {
  FileSystemUploadType,
  type UploadTask,
  createUploadTask,
} from "expo-file-system/legacy"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Linking } from "react-native"
import { useCustomerAttachmentDraft } from "./use-customer-attachment-draft"
import { useCustomerRealtime } from "./use-customer-realtime"
import { useCustomerVoiceNote } from "./use-customer-voice-note"

export type CustomerRequestTarget =
  | { kind: "new_commerce_inquiry" }
  | {
      kind: "existing_request"
      requestId: string
      requestKind:
        | "commerce_inquiry"
        | "service_request"
        | "prescription_request"
    }

type CustomerMessage =
  RouterOutputs["serviceCommerce"]["mobileStoreConversationTimeline"]["messages"][number]
type CustomerTimeline =
  RouterOutputs["serviceCommerce"]["mobileStoreConversationTimeline"]
type AccountTimeline =
  RouterOutputs["serviceCommerce"]["accountStoreConversationTimeline"]

type AttachmentTarget = NonNullable<
  RouterInputs["serviceCommerce"]["mobileStoreConversationAttachmentCapability"]["target"]
>

const NO_ATTACHMENT_POLICY: StoreConversationAttachmentPolicy = {
  acceptedMimeTypes: [],
  allowedKinds: [],
  maxBytes: 0,
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function attachmentBlockerMessage(
  blockers:
    | RouterOutputs["serviceCommerce"]["mobileStoreConversationAttachmentCapability"]["blockers"]
    | undefined,
) {
  const blocker = blockers?.[0]
  if (!blocker) return null
  if (blocker === "request_required")
    return "Choose the Request this attachment belongs to."
  if (blocker === "request_stale")
    return "That Request changed. Refresh before attaching a file."
  if (blocker === "private_media_provider_unavailable")
    return "Private attachments are temporarily unavailable."
  if (blocker === "channel_unavailable")
    return "This conversation is not accepting attachments right now."
  return "Private attachments are unavailable for this Request."
}

export function useCustomerConversationDetail(input: {
  accountAccess: boolean
  bootstrap: boolean
  conversationId: string | null
  publicToken: string | null
  targetCredentialToken: string | null
  transferToken: string | null
}) {
  const trpc = useCustomerTRPC()
  const queryClient = useQueryClient()
  const [conversationId, setConversationId] = useState(input.conversationId)
  const [draft, setDraft] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [olderMessages, setOlderMessages] = useState<CustomerMessage[]>([])
  const [nextCursor, setNextCursor] = useState<number | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [startingNewRequest, setStartingNewRequest] = useState(false)
  const [selectedAttachmentTarget, setSelectedAttachmentTarget] =
    useState<AttachmentTarget | null>(null)
  const [prescriptionConsentAccepted, setPrescriptionConsentAccepted] =
    useState(false)
  const [restoredAttachmentKind, setRestoredAttachmentKind] = useState<
    "audio" | "document" | "image" | null
  >(null)
  const [draftHydratedScope, setDraftHydratedScope] = useState<string | null>(
    null,
  )
  const sendOperation = useRef<CustomerOperation | null>(null)
  const selectionOperation = useRef<CustomerOperation | null>(null)
  const whatsAppBridgeOperation =
    useRef<StoreConversationWhatsAppBridgeClientOperation | null>(null)
  const automaticOpenKey = useRef<string | null>(null)
  const loadingOlderRef = useRef(false)
  const uploadTaskRef = useRef<UploadTask | null>(null)
  const inputScope = `${input.accountAccess}:${input.publicToken}:${input.conversationId}`
  const scopeRef = useRef(
    `${input.accountAccess}:${input.publicToken}:${conversationId}`,
  )
  scopeRef.current = `${input.accountAccess}:${input.publicToken}:${conversationId}`

  const bootstrapMutation = useMutation(
    trpc.serviceCommerce.mobileBootstrapStoreConversation.mutationOptions(),
  )
  const claimMutation = useMutation(
    trpc.serviceCommerce.claimStoreConversationTransfer.mutationOptions(),
  )
  const redeemMutation = useMutation(
    trpc.serviceCommerce.redeemStoreConversationTransfer.mutationOptions(),
  )
  const rotateCredentialMutation = useMutation(
    trpc.serviceCommerce.mobileRotateStoreConversationCredential.mutationOptions(),
  )

  const persistBootstrap = useCallback(
    (result: {
      conversation: { id: string }
      credentialExpiresAt: Date | string
      credentialToken: string | null
    }) => {
      const currentSession = getCustomerConversationSession()
      const credentialToken =
        result.credentialToken ?? currentSession?.credentialToken ?? null
      if (!credentialToken || !input.publicToken) {
        throw new Error("The conversation credential was not returned.")
      }
      setCustomerConversationSession({
        credentialExpiresAt: new Date(result.credentialExpiresAt).toISOString(),
        credentialIssuedAt: result.credentialToken
          ? new Date().toISOString()
          : currentSession?.credentialIssuedAt,
        credentialToken,
        lastConversation: {
          conversationId: result.conversation.id,
          publicToken: input.publicToken,
        },
      })
      setConversationId(result.conversation.id)
    },
    [input.publicToken],
  )

  const rotateCredentialIfDue = useCallback(async () => {
    const session = getCustomerConversationSession()
    if (
      !session ||
      !isStoreConversationGuestCredentialRotationDue({
        issuedAt: session.credentialIssuedAt,
      })
    )
      return
    const pending = getOrCreatePendingCustomerCredentialRotation()
    const rotated = await rotateCredentialMutation.mutateAsync(pending)
    if (!completeCustomerCredentialRotation(rotated)) {
      throw new Error("The rotated conversation credential could not be stored.")
    }
  }, [rotateCredentialMutation])

  useEffect(() => {
    scopeRef.current = inputScope
    setConversationId(input.conversationId)
    setDraft("")
    setNotice(null)
    setOlderMessages([])
    setNextCursor(null)
    setStartingNewRequest(false)
    setSelectedAttachmentTarget(null)
    setPrescriptionConsentAccepted(false)
    setRestoredAttachmentKind(null)
    setDraftHydratedScope(null)
    sendOperation.current = null
    selectionOperation.current = null
    whatsAppBridgeOperation.current = null
    loadingOlderRef.current = false
    setLoadingOlder(false)
  }, [input.conversationId, inputScope])

  const openStore = useCallback(async () => {
    if (!input.publicToken) return
    setNotice(null)
    try {
      if (input.transferToken) {
        if (!input.targetCredentialToken) {
          throw new Error("This app transfer could not be secured.")
        }
        const transfer = {
          publicToken: input.publicToken,
          transferToken: input.transferToken,
        }
        await claimMutation.mutateAsync(transfer)
        persistBootstrap(
          await redeemMutation.mutateAsync({
            ...transfer,
            targetCredentialToken: input.targetCredentialToken,
          }),
        )
        clearPendingCustomerTransfer(input.publicToken)
        await rotateCredentialIfDue()
        return
      }
      persistBootstrap(
        await bootstrapMutation.mutateAsync({ publicToken: input.publicToken }),
      )
      await rotateCredentialIfDue()
    } catch (error) {
      if (
        input.transferToken &&
        input.publicToken &&
        isDefinitiveCustomerTransferError(error)
      ) {
        clearPendingCustomerTransfer(input.publicToken)
      }
      setNotice(errorMessage(error, "This Store conversation is unavailable."))
    }
  }, [
    bootstrapMutation.mutateAsync,
    claimMutation.mutateAsync,
    input.publicToken,
    input.targetCredentialToken,
    input.transferToken,
    persistBootstrap,
    redeemMutation.mutateAsync,
    rotateCredentialIfDue,
  ])

  useEffect(() => {
    if (!input.bootstrap || !input.publicToken) return
    const key = `${input.publicToken}:${input.transferToken ?? "direct"}`
    if (automaticOpenKey.current === key) return
    automaticOpenKey.current = key
    void openStore()
  }, [input.bootstrap, input.publicToken, input.transferToken, openStore])

  const timelineInput = useMemo(
    () => ({
      conversationId: conversationId ?? "missing",
      limit: 50,
      publicToken: input.publicToken ?? "missing",
    }),
    [conversationId, input.publicToken],
  )
  const guestTimeline = useQuery(
    trpc.serviceCommerce.mobileStoreConversationTimeline.queryOptions(
      timelineInput,
      {
        enabled: Boolean(
          !input.accountAccess && conversationId && input.publicToken,
        ),
        retry: false,
      },
    ),
  )
  const accountTimeline = useQuery(
    trpc.serviceCommerce.accountStoreConversationTimeline.queryOptions(
      timelineInput,
      {
        enabled: Boolean(
          input.accountAccess && conversationId && input.publicToken,
        ),
        retry: false,
      },
    ),
  )
  const timeline = input.accountAccess ? accountTimeline : guestTimeline
  const timelineQueryKey = useMemo(
    () =>
      input.accountAccess
        ? trpc.serviceCommerce.accountStoreConversationTimeline.queryKey(
            timelineInput,
          )
        : trpc.serviceCommerce.mobileStoreConversationTimeline.queryKey(
            timelineInput,
          ),
    [input.accountAccess, timelineInput, trpc],
  )
  const availableAttachmentTargets = useMemo(
    () =>
      timeline.data && !input.accountAccess
        ? resolveStoreConversationAttachmentTargets(timeline.data)
        : [],
    [input.accountAccess, timeline.data],
  )

  useEffect(() => {
    if (
      selectedAttachmentTarget &&
      availableAttachmentTargets.some(
        (option) =>
          option.key ===
          storeConversationAttachmentTargetKey(selectedAttachmentTarget),
      )
    )
      return
    setPrescriptionConsentAccepted(false)
    setSelectedAttachmentTarget(
      availableAttachmentTargets.length === 1
        ? (availableAttachmentTargets[0]?.target ?? null)
        : null,
    )
  }, [availableAttachmentTargets, selectedAttachmentTarget])

  const attachmentCapability = useQuery(
    trpc.serviceCommerce.mobileStoreConversationAttachmentCapability.queryOptions(
      {
        conversationId: conversationId ?? "missing",
        publicToken: input.publicToken ?? "missing",
        target: selectedAttachmentTarget ?? { kind: "new_commerce_inquiry" },
      },
      {
        enabled: Boolean(
          !input.accountAccess &&
            conversationId &&
            input.publicToken &&
            selectedAttachmentTarget &&
            timeline.data?.channelMode.composerEnabled,
        ),
        retry: false,
      },
    ),
  )
  const attachmentPolicy: StoreConversationAttachmentPolicy =
    attachmentCapability.data?.available
      ? {
          acceptedMimeTypes: attachmentCapability.data.acceptedMimeTypes,
          allowedKinds: attachmentCapability.data.allowedKinds,
          maxAudioBytes: attachmentCapability.data.limits.maxAudioBytes,
          maxBytes: attachmentCapability.data.limits.maxBytes,
        }
      : NO_ATTACHMENT_POLICY
  const attachmentDraft = useCustomerAttachmentDraft({
    enabled:
      Boolean(timeline.data?.channelMode.composerEnabled) &&
      canSelectStoreConversationAttachment({
        capabilityAvailable: Boolean(attachmentCapability.data?.available),
        prescriptionConsentAccepted,
        target: selectedAttachmentTarget,
      }),
    onCancelUpload: () => {
      void uploadTaskRef.current?.cancelAsync()
      uploadTaskRef.current = null
    },
    onUpload: async ({ draft: localDraft, file, updateProgress }) => {
      if (
        input.accountAccess ||
        !conversationId ||
        !input.publicToken ||
        !selectedAttachmentTarget
      ) {
        throw new Error("Choose the exact Request for this attachment.")
      }
      const session = getCustomerConversationSession()
      if (!session) throw new Error("Open the Store link to continue.")
      const refreshedCapability = await attachmentCapability.refetch()
      const uploadAuthorization =
        refreshedCapability.data?.uploadAuthorization?.token
      if (!uploadAuthorization) {
        throw new Error("Refresh attachment access before sending this file.")
      }
      const task = createUploadTask(
        `${getBaseUrl()}/api/service-commerce/conversations/attachments`,
        file.uri,
        {
          fieldName: "file",
          headers: {
            "x-store-conversation-credential": session.credentialToken,
            "x-store-conversation-attachment-authorization":
              uploadAuthorization,
            "x-store-conversation-installation": getCustomerInstallationToken(),
          },
          httpMethod: "POST",
          mimeType: file.mimeType,
          parameters: {
            clientMediaId: `${localDraft.operationId}:media`,
            clientOperationId: localDraft.operationId,
            conversationId,
            kind: localDraft.file.kind,
            publicToken: input.publicToken,
            ...(selectedAttachmentTarget.kind === "new_prescription_request" &&
            prescriptionConsentAccepted
              ? { prescriptionConsentAccepted: "true" }
              : {}),
            target: JSON.stringify(selectedAttachmentTarget),
          },
          uploadType: FileSystemUploadType.MULTIPART,
        },
        ({ totalBytesExpectedToSend, totalBytesSent }) => {
          if (totalBytesExpectedToSend <= 0) return
          updateProgress((totalBytesSent / totalBytesExpectedToSend) * 100)
        },
      )
      uploadTaskRef.current = task
      const response = await task.uploadAsync()
      if (uploadTaskRef.current === task) uploadTaskRef.current = null
      if (!response) throw new Error("Upload cancelled.")
      const body = JSON.parse(response.body) as { message?: string }
      if (response.status < 200 || response.status >= 300) {
        throw new Error(body.message ?? "Attachment could not be sent.")
      }
      await timeline.refetch()
    },
    policy: attachmentPolicy,
    scopeKey: `${input.publicToken}:${conversationId ?? "unresolved"}`,
  })

  useEffect(() => {
    if (!attachmentDraft.draft) return
    setRestoredAttachmentKind(null)
  }, [attachmentDraft.draft])

  useEffect(() => {
    if (!conversationId || !input.publicToken || !timeline.data) return
    const scope = `${input.publicToken}:${conversationId}`
    if (draftHydratedScope === scope) return
    let active = true
    void getCustomerConversationDraft({
      conversationId,
      publicToken: input.publicToken,
    }).then((restored) => {
      if (!active || scopeRef.current !== scope) return
      if (restored) {
        setDraft(restored.text)
        setRestoredAttachmentKind(restored.attachmentKind)
        setNotice(
          restored.attachmentKind
            ? "An unsent device draft was restored. Reselect its attachment before sending."
            : "An unsent message draft was restored.",
        )
      }
      setDraftHydratedScope(scope)
    })
    return () => {
      active = false
    }
  }, [conversationId, draftHydratedScope, input.publicToken, timeline.data])

  useEffect(() => {
    if (!conversationId || !input.publicToken) return
    const scope = `${input.publicToken}:${conversationId}`
    if (draftHydratedScope !== scope) return
    const timeout = setTimeout(() => {
      void setCustomerConversationDraft({
        attachmentKind:
          attachmentDraft.draft?.file.kind ?? restoredAttachmentKind,
        conversationId,
        publicToken: input.publicToken ?? "",
        text: draft,
      })
    }, 150)
    return () => clearTimeout(timeout)
  }, [
    attachmentDraft.draft?.file.kind,
    conversationId,
    draft,
    draftHydratedScope,
    input.publicToken,
    restoredAttachmentKind,
  ])
  const voiceNote = useCustomerVoiceNote({
    enabled: Boolean(
      timeline.data?.channelMode.composerEnabled &&
        attachmentCapability.data?.available &&
        attachmentCapability.data.allowedKinds.includes("audio") &&
        selectedAttachmentTarget &&
        selectedAttachmentTarget.kind !== "new_prescription_request" &&
        !attachmentDraft.draft,
    ),
    onReady: attachmentDraft.acceptVoiceNote,
    scopeKey: `${input.publicToken}:${conversationId ?? "unresolved"}`,
  })
  const realtime = useCustomerRealtime({
    accountAccess: input.accountAccess,
    conversationId,
    messages: timeline.data?.messages ?? [],
    onAvailability: useCallback(
      (
        availability: RouterOutputs["serviceCommerce"]["mobileStoreConversationMessagesAfter"]["availability"],
      ) => {
        if (!conversationId || !input.publicToken) return
        queryClient.setQueryData(
          timelineQueryKey,
          (current: AccountTimeline | CustomerTimeline | undefined) =>
            current ? { ...current, availability } : current,
        )
      },
      [conversationId, input.publicToken, queryClient, timelineQueryKey],
    ),
    onChannelMode: useCallback(
      (
        channelMode: RouterOutputs["serviceCommerce"]["mobileStoreConversationMessagesAfter"]["channelMode"],
      ) => {
        if (!conversationId || !input.publicToken) return
        queryClient.setQueryData(
          timelineQueryKey,
          (current: AccountTimeline | CustomerTimeline | undefined) =>
            current ? { ...current, channelMode } : current,
        )
      },
      [conversationId, input.publicToken, queryClient, timelineQueryKey],
    ),
    onMessages: useCallback(
      (
        messages: CustomerMessage[],
        actionMessageUpdates: RouterOutputs["serviceCommerce"]["mobileStoreConversationMessagesAfter"]["actionMessageUpdates"],
      ) => {
        if (!conversationId || !input.publicToken) return
        queryClient.setQueryData(
          timelineQueryKey,
          (current: AccountTimeline | CustomerTimeline | undefined) =>
            current
              ? {
                  ...current,
                  messages: mergeStoreConversationActionMessageUpdates(
                    mergeStoreConversationSequence(current.messages, messages),
                    actionMessageUpdates,
                  ),
                }
              : current,
        )
      },
      [conversationId, input.publicToken, queryClient, timelineQueryKey],
    ),
    onModeration: useCallback(
      (
        moderation: RouterOutputs["serviceCommerce"]["mobileStoreConversationMessagesAfter"]["moderation"],
      ) => {
        if (!conversationId || !input.publicToken) return
        queryClient.setQueryData(
          timelineQueryKey,
          (current: AccountTimeline | CustomerTimeline | undefined) =>
            current
              ? {
                  ...current,
                  conversation: {
                    ...current.conversation,
                    moderation,
                    state:
                      moderation.state === "restricted"
                        ? ("restricted" as const)
                        : current.conversation.state === "restricted"
                          ? ("active" as const)
                          : current.conversation.state,
                  },
                }
              : current,
        )
      },
      [conversationId, input.publicToken, queryClient, timelineQueryKey],
    ),
    onNotice: useCallback((message: string) => setNotice(message), []),
    publicToken: input.publicToken,
  })

  useEffect(() => {
    if (!timeline.data || !input.publicToken) return
    setOlderMessages([])
    setNextCursor(timeline.data.nextCursor)
    if (!input.accountAccess) {
      updateLastCustomerConversation({
        conversationId: timeline.data.conversation.id,
        publicToken: input.publicToken,
      })
      if ("credentialExpiresAt" in timeline.data) {
        updateCustomerConversationExpiry(timeline.data.credentialExpiresAt)
      }
    }
  }, [input.accountAccess, input.publicToken, timeline.data])

  useEffect(() => {
    if (input.accountAccess || !isCustomerCredentialError(timeline.error))
      return
    clearCustomerConversationSession()
    void queryClient.invalidateQueries({
      queryKey: trpc.serviceCommerce.mobileStoreConversationTimeline.queryKey(),
    })
  }, [input.accountAccess, queryClient, timeline.error, trpc])

  const guestSend = useMutation(
    trpc.serviceCommerce.mobileSendStoreConversationText.mutationOptions(),
  )
  const accountSend = useMutation(
    trpc.serviceCommerce.accountSendStoreConversationText.mutationOptions(),
  )
  const send = input.accountAccess ? accountSend : guestSend
  const select = useMutation(
    trpc.serviceCommerce.mobileSelectStoreConversationRequest.mutationOptions(),
  )
  const guestWhatsAppBridge = useMutation(
    trpc.serviceCommerce.mobileIssueStoreConversationWhatsAppBridge.mutationOptions(),
  )
  const accountWhatsAppBridge = useMutation(
    trpc.serviceCommerce.accountIssueStoreConversationWhatsAppBridge.mutationOptions(),
  )
  const whatsAppBridge = input.accountAccess
    ? accountWhatsAppBridge
    : guestWhatsAppBridge

  async function openWhatsAppBridge() {
    if (!conversationId || !input.publicToken || whatsAppBridge.isPending)
      return
    const publicToken = input.publicToken
    const scope = `${input.accountAccess}:${publicToken}:${conversationId}`
    const operation = resolveStoreConversationWhatsAppBridgeClientOperation({
      createId: () => Crypto.randomUUID(),
      createToken: () =>
        `${Crypto.randomUUID()}${Crypto.randomUUID()}`.replaceAll("-", ""),
      current: whatsAppBridgeOperation.current,
      scope,
    })
    whatsAppBridgeOperation.current = operation
    setNotice(null)
    try {
      await executeStoreConversationWhatsAppBridgeNavigation({
        issue: (current) =>
          whatsAppBridge.mutateAsync({
            bridgeToken: current.bridgeToken,
            clientOperationId: current.clientOperationId,
            conversationId,
            publicToken,
          }),
        navigate: Linking.openURL,
        operation,
      })
    } catch (error) {
      setNotice(
        errorMessage(
          error,
          "WhatsApp could not be opened. Try again from this conversation.",
        ),
      )
    }
  }

  async function sendText() {
    const text = draft.trim()
    if (
      !conversationId ||
      !input.publicToken ||
      !timeline.data?.channelMode.composerEnabled ||
      !text ||
      send.isPending
    )
      return
    sendOperation.current = resolveCustomerOperation(
      sendOperation.current,
      `${conversationId}:${startingNewRequest}:${text}`,
      () => Crypto.randomUUID(),
    )
    setNotice(null)
    try {
      const result = await send.mutateAsync({
        clientOperationId: sendOperation.current.id,
        conversationId,
        publicToken: input.publicToken,
        requestIntent: startingNewRequest
          ? "choose_request"
          : "continue_current",
        text,
      })
      if ("credentialExpiresAt" in result) {
        updateCustomerConversationExpiry(result.credentialExpiresAt)
      }
      sendOperation.current = null
      setDraft("")
      setRestoredAttachmentKind(null)
      void clearCustomerConversationDraft({
        conversationId,
        publicToken: input.publicToken,
      })
      setStartingNewRequest(false)
      await timeline.refetch()
    } catch (error) {
      if (!input.accountAccess && isCustomerCredentialError(error)) {
        clearCustomerConversationSession()
      }
      setNotice(
        `${errorMessage(error, "Message not sent")} Your draft is still here.`,
      )
    }
  }

  async function sendComposer() {
    if (attachmentDraft.draft) {
      const uploaded = await attachmentDraft.upload()
      if (!uploaded) return
    }
    if (draft.trim()) await sendText()
  }

  function selectAttachmentTarget(key: string) {
    const option = availableAttachmentTargets.find((item) => item.key === key)
    if (!option) return
    attachmentDraft.remove()
    setRestoredAttachmentKind(null)
    setPrescriptionConsentAccepted(false)
    setSelectedAttachmentTarget(option.target)
  }

  async function selectRequest(
    messageId: string,
    target: CustomerRequestTarget,
  ) {
    if (
      input.accountAccess ||
      !conversationId ||
      !input.publicToken ||
      !timeline.data?.channelMode.composerEnabled ||
      select.isPending
    )
      return
    const key = `${messageId}:${JSON.stringify(target)}`
    selectionOperation.current = resolveCustomerOperation(
      selectionOperation.current,
      key,
      () => Crypto.randomUUID(),
    )
    try {
      await select
        .mutateAsync({
          clientOperationId: selectionOperation.current.id,
          conversationId,
          messageId,
          publicToken: input.publicToken,
          target,
        })
        .then((result) =>
          updateCustomerConversationExpiry(result.credentialExpiresAt),
        )
      selectionOperation.current = null
      await timeline.refetch()
    } catch (error) {
      if (!input.accountAccess && isCustomerCredentialError(error)) {
        clearCustomerConversationSession()
      }
      setNotice(errorMessage(error, "Request choice was not saved."))
    }
  }

  async function loadOlder() {
    if (
      !conversationId ||
      !input.publicToken ||
      !nextCursor ||
      loadingOlderRef.current
    )
      return
    loadingOlderRef.current = true
    setLoadingOlder(true)
    const scope = scopeRef.current
    try {
      const olderInput = {
        beforeSequence: nextCursor,
        conversationId,
        limit: 50,
        publicToken: input.publicToken,
      }
      const older = input.accountAccess
        ? await queryClient.fetchQuery(
            trpc.serviceCommerce.accountStoreConversationTimeline.queryOptions(
              olderInput,
            ),
          )
        : await queryClient.fetchQuery(
            trpc.serviceCommerce.mobileStoreConversationTimeline.queryOptions(
              olderInput,
            ),
          )
      if (scopeRef.current !== scope) return
      if ("credentialExpiresAt" in older) {
        updateCustomerConversationExpiry(older.credentialExpiresAt)
      }
      setOlderMessages((current) => [
        ...older.messages.filter(
          (message) => !current.some((item) => item.id === message.id),
        ),
        ...current,
      ])
      setNextCursor(older.nextCursor)
    } catch (error) {
      if (scopeRef.current !== scope) return
      setNotice(errorMessage(error, "Older messages could not be loaded."))
    } finally {
      if (scopeRef.current === scope) {
        loadingOlderRef.current = false
        setLoadingOlder(false)
      }
    }
  }

  return {
    attachmentCapability,
    attachmentDraft,
    attachmentNotice:
      attachmentDraft.notice ??
      (attachmentCapability.isError
        ? errorMessage(
            attachmentCapability.error,
            "Private attachments are unavailable.",
          )
        : attachmentBlockerMessage(attachmentCapability.data?.blockers)),
    attachmentTargets: availableAttachmentTargets,
    conversationId,
    draft,
    loadOlder,
    loadingOlder,
    nextCursor,
    notice,
    olderMessages,
    openWhatsAppBridge,
    openingWhatsApp: whatsAppBridge.isPending,
    openStore,
    selectRequest,
    selectAttachmentTarget,
    selecting: select.isPending,
    sendComposer,
    sendText,
    sending: send.isPending || attachmentDraft.draft?.status === "uploading",
    setDraft,
    setNotice,
    setPrescriptionConsentAccepted,
    setSoundAlerts: realtime.setSound,
    setStartingNewRequest,
    selectedAttachmentTarget,
    prescriptionConsentAccepted,
    removeRestoredAttachment: () => setRestoredAttachmentKind(null),
    restoredAttachmentKind,
    startingNewRequest,
    soundAlertsEnabled: realtime.soundEnabled,
    timeline,
    opening: bootstrapMutation.isPending,
    transferring: claimMutation.isPending || redeemMutation.isPending,
    voiceNote,
  }
}
