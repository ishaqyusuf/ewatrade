import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useTRPC } from "@/trpc/client"
import { useCustomerTRPC } from "@/trpc/customer-client"
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
  const [safetyState, setSafetyState] = useState({ allowed: false, scope: "" })
  const status = accountAccess ? accountStatus : guestStatus
  const safetyScope = `${accountAccess}:${status.data?.ageBand ?? "unknown"}`
  const safetyAcknowledged =
    safetyState.scope === safetyScope && safetyState.allowed

  useEffect(() => {
    onAllowedChange(
      !status.isFetching &&
        status.data?.eligible === true &&
        (!requireSafetyAcknowledgement ||
          status.data.ageBand === "ADULT" ||
          safetyAcknowledged),
    )
  }, [
    onAllowedChange,
    requireSafetyAcknowledgement,
    safetyAcknowledged,
    status.data,
    status.isFetching,
  ])

  if (!status.isFetching && status.data?.eligible) {
    if (
      !requireSafetyAcknowledgement ||
      status.data.ageBand === "ADULT" ||
      safetyAcknowledged
    )
      return null
    return (
      <View className="mx-4 my-3 gap-3 rounded-xl border border-border bg-card p-4">
        <Text className="font-semibold text-foreground">
          Stay safe in Store chat
        </Text>
        <Text className="text-sm text-muted-foreground">
          You are talking with another person online. Do not share your home
          address, phone number, school, passwords, payment details, or other
          private information. You can block or report a conversation that makes
          you uncomfortable, and ask a trusted adult for help.
        </Text>
        <Pressable
          accessibilityRole="button"
          className="min-h-11 items-center justify-center rounded-lg bg-primary px-4"
          onPress={() => setSafetyState({ allowed: true, scope: safetyScope })}
        >
          <Text className="font-semibold text-primary-foreground">
            I understand — continue
          </Text>
        </Pressable>
      </View>
    )
  }

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
        EwaTrade Store chat is for people aged 13 or older. Choose your own age
        range before sending a message or attachment.
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
          Store chat is not available to people under 13.
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
              : "Continue to chat"}
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
