import { LegalAcceptancePanel } from "@/components/mobile/legal-acceptance-panel"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { publicLegalUrl } from "@/lib/public-legal-url"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Linking } from "react-native"

export function CustomerConversationAccountTerms({
  onAllowedChange,
}: {
  onAllowedChange: (allowed: boolean) => void
}) {
  const trpc = useTRPC()
  const status = useQuery(
    trpc.accountPrivacy.legalStatus.queryOptions(undefined, { retry: false }),
  )
  const accept = useMutation(
    trpc.accountPrivacy.acceptLegalDocuments.mutationOptions(),
  )
  const [error, setError] = useState<string | null>(null)
  const termsUrl = publicLegalUrl("terms")
  const privacyUrl = publicLegalUrl("privacy")

  useEffect(() => {
    onAllowedChange(
      status.data?.effective === true && status.data.accepted === true,
    )
  }, [onAllowedChange, status.data?.accepted, status.data?.effective])

  if (status.data?.effective && status.data.accepted) return null

  return (
    <View className="mx-4 my-3 gap-3 rounded-xl border border-border bg-card p-4">
      <Text className="font-semibold text-foreground">Before you post</Text>
      {status.data?.effective &&
      status.data.version &&
      status.data.effectiveDate ? (
        termsUrl && privacyUrl ? (
          <LegalAcceptancePanel
            key={status.data.version}
            version={status.data.version}
            effectiveDate={status.data.effectiveDate}
            accepted={false}
            pending={accept.isPending}
            onOpenPolicy={(path) => {
              const url = publicLegalUrl(path)
              if (url)
                void Linking.openURL(url).catch(() =>
                  setError("The policy page could not open."),
                )
            }}
            onAccept={async (version) => {
              setError(null)
              try {
                await accept.mutateAsync({
                  version,
                  surface: "mobile",
                  acceptedTerms: true,
                  acknowledgedPrivacyNotice: true,
                })
                await status.refetch()
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Terms could not be accepted.",
                )
              }
            }}
          />
        ) : (
          <Text className="text-sm text-destructive">
            The public Terms and Privacy pages are unavailable. Posting remains
            paused.
          </Text>
        )
      ) : (
        <Text className="text-sm text-muted-foreground">
          Posting is paused until the EwaTrade Terms are approved and effective.
          You can still read, report, or block this conversation.
        </Text>
      )}
      {status.isError || error ? (
        <Text accessibilityRole="alert" className="text-sm text-destructive">
          {error ?? "Terms status is unavailable."}
        </Text>
      ) : null}
    </View>
  )
}
