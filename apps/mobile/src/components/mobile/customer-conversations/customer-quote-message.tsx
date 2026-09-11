import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { getChatUrl } from "@/lib/base-url"
import { resolveCustomerOperation } from "@/lib/customer-conversation-state"
import { useCustomerTRPC } from "@/trpc/customer-client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { resolveServiceCommerceCustomerActionHandoffPath } from "@ewatrade/service-commerce"
import {
  type StoreConversationActionReturnState,
  advanceStoreConversationActionReturn,
  formatMinorMoney,
} from "@ewatrade/utils"
import { useMutation, useQuery } from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { useCallback, useEffect, useRef, useState } from "react"
import { AppState, Linking } from "react-native"
import {
  CUSTOMER_QUOTE_MESSAGE_LAYOUT,
  projectCustomerQuoteActionButton,
  projectCustomerQuoteHeading,
  projectCustomerQuoteMessageFeedback,
  requestCustomerQuoteAction,
} from "./customer-quote-message-state"

type Message =
  RouterOutputs["serviceCommerce"]["mobileStoreConversationTimeline"]["messages"][number]

type QuoteActionMessage = NonNullable<Message["actionMessage"]>
type QuoteAction = QuoteActionMessage["actions"][number]

function actionAmount(action: QuoteAction) {
  if (action.amountMinor === undefined || !action.currencyCode) return null
  return formatMinorMoney(action.amountMinor, action.currencyCode)
}

