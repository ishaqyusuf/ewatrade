import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { isCustomerCredentialError } from "@/lib/customer-conversation-state"
import {
  clearCustomerConversationSessionAndWait,
  getCustomerConversationSession,
} from "@/lib/customer-conversation-store"
import { useCustomerTRPC } from "@/trpc/customer-client"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { CustomerConversationDetailScreen } from "./customer-conversation-detail-screen"

type AgeBand = "AGE_13_TO_15" | "AGE_16_TO_17" | "ADULT"

const choices: Array<{ label: string; value: AgeBand | "UNDER_13" }> = [
  { label: "Under 13", value: "UNDER_13" },
  { label: "13–15", value: "AGE_13_TO_15" },
  { label: "16–17", value: "AGE_16_TO_17" },
  { label: "18 or older", value: "ADULT" },
]

export function CustomerConversationEntryAge({
  publicToken,
  targetCredentialToken,
  transferToken,
}: {
  publicToken: string | null
  targetCredentialToken: string | null
  transferToken: string | null
}) {
  const [hasSession, setHasSession] = useState(
    () => getCustomerConversationSession() !== null,
  )
  const [selected, setSelected] = useState<AgeBand | "UNDER_13" | null>(null)
  const [readyBand, setReadyBand] = useState<AgeBand | null>(null)
  const [error, setError] = useState<string | null>(null)
  const trpc = useCustomerTRPC()
  const status = useQuery(
    trpc.serviceCommerce.mobileGuestAgeStatus.queryOptions(undefined, {
      enabled: hasSession,
      retry: false,
    }),
  )
  const declare = useMutation(
    trpc.serviceCommerce.mobileGuestDeclareAgeBand.mutationOptions(),
  )

  const existingBand =
    hasSession && status.data?.eligible && status.data.ageBand !== "UNDECLARED"
      ? status.data.ageBand
      : null
  if (existingBand || readyBand) {
    return (
      <CustomerConversationDetailScreen
        bootstrap
        entryAgeBand={readyBand ?? existingBand ?? undefined}
        publicToken={publicToken}
        targetCredentialToken={targetCredentialToken}
        transferToken={transferToken}
      />
    )
  }

  const continueToChat = async () => {
    if (!selected || selected === "UNDER_13") return
    setError(null)
    try {
      if (hasSession) await declare.mutateAsync({ ageBand: selected })
      setReadyBand(selected)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Age range could not be saved.",
      )
    }
  }

  return (
    <View className="flex-1 justify-center bg-background p-5">
      <View className="gap-4 rounded-xl border border-border bg-card p-5">
        <Text className="text-xl font-semibold text-foreground">
          Before entering Store chat
        </Text>
        <Text className="text-sm text-muted-foreground">
          Store requests and history are available from age 13. Free-form chat
          requires a signed-in account declaring age 18 or older. Choose your
          age range before opening a conversation.
        </Text>
        {hasSession && status.isLoading ? (
          <Text className="text-sm text-muted-foreground">
            Checking age status…
          </Text>
        ) : hasSession && status.isError ? (
          <View className="gap-3">
            <Text
              accessibilityRole="alert"
              className="text-sm text-destructive"
            >
              {isCustomerCredentialError(status.error)
                ? "This Guest access has expired. Start a new conversation to continue."
                : "Age status is unavailable. Try again when connected."}
            </Text>
            <Pressable
              accessibilityRole="button"
              className="min-h-11 items-center justify-center rounded-lg border border-border px-4"
              onPress={() => {
                if (isCustomerCredentialError(status.error)) {
                  void clearCustomerConversationSessionAndWait().then(() =>
                    setHasSession(false),
                  )
                } else {
                  void status.refetch()
                }
              }}
            >
              <Text className="text-foreground">
                {isCustomerCredentialError(status.error)
                  ? "Start a new conversation"
                  : "Try again"}
              </Text>
            </Pressable>
          </View>
        ) : (
          choices.map((choice) => (
            <Pressable
              key={choice.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected === choice.value }}
              className={
                selected === choice.value
                  ? "min-h-12 flex-row items-center gap-3 rounded-[14px] border border-primary bg-tint-mint px-3"
                  : "min-h-12 flex-row items-center gap-3 rounded-[14px] border border-border px-3"
              }
              onPress={() => setSelected(choice.value)}
            >
              <Icon
                name={selected === choice.value ? "CircleCheck" : "Square"}
                className="size-[20px] text-primary"
              />
              <Text className="text-foreground">{choice.label}</Text>
            </Pressable>
          ))
        )}
        {selected === "UNDER_13" ? (
          <Text className="text-sm text-muted-foreground">
            Store chat is not available to people under 13.
          </Text>
        ) : !(hasSession && (status.isError || status.isLoading)) ? (
          <Pressable
            accessibilityRole="button"
            className="min-h-11 items-center justify-center rounded-lg bg-primary px-4"
            disabled={!selected || declare.isPending}
            onPress={() => void continueToChat()}
          >
            <Text className="font-semibold text-primary-foreground">
              {declare.isPending ? "Saving…" : "Continue to chat"}
            </Text>
          </Pressable>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {error}
          </Text>
        ) : null}
      </View>
    </View>
  )
}
