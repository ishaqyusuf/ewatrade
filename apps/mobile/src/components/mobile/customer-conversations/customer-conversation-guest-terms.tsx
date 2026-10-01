import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { publicLegalUrl } from "@/lib/public-legal-url"
import { useCustomerTRPC } from "@/trpc/customer-client"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Linking } from "react-native"

export function CustomerConversationGuestTerms({
  onAllowedChange,
}: {
  onAllowedChange: (allowed: boolean) => void
}) {
  const trpc = useCustomerTRPC()
  const status = useQuery(
    trpc.serviceCommerce.mobileGuestTermsStatus.queryOptions(),
  )
  const accept = useMutation(
    trpc.serviceCommerce.mobileAcceptGuestTerms.mutationOptions(),
  )
  const [checked, setChecked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const termsUrl = publicLegalUrl("terms")

  useEffect(() => {
    onAllowedChange(!status.isFetching && status.data?.accepted === true)
  }, [onAllowedChange, status.data?.accepted, status.isFetching])

  if (!status.isFetching && status.data?.accepted) return null

  const recordAcceptance = async () => {
    if (!checked || !status.data?.effective || !status.data.version) return
    setError(null)
    try {
      await accept.mutateAsync({
        acceptedTerms: true,
        version: status.data.version,
      })
      await status.refetch()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Terms could not be accepted.",
      )
    }
  }

  return (
    <View className="mx-4 my-3 gap-3 rounded-xl border border-border bg-card p-4">
      <Text className="font-semibold text-foreground">Before you post</Text>
      {status.isLoading ? (
        <Text className="text-sm text-muted-foreground">
          Checking the current Terms…
        </Text>
      ) : status.data?.effective && status.data.version ? (
        <>
          <Text className="text-sm text-muted-foreground">
            Review the EwaTrade Terms (version {status.data.version}, effective{" "}
            {status.data.effectiveDate}) before sending a message or attachment.
          </Text>
          {termsUrl ? (
            <Pressable
              accessibilityRole="link"
              className="min-h-11 justify-center"
              onPress={() => void Linking.openURL(termsUrl)}
            >
              <Text className="font-semibold text-primary underline">
                Read Terms of Service
              </Text>
            </Pressable>
          ) : (
            <Text className="text-sm text-destructive">
              The public Terms page is unavailable.
            </Text>
          )}
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            className="min-h-11 justify-center"
            onPress={() => setChecked((value) => !value)}
          >
            <Text className="text-foreground">
              {checked ? "☑" : "☐"} I agree to the current EwaTrade Terms of
              Service.
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            className="min-h-11 items-center justify-center rounded-lg bg-primary px-4 disabled:opacity-50"
            disabled={!termsUrl || !checked || accept.isPending}
            onPress={() => void recordAcceptance()}
          >
            <Text className="font-semibold text-primary-foreground">
              {accept.isPending ? "Recording…" : "Agree and continue"}
            </Text>
          </Pressable>
        </>
      ) : (
        <Text className="text-sm text-muted-foreground">
          Posting is paused until the EwaTrade Terms are approved and effective.
          You can still read, report, or block this conversation.
        </Text>
      )}
      {status.isError || error ? (
        <Text className="text-sm text-destructive">
          {error ?? "Terms status is unavailable."}
        </Text>
      ) : null}
    </View>
  )
}