export function CustomerQuoteMessage({
  accountAccess,
  actionMessage,
  conversationId,
  interactive = true,
  messageId,
  onContactStore,
  onRefresh,
  publicToken,
}: {
  accountAccess: boolean
  actionMessage: QuoteActionMessage
  conversationId: string
  interactive?: boolean
  messageId: string
  onContactStore: () => void
  onRefresh: () => Promise<unknown>
  publicToken: string
}) {
  const trpc = useCustomerTRPC()
  const [projection, setProjection] = useState(actionMessage)
  const [confirmingToken, setConfirmingToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const operationRef = useRef<{ id: string; key: string } | null>(null)
  const returnStateRef = useRef<StoreConversationActionReturnState>("idle")

  const guestPreview = useQuery(
    trpc.serviceCommerce.previewMobileStoreConversationAction.queryOptions(
      { conversationId, messageId, publicToken },
      {
        enabled: false,
        retry: false,
      },
    ),
  )
  const accountPreview = useQuery(
    trpc.serviceCommerce.accountPreviewStoreConversationAction.queryOptions(
      { conversationId, messageId, publicToken },
      { enabled: false, retry: false },
    ),
  )
  const guestExecute = useMutation(
    trpc.serviceCommerce.executeMobileStoreConversationAction.mutationOptions(),
  )
  const accountExecute = useMutation(
    trpc.serviceCommerce.accountExecuteStoreConversationAction.mutationOptions(),
  )
  const preview = accountAccess ? accountPreview : guestPreview
  const execute = accountAccess ? accountExecute : guestExecute
  const previewError =
    error ??
    (preview.error instanceof Error
      ? preview.error.message
      : preview.isError
        ? "This quotation could not be updated."
        : null)
  const feedback = projectCustomerQuoteMessageFeedback({
    error: previewError,
    loading: preview.isFetching,
  })
  const heading = projectCustomerQuoteHeading({
    confirmationRequired: projection.actions.some(
      (action) => action.confirmation === "required",
    ),
    lifecycle: projection.lifecycle,
    quoteVersion: projection.quoteVersion,
  })

  const refreshAuthoritativeState = useCallback(async () => {
    if (!interactive) return
    setError(null)
    const result = await preview.refetch()
    if (result.error) {
      setError(
        result.error instanceof Error
          ? result.error.message
          : "This quotation could not be updated.",
      )
      return
    }
    if (result.data) setProjection(result.data)
    await onRefresh()
  }, [interactive, onRefresh, preview.refetch])

  useEffect(() => {
    setProjection(actionMessage)
    setConfirmingToken(null)
    setError(null)
  }, [actionMessage])

  useEffect(() => {
    if (!interactive) return
    const subscription = AppState.addEventListener("change", (nextState) => {
      const transition = advanceStoreConversationActionReturn(
        returnStateRef.current,
        nextState === "active" ? "active" : "inactive",
      )
      returnStateRef.current = transition.state
      if (transition.refresh) void refreshAuthoritativeState()
    })
    return () => subscription.remove()
  }, [interactive, refreshAuthoritativeState])

  async function executeAction(action: QuoteAction) {
    if (!interactive) return
    const requested = requestCustomerQuoteAction(confirmingToken, action)
    if (!requested.execute) {
      setConfirmingToken(requested.confirmingToken)
      return
    }

    const operation = resolveCustomerOperation(
      operationRef.current,
      `${messageId}:${action.capabilityToken}:${action.confirmation}`,
      () => Crypto.randomUUID(),
    )
    operationRef.current = operation
    setError(null)
    try {
      const result = await execute.mutateAsync({
        capabilityToken: action.capabilityToken,
        clientOperationId: operation.id,
        confirmed: action.confirmation === "required",
        conversationId,
        messageId,
        publicToken,
      })
      const handoffPath = resolveServiceCommerceCustomerActionHandoffPath({
        capabilityToken: action.capabilityToken,
        result,
      })
      if (handoffPath) {
        returnStateRef.current = advanceStoreConversationActionReturn(
          returnStateRef.current,
          "handoff_opened",
        ).state
        try {
          await Linking.openURL(new URL(handoffPath, getChatUrl()).toString())
        } catch (handoffError) {
          returnStateRef.current = "idle"
          throw handoffError
        }
        operationRef.current = null
        return
      }
      operationRef.current = null
      setConfirmingToken(null)
      if (action.action === "talk_to_staff") onContactStore()
      const refreshed = await preview.refetch()
      if (refreshed.data) setProjection(refreshed.data)
      await onRefresh()
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "This action could not be completed.",
      )
    }
  }

  return (
    <View
      className={`mr-auto w-full gap-3 rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-3.5 ${CUSTOMER_QUOTE_MESSAGE_LAYOUT.compactWidthClass}`}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {heading.eyebrow}
          </Text>
          <Text className="text-lg font-extrabold text-foreground">
            {heading.title}
          </Text>
        </View>
        <View className="rounded-full bg-primary/10 px-2.5 py-1.5">
          <Text className="text-[11px] font-extrabold text-primary">
            {heading.status}
          </Text>
        </View>
      </View>

      {heading.guidance ? (
        <Text className="text-xs leading-5 text-muted-foreground">
          {heading.guidance}
        </Text>
      ) : null}

      <View>
        {projection.options.map((option, index) => (
          <View
            className={
              option.selected
                ? "min-h-14 flex-row items-center justify-between gap-3 rounded-xl bg-primary/10 px-3 py-2.5"
                : index === 0
                  ? "min-h-14 flex-row items-center justify-between gap-3 px-1 py-2.5"
                  : "min-h-14 flex-row items-center justify-between gap-3 border-t border-border px-1 py-2.5"
            }
            key={option.id}
          >
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="font-bold text-foreground" numberOfLines={2}>
                {option.label}
              </Text>
              {option.selected ? (
                <Text className="text-xs font-bold text-primary">Selected</Text>
              ) : null}
            </View>
            <Text className="shrink-0 font-extrabold text-foreground">
              {formatMinorMoney(option.totalMinor, projection.currencyCode)}
            </Text>
          </View>
        ))}
      </View>

      {preview.isFetching ? (
        <Text
          accessibilityLiveRegion="polite"
          className="text-xs text-muted-foreground"
        >
          {feedback.status}
        </Text>
      ) : null}

      {interactive && feedback.retryVisible ? (
        <View className="gap-2">
          <Text
            accessibilityLiveRegion="polite"
            className="text-xs leading-5 text-destructive"
          >
            {feedback.status}
          </Text>
          <ActionButton
            disabled={execute.isPending}
            label="Retry"
            onPress={() => void refreshAuthoritativeState()}
            variant="outline"
          />
        </View>
      ) : null}

      {interactive &&
      feedback.actionsVisible &&
      projection.actions.length > 0 ? (
        <View className="flex-row flex-wrap gap-2 border-t border-border pt-3">
          {projection.actions.map((action) => {
            const confirming = confirmingToken === action.capabilityToken
            const pending =
              execute.isPending &&
              execute.variables?.capabilityToken === action.capabilityToken
            const button = projectCustomerQuoteActionButton(action, {
              confirming,
              pending,
            })
            const amount = actionAmount(action)
            return (
              <View
                className={confirming ? "w-full gap-2" : "gap-2"}
                key={action.capabilityToken}
              >
                {confirming ? (
                  <View className="gap-1 rounded-xl bg-primary/10 px-3 py-2.5">
                    <Text className="text-sm font-bold text-foreground">
                      Confirm {action.label.toLowerCase()}
                    </Text>
                    <Text className="text-xs leading-5 text-muted-foreground">
                      {action.consequence}
                      {amount ? ` Amount: ${amount}.` : ""}
                    </Text>
                  </View>
                ) : null}
                <View className="flex-row flex-wrap gap-2">
                  <ActionButton
                    accessibilityLabel={button.accessibilityLabel}
                    disabled={execute.isPending}
                    label={button.label}
                    onPress={() => void executeAction(action)}
                    variant="primary"
                  />
                  {confirming ? (
                    <ActionButton
                      disabled={execute.isPending}
                      label="Cancel"
                      onPress={() => setConfirmingToken(null)}
                      variant="outline"
                    />
                  ) : null}
                </View>
              </View>
            )
          })}
        </View>
      ) : null}

      {interactive && feedback.actionsVisible && projection.recovery ? (
        <ActionButton
          label={
            projection.recovery === "talk_to_store"
              ? "Message store"
              : "Refresh quotation"
          }
          onPress={
            projection.recovery === "talk_to_store"
              ? onContactStore
              : () => void refreshAuthoritativeState()
          }
          variant="outline"
        />
      ) : null}
    </View>
  )
}

function ActionButton({
  accessibilityLabel,
  disabled = false,
  label,
  onPress,
  variant,
}: {
  accessibilityLabel?: string
  disabled?: boolean
  label: string
  onPress: () => void
  variant: "outline" | "primary"
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      className={
        variant === "primary"
          ? `${CUSTOMER_QUOTE_MESSAGE_LAYOUT.actionMinHeightClass} items-center justify-center rounded-full bg-primary px-4 disabled:opacity-50`
          : `${CUSTOMER_QUOTE_MESSAGE_LAYOUT.actionMinHeightClass} items-center justify-center rounded-full border border-border px-4 disabled:opacity-50`
      }
      disabled={disabled}
      haptic
      onPress={onPress}
    >
      <Text
        className={
          variant === "primary"
            ? "text-sm font-extrabold text-primary-foreground"
            : "text-sm font-bold text-foreground"
        }
      >
        {label}
      </Text>
    </Pressable>
  )
}
