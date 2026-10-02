import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { isLocalSessionToken } from "@/lib/session-store"
import { AnalyticsRuntime } from "@/runtime/analytics-runtime"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { View } from "react-native"
import { AuthActionButton, AuthBrandHeader } from "./auth-header"
import { MobileScreen } from "./screen"
import { StatusBanner } from "./status-banner"

type EligibleAgeBand = "AGE_13_TO_15" | "AGE_16_TO_17" | "ADULT"

const ageChoices: Array<{
  label: string
  value: EligibleAgeBand | "UNDER_13"
}> = [
  { label: "Under 13", value: "UNDER_13" },
  { label: "13–15", value: "AGE_13_TO_15" },
  { label: "16–17", value: "AGE_16_TO_17" },
  { label: "18 or older", value: "ADULT" },
]

export function AccountAgeStartupGate({
  children,
}: { children: React.ReactNode }) {
  const auth = useAuthContext()
  const trpc = useTRPC()
  const [ageChoice, setAgeChoice] = useState<
    EligibleAgeBand | "UNDER_13" | null
  >(null)
  const [error, setError] = useState<string | null>(null)
  const localQaSession = __DEV__ && isLocalSessionToken(auth.token)
  const ageStatus = useQuery(
    trpc.serviceCommerce.accountAgeStatus.queryOptions(undefined, {
      enabled: auth.isAuthenticated && !localQaSession,
      retry: false,
    }),
  )
  const declareAge = useMutation(
    trpc.serviceCommerce.accountDeclareAgeBand.mutationOptions(),
  )

  if (!auth.isAuthenticated) return children
  if (localQaSession || ageStatus.data?.eligible === true)
    return (
      <>
        {!localQaSession ? <AnalyticsRuntime /> : null}
        {children}
      </>
    )

  return (
    <MobileScreen contentClassName="justify-center gap-6">
      <AuthBrandHeader
        subtitle={
          ageStatus.isSuccess
            ? "EwaTrade is for people aged 13 or older. Choose your own age range before opening your workspace."
            : "Checking your saved age range before opening your workspace."
        }
        title={
          ageStatus.isSuccess ? "Confirm your age range" : "Checking your account"
        }
      />
      {ageStatus.isPending ? (
        <Text className="text-sm text-muted-foreground">
          Checking age status…
        </Text>
      ) : ageStatus.isError ? (
        <StatusBanner
          actionLabel="Try again"
          message="We could not verify your age range. Your workspace will stay closed until this check succeeds."
          onActionPress={() => void ageStatus.refetch()}
          title="Age check unavailable"
          tone="warning"
        />
      ) : (
        <View className="gap-3">
          {ageChoices.map((choice) => (
            <Pressable
              key={choice.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: ageChoice === choice.value }}
              className="min-h-11 flex-row items-center gap-3 rounded-lg border border-border px-3"
              onPress={() => setAgeChoice(choice.value)}
            >
              <Text className="text-foreground">
                {ageChoice === choice.value ? "◉" : "○"} {choice.label}
              </Text>
            </Pressable>
          ))}
          {ageChoice === "UNDER_13" ? (
            <Text className="text-sm text-muted-foreground">
              EwaTrade is not available to people under 13.
            </Text>
          ) : (
            <AuthActionButton
              disabled={!ageChoice || declareAge.isPending}
              onPress={() => {
                if (!ageChoice) return
                setError(null)
                void declareAge
                  .mutateAsync({ ageBand: ageChoice })
                  .then(() => ageStatus.refetch())
                  .catch((cause: unknown) =>
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Age range could not be saved.",
                    ),
                  )
              }}
            >
              {declareAge.isPending ? "Saving…" : "Continue"}
            </AuthActionButton>
          )}
          {error ? <Text className="text-destructive">{error}</Text> : null}
        </View>
      )}
      <AuthActionButton onPress={auth.signOutLocal}>Sign out</AuthActionButton>
    </MobileScreen>
  )
}
