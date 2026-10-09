import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useTRPC } from "@/trpc/client"
import { useCustomerTRPC } from "@/trpc/customer-client"
import {
  STORE_CONVERSATION_CHAT_SCOPE_MESSAGE,
  canUseStoreConversationFreeFormChat,
} from "@ewatrade/service-commerce"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"

type EligibleAgeBand = "AGE_13_TO_15" | "AGE_16_TO_17" | "ADULT"

const choices: Array<{ label: string; value: EligibleAgeBand | "UNDER_13" }> = [
  { label: "Under 13", value: "UNDER_13" },
  { label: "13–15", value: "AGE_13_TO_15" },
  { label: "16–17", value: "AGE_16_TO_17" },
  { label: "18 or older", value: "ADULT" },
]

export function CustomerConversationAge({
  accountAccess,
  onAllowedChange,
  requireSafetyAcknowledgement = true,
}: {
  accountAccess: boolean
  onAllowedChange: (allowed: boolean) => void
  requireSafetyAcknowledgement?: boolean
}) {
  const trpc = useTRPC()
  const customerTrpc = useCustomerTRPC()
  const accountStatus = useQuery(
    trpc.serviceCommerce.accountAgeStatus.queryOptions(undefined, {
      enabled: accountAccess,
      retry: false,
    }),
  )
  const guestStatus = useQuery(
    customerTrpc.serviceCommerce.mobileGuestAgeStatus.queryOptions(undefined, {
      enabled: !accountAccess,
      retry: false,
    }),
  )
  const accountDeclare = useMutation(
    trpc.serviceCommerce.accountDeclareAgeBand.mutationOptions(),
  )
  const guestDeclare = useMutation(
    customerTrpc.serviceCommerce.mobileGuestDeclareAgeBand.mutationOptions(),
  )
  const [selected, setSelected] = useState<EligibleAgeBand | "UNDER_13" | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const status = accountAccess ? accountStatus : guestStatus
  const chatAllowed = canUseStoreConversationFreeFormChat({
    ageBand: status.data?.ageBand,
    principal: accountAccess ? "account" : "guest",
  })

  useEffect(() => {
    onAllowedChange(
      !status.isFetching &&
        status.data?.eligible === true &&
        (!requireSafetyAcknowledgement || chatAllowed),
    )
  }, [
    onAllowedChange,
    requireSafetyAcknowledgement,
    chatAllowed,
    status.data,
    status.isFetching,
  ])

  if (
    requireSafetyAcknowledgement &&
    (!accountAccess ||
      (!status.isFetching && status.data?.eligible && !chatAllowed))
  ) {
    return (
      <View className="mx-4 my-3 gap-3 rounded-xl border border-border bg-card p-4">
        <Text className="font-semibold text-foreground">
          Free-form chat requires an adult account
        </Text>
        <Text className="text-sm text-muted-foreground">
          {STORE_CONVERSATION_CHAT_SCOPE_MESSAGE}
        </Text>
        <Text className="text-sm text-muted-foreground">
          You can still view this conversation and use its reporting and support
          controls. Your age range is a declaration, not identity verification.
          Contact support if a saved range needs correction.
        </Text>
      </View>
    )
  }
  if (
    !status.isFetching &&
    status.data?.eligible &&
    (!requireSafetyAcknowledgement || chatAllowed)
  )
    return null

  const declare = async () => {
    if (!selected || selected === "UNDER_13") return
    setError(null)
    try {
      if (accountAccess) {
        await accountDeclare.mutateAsync({ ageBand: selected })
        await accountStatus.refetch()
      } else {
        await guestDeclare.mutateAsync({ ageBand: selected })
        await guestStatus.refetch()
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Age range could not be saved.",
      )
    }
  }

  return (
    <View className="mx-4 my-3 gap-3 rounded-xl border border-border bg-card p-4">
      <Text className="font-semibold text-foreground">
        Choose your age range
      </Text>
      <Text className="text-sm text-muted-foreground">
        Accounts and Store history are available from age 13. Free-form chat
        requires a signed-in account declaring age 18 or older. Choose your own
        age range; this is not identity verification.
      </Text>
      {status.isLoading ? (
        <Text className="text-sm text-muted-foreground">
          Checking age status…
        </Text>
      ) : (
        choices.map((choice) => (
          <Pressable
            key={choice.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected === choice.value }}
            className="min-h-11 flex-row items-center gap-3 rounded-lg border border-border px-3"
            onPress={() => setSelected(choice.value)}
          >
            <Text className="text-foreground">
              {selected === choice.value ? "◉" : "○"} {choice.label}
            </Text>
          </Pressable>
        ))
      )}
      {selected === "UNDER_13" ? (
        <Text className="text-sm text-muted-foreground">
          Accounts and Store history are not available to people under 13.
        </Text>
      ) : (
        <Pressable
          accessibilityRole="button"
          className="min-h-11 items-center justify-center rounded-lg bg-primary px-4 disabled:opacity-50"
          disabled={
            !selected || accountDeclare.isPending || guestDeclare.isPending
          }
          onPress={() => void declare()}
        >
          <Text className="font-semibold text-primary-foreground">
            {accountDeclare.isPending || guestDeclare.isPending
              ? "Saving…"
              : "Save age range"}
          </Text>
        </Pressable>
      )}
      {status.isError || error ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {error ?? "Age status is unavailable."}
        </Text>
      ) : null}
    </View>
  )
}
