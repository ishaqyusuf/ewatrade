import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { getWebUrl } from "@/lib/base-url"
import { publicLegalUrl } from "@/lib/public-legal-url"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Linking } from "react-native"
import { ActionButton } from "../action-button"
import { ToggleRow } from "../green-till/kit"
import { StatusBanner } from "../status-banner"
export function SetupPrerequisites({
  terms,
  finance,
  disabled,
  onReady,
}: {
  terms: boolean
  finance: boolean
  disabled: boolean
  onReady: () => void
}) {
  return (
    <View className="gap-3">
      {terms ? <SetupTerms disabled={disabled} onReady={onReady} /> : null}
      {finance ? (
        <StatusBanner
          title="Set up Finance for opening balances"
          message="Your customers can be added first. Set up your Finance book on the dashboard, then return and refresh to record customer, cash and bank balances."
          actionLabel="Open Finance"
          onActionPress={() => void Linking.openURL(`${getWebUrl()}/finance`)}
          tone="warning"
        />
      ) : null}
    </View>
  )
}
function SetupTerms({
  disabled,
  onReady,
}: { disabled: boolean; onReady: () => void }) {
  const trpc = useTRPC()
  const state = useQuery(
    trpc.accountPrivacy.legalStatus.queryOptions(undefined, {
      enabled: !disabled,
      retry: false,
    }),
  )
  const accept = useMutation(
    trpc.accountPrivacy.acceptLegalDocuments.mutationOptions(),
  )
  const [terms, setTerms] = useState(false)
  const [privacy, setPrivacy] = useState(false)
  const [error, setError] = useState(false)
  const version = state.data?.effective ? state.data.version : null
  return (
    <View className="gap-3 rounded-[18px] bg-tint-sky p-3">
      <Text className="text-sm font-bold text-tint-sky-foreground">
        Accept the ẸwáTrade Terms
      </Text>
      <Text className="text-xs text-tint-sky-foreground">
        Products and services require the current Terms. Customers can still be
        added.
      </Text>
      {version ? (
        <>
          <ActionButton
            variant="outline"
            onPress={() => {
              const url = publicLegalUrl("terms")
              if (url) void Linking.openURL(url)
            }}
          >
            Read Terms of Service
          </ActionButton>
          <ActionButton
            variant="outline"
            onPress={() => {
              const url = publicLegalUrl("privacy")
              if (url) void Linking.openURL(url)
            }}
          >
            Read Privacy Notice
          </ActionButton>
          <ToggleRow
            title="I agree to the current Terms"
            value={terms}
            onValueChange={setTerms}
            disabled={disabled || accept.isPending}
          />
          <ToggleRow
            title="I acknowledge the Privacy Notice"
            value={privacy}
            onValueChange={setPrivacy}
            disabled={disabled || accept.isPending}
          />
          <ActionButton
            isLoading={accept.isPending}
            disabled={disabled || !terms || !privacy}
            onPress={async () => {
              setError(false)
              try {
                await accept.mutateAsync({
                  version,
                  surface: "mobile",
                  acceptedTerms: true,
                  acknowledgedPrivacyNotice: true,
                })
                onReady()
              } catch {
                setError(true)
              }
            }}
          >
            Agree and continue
          </ActionButton>
        </>
      ) : (
        <Text className="text-xs text-tint-sky-foreground">
          {state.isPending && !disabled
            ? "Checking the Terms…"
            : "Reconnect to load the current Terms before adding catalog records."}
        </Text>
      )}
      {state.isError || error ? (
        <ActionButton
          variant="outline"
          disabled={disabled}
          onPress={() => void state.refetch()}
        >
          Try again
        </ActionButton>
      ) : null}
    </View>
  )
}
