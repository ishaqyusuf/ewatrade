import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { type PublicLegalPath, publicLegalUrl } from "@/lib/public-legal-url"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useState } from "react"
import { Alert, Linking } from "react-native"
import { LegalAcceptancePanel } from "./legal-acceptance-panel"
import { MobileScreen } from "./screen"
import { SettingsScreen } from "./settings-screen"

const policyLinks = [
  ["terms", "Terms of Service"],
  ["privacy", "Privacy Notice"],
  ["support", "Support"],
  ["delete-account", "Deletion information"],
] as const

export function AccountPrivacyScreen() {
  const router = useRouter()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [linkError, setLinkError] = useState<string | null>(null)
  const legalStatus = useQuery(
    trpc.accountPrivacy.legalStatus.queryOptions(undefined, {
      retry: false,
    }),
  )
  const acceptLegal = useMutation(
    trpc.accountPrivacy.acceptLegalDocuments.mutationOptions({
      onSuccess: () => {
        void legalStatus.refetch()
        void queryClient.invalidateQueries(
          trpc.storeSubscriptions.catalog.queryFilter(),
        )
      },
    }),
  )
  const request = useQuery(
    trpc.accountPrivacy.deletionRequest.queryOptions(undefined, {
      retry: false,
    }),
  )
  const deletionIntake = useQuery(
    trpc.accountPrivacy.deletionIntakeAvailability.queryOptions(undefined, {
      retry: false,
    }),
  )
  const submit = useMutation(
    trpc.accountPrivacy.requestDeletion.mutationOptions({
      onSuccess: () => {
        void request.refetch()
      },
    }),
  )
  const hasLegalPages = Boolean(publicLegalUrl("terms"))
  const openPolicy = async (path: PublicLegalPath) => {
    const url = publicLegalUrl(path)
    if (!url) {
      setLinkError("Policy pages are not available in this build.")
      return
    }
    try {
      await Linking.openURL(url)
      setLinkError(null)
    } catch {
      setLinkError("The page could not open. Try again when you are online.")
    }
  }
  return (
    <MobileScreen contentClassName="gap-4 px-[18px] py-6">
      <Pressable
        accessibilityRole="button"
        className="min-h-11 justify-center"
        onPress={() => router.back()}
      >
        <Text className="font-semibold text-primary">Back</Text>
      </Pressable>
      <SettingsScreen
        title={
          request.data ? "Deletion request received" : "Account and privacy"
        }
        sub={
          request.data
            ? "Your account has not been erased."
            : "Your account, legal documents and personal information"
        }
        loading={request.isPending}
      />
      <Text className="text-base leading-6 text-muted-foreground">
        Request deletion of your EwaTrade account and associated personal
        information. This is different from leaving one business or closing a
        workspace. Other people’s business records must remain protected. An
        owner may need to arrange a handover; records requiring retention must
        be explained in your outcome.
      </Text>
      {legalStatus.data?.effective &&
      legalStatus.data.version &&
      legalStatus.data.effectiveDate ? (
        hasLegalPages ? (
          <LegalAcceptancePanel
            key={legalStatus.data.version}
            version={legalStatus.data.version}
            effectiveDate={legalStatus.data.effectiveDate}
            accepted={legalStatus.data.accepted}
            pending={acceptLegal.isPending}
            onOpenPolicy={(path) => void openPolicy(path)}
            onAccept={(version) =>
              acceptLegal.mutate({
                version,
                surface: "mobile",
                acceptedTerms: true,
                acknowledgedPrivacyNotice: true,
              })
            }
          />
        ) : (
          <Text accessibilityRole="alert" className="text-destructive">
            Terms and Privacy are unavailable in this build. Acceptance is
            disabled until those pages can be reviewed.
          </Text>
        )
      ) : null}
      {request.data ? (
        <View className="gap-2">
          <Text className="font-semibold text-foreground">
            Request {request.data.id}
          </Text>
          <Text className="text-muted-foreground">
            Status: {request.data.status.toLowerCase().replaceAll("_", " ")}
          </Text>
          <Text className="text-muted-foreground">
            A received request does not mean your information has been erased.
          </Text>
        </View>
      ) : deletionIntake.data?.available ? (
        <Pressable
          accessibilityRole="button"
          disabled={submit.isPending || request.isPending}
          className="min-h-12 justify-center rounded-lg bg-destructive px-4 disabled:opacity-50"
          onPress={() =>
            Alert.alert(
              "Request account deletion?",
              "We will verify your request and review associated data. This does not immediately erase your account or close your business.",
              [
                { text: "Keep account", style: "cancel" },
                {
                  text: "Request deletion",
                  style: "destructive",
                  onPress: () =>
                    submit.mutate({ confirmation: "DELETE MY ACCOUNT" }),
                },
              ],
            )
          }
        >
          <Text className="font-semibold text-destructive-foreground">
            {submit.isPending
              ? "Submitting request…"
              : "Request account deletion"}
          </Text>
        </Pressable>
      ) : (
        <Text className="text-sm leading-5 text-muted-foreground">
          {deletionIntake.isPending
            ? "Checking account deletion request availability…"
            : "Account deletion requests are not yet available. See Deletion information or Support below for current guidance."}
        </Text>
      )}
      {submit.error ||
      request.error ||
      deletionIntake.error ||
      legalStatus.error ||
      acceptLegal.error ||
      linkError ? (
        <Text accessibilityRole="alert" className="text-destructive">
          {acceptLegal.error?.message ??
            legalStatus.error?.message ??
            submit.error?.message ??
            request.error?.message ??
            deletionIntake.error?.message ??
            linkError}
        </Text>
      ) : null}
      <Text className="text-sm leading-5 text-muted-foreground">
        You may be asked to sign in again to verify this sensitive request.
      </Text>
      {policyLinks.map(([path, label]) => (
        <Pressable
          key={path}
          accessibilityRole="link"
          className="min-h-11 justify-center"
          onPress={() => void openPolicy(path)}
        >
          <Text className="font-semibold text-primary underline">{label}</Text>
        </Pressable>
      ))}
    </MobileScreen>
  )
}
