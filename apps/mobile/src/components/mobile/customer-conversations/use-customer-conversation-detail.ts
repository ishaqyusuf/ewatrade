import {
  type CustomerOperation,
  isCustomerCredentialError,
  isDefinitiveCustomerTransferError,
  resolveCustomerOperation,
} from "@/lib/customer-conversation-state"
import {
  clearCustomerConversationSession,
  clearPendingCustomerTransfer,
  getCustomerConversationSession,
  setCustomerConversationSession,
  updateCustomerConversationExpiry,
  updateLastCustomerConversation,
} from "@/lib/customer-conversation-store"
import { useCustomerTRPC } from "@/trpc/customer-client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useCallback, useEffect, useRef, useState } from "react"

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

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function useCustomerConversationDetail(input: {
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
  const sendOperation = useRef<CustomerOperation | null>(null)
  const selectionOperation = useRef<CustomerOperation | null>(null)
  const automaticOpenKey = useRef<string | null>(null)
  const loadingOlderRef = useRef(false)
  const inputScope = `${input.publicToken}:${input.conversationId}`
  const scopeRef = useRef(`${input.publicToken}:${conversationId}`)
  scopeRef.current = `${input.publicToken}:${conversationId}`

  const bootstrapMutation = useMutation(
    trpc.serviceCommerce.mobileBootstrapStoreConversation.mutationOptions(),
  )
  const claimMutation = useMutation(
    trpc.serviceCommerce.claimStoreConversationTransfer.mutationOptions(),
  )
  const redeemMutation = useMutation(
    trpc.serviceCommerce.redeemStoreConversationTransfer.mutationOptions(),
  )

  const persistBootstrap = useCallback(
    (result: {
      conversation: { id: string }
      credentialExpiresAt: Date | string
      credentialToken: string | null
    }) => {
      const credentialToken =
        result.credentialToken ??
        getCustomerConversationSession()?.credentialToken ??
        null
      if (!credentialToken || !input.publicToken) {
        throw new Error("The conversation credential was not returned.")
      }
      setCustomerConversationSession({
        credentialExpiresAt: new Date(result.credentialExpiresAt).toISOString(),
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

  useEffect(() => {
    scopeRef.current = inputScope
    setConversationId(input.conversationId)
    setDraft("")
    setNotice(null)
    setOlderMessages([])
    setNextCursor(null)
    setStartingNewRequest(false)
    sendOperation.current = null
    selectionOperation.current = null
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
        return
      }
      persistBootstrap(
        await bootstrapMutation.mutateAsync({ publicToken: input.publicToken }),
      )
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
  ])

  useEffect(() => {
    if (!input.bootstrap || !input.publicToken) return
    const key = `${input.publicToken}:${input.transferToken ?? "direct"}`
    if (automaticOpenKey.current === key) return
    automaticOpenKey.current = key
    void openStore()
  }, [input.bootstrap, input.publicToken, input.transferToken, openStore])

  const timeline = useQuery(
    trpc.serviceCommerce.mobileStoreConversationTimeline.queryOptions(
      {
        conversationId: conversationId ?? "missing",
        limit: 50,
        publicToken: input.publicToken ?? "missing",
      },
      {
        enabled: Boolean(conversationId && input.publicToken),
        retry: false,
      },
    ),
  )

  useEffect(() => {
    if (!timeline.data || !input.publicToken) return
    setOlderMessages([])
    setNextCursor(timeline.data.nextCursor)
    updateLastCustomerConversation({
      conversationId: timeline.data.conversation.id,
      publicToken: input.publicToken,
    })
    updateCustomerConversationExpiry(timeline.data.credentialExpiresAt)
  }, [input.publicToken, timeline.data])

  useEffect(() => {
    if (!isCustomerCredentialError(timeline.error)) return
    clearCustomerConversationSession()
    queryClient.clear()
  }, [queryClient, timeline.error])

  const send = useMutation(
    trpc.serviceCommerce.mobileSendStoreConversationText.mutationOptions(),
  )
  const select = useMutation(
    trpc.serviceCommerce.mobileSelectStoreConversationRequest.mutationOptions(),
  )

  async function sendText() {
    const text = draft.trim()
    if (!conversationId || !input.publicToken || !text || send.isPending) return
    sendOperation.current = resolveCustomerOperation(
      sendOperation.current,
      `${conversationId}:${startingNewRequest}:${text}`,
      () => Crypto.randomUUID(),
    )
    setNotice(null)
    try {
      await send
        .mutateAsync({
          clientOperationId: sendOperation.current.id,
          conversationId,
          publicToken: input.publicToken,
          requestIntent: startingNewRequest
            ? "choose_request"
            : "continue_current",
          text,
        })
        .then((result) =>
          updateCustomerConversationExpiry(result.credentialExpiresAt),
        )
      sendOperation.current = null
      setDraft("")
      setStartingNewRequest(false)
      await timeline.refetch()
    } catch (error) {
      if (isCustomerCredentialError(error)) {
        clearCustomerConversationSession()
        queryClient.clear()
      }
      setNotice(
        `${errorMessage(error, "Message not sent")} Your draft is still here.`,
      )
    }
  }

  async function selectRequest(
    messageId: string,
    target: CustomerRequestTarget,
  ) {
    if (!conversationId || !input.publicToken || select.isPending) return
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
      if (isCustomerCredentialError(error)) {
        clearCustomerConversationSession()
        queryClient.clear()
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
      const older = await queryClient.fetchQuery(
        trpc.serviceCommerce.mobileStoreConversationTimeline.queryOptions({
          beforeSequence: nextCursor,
          conversationId,
          limit: 50,
          publicToken: input.publicToken,
        }),
      )
      if (scopeRef.current !== scope) return
      updateCustomerConversationExpiry(older.credentialExpiresAt)
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
    draft,
    loadOlder,
    loadingOlder,
    nextCursor,
    notice,
    olderMessages,
    openStore,
    selectRequest,
    selecting: select.isPending,
    sendText,
    sending: send.isPending,
    setDraft,
    setNotice,
    setStartingNewRequest,
    startingNewRequest,
    timeline,
    opening: bootstrapMutation.isPending,
    transferring: claimMutation.isPending || redeemMutation.isPending,
  }
}
