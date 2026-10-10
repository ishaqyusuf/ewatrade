import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { getMobileRoleLabel } from "@/lib/mobile-roles"
import { type PublicLegalPath, publicLegalUrl } from "@/lib/public-legal-url"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useState } from "react"
import { Alert, Linking } from "react-native"
import { HeroCard } from "./green-till/hero-card"
import { ListCard, RecordRow, SectionHeader } from "./green-till/kit"
import { ScreenBar } from "./green-till/screen-bar"
import { LegalAcceptancePanel } from "./legal-acceptance-panel"
import { MobileScreen } from "./screen"
import { StatusBanner } from "./status-banner"

export function AccountPrivacyScreen() {
  const router = useRouter()
  const { profile } = useAuthContext()
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
  const statusError = request.error ?? deletionIntake.error ?? legalStatus.error
  const actionError =
    acceptLegal.error?.message ?? submit.error?.message ?? linkError
  const legal = legalStatus.data
  const legalMeta = legalStatus.isPending
    ? "Checking your acceptance…"
    : legalStatus.isError
      ? "Acceptance status unavailable"
      : legal?.accepted
        ? "Current version accepted"
        : "Read the current document"
  const requestDeletion = () =>
    Alert.alert(
      "Request account deletion?",
      "We will verify your request and review associated data. This does not immediately erase your account or close your business. An owner may need to arrange a handover; records requiring retention will be explained in your outcome. You may be asked to sign in again.",
      [
        { text: "Keep account", style: "cancel" },
        {
          text: "Request deletion",
          style: "destructive",
          onPress: () => submit.mutate({ confirmation: "DELETE MY ACCOUNT" }),
        },
      ],
    )
  return (
    <MobileScreen contentClassName="gap-4 px-[18px] py-4">
      <ScreenBar
        kind="back"
        label="Back"
        onPress={() => router.back()}
        title="Account and privacy"
      />
      <HeroCard
        label="Signed in as"
        title={profile?.name || "Your account"}
        sub={profile?.email || "Signed-in account"}
        pill={
          profile?.role
            ? { label: getMobileRoleLabel(profile.role) }
            : undefined
        }
      />
      {statusError ? (
        <StatusBanner
          title="Couldn’t load your privacy status"
          message={statusError.message}
          tone="destructive"
          actionLabel="Retry"
          actionDisabled={
            request.isFetching ||
            deletionIntake.isFetching ||
            legalStatus.isFetching
          }
          onActionPress={() => {
            void request.refetch()
            void deletionIntake.refetch()
            void legalStatus.refetch()
          }}
        />
      ) : null}
      <View>
        <SectionHeader title="Terms" />
        <ListCard>
          <RecordRow
            avatar={{ icon: "FileText", tint: "sky" }}
            title="Terms of Service"
            meta={legalMeta}
            onPress={() => void openPolicy("terms")}
            status={
              <Icon
                name="ChevronRight"
                className="size-[16px] text-muted-foreground"
              />
            }
          />
          <RecordRow
            avatar={{ icon: "ShieldCheck", tint: "sky" }}
            title="Privacy Notice"
            meta={legal?.accepted ? "Current version acknowledged" : legalMeta}
            onPress={() => void openPolicy("privacy")}
            status={
              <Icon
                name="ChevronRight"
                className="size-[16px] text-muted-foreground"
              />
            }
          />
        </ListCard>
      </View>
      {legal?.effective &&
      legal.version &&
      legal.effectiveDate &&
      !legal.accepted ? (
        hasLegalPages ? (
          <LegalAcceptancePanel
            key={legal.version}
            version={legal.version}
            effectiveDate={legal.effectiveDate}
            accepted={legal.accepted}
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
          <StatusBanner
            message="Terms and Privacy are unavailable in this build. Acceptance is disabled until those pages can be reviewed."
            tone="warning"
          />
        )
      ) : null}
      <View>
        <SectionHeader title="Your account" />
        <ListCard>
          <RecordRow
            avatar={{
              icon: request.data ? "Clock" : "Trash",
              tint: request.data ? "amber" : "rose",
            }}
            title={
              request.data
                ? "Deletion requested"
                : submit.isPending
                  ? "Submitting request…"
                  : "Request account deletion"
            }
            meta={
              request.data
                ? [
                    request.data.status.toLowerCase().replaceAll("_", " "),
                    "Received doesn’t mean erased",
                  ]
                : request.isPending || deletionIntake.isPending
                  ? "Checking availability…"
                  : deletionIntake.data?.available
                    ? "Review what happens before confirming"
                    : "See deletion information for guidance"
            }
            onPress={
              request.data
                ? undefined
                : !request.isPending &&
                    !submit.isPending &&
                    deletionIntake.data?.available
                  ? requestDeletion
                  : () => void openPolicy("delete-account")
            }
            status={
              request.data ? undefined : (
                <Icon
                  name="ChevronRight"
                  className="size-[16px] text-muted-foreground"
                />
              )
            }
          />
          <RecordRow
            avatar={{ icon: "HelpCircle", tint: "mint" }}
            title="Support"
            meta="Questions about your data"
            onPress={() => void openPolicy("support")}
            status={
              <Icon
                name="ChevronRight"
                className="size-[16px] text-muted-foreground"
              />
            }
          />
        </ListCard>
        <Text className="mt-3 px-1 text-xs leading-5 text-muted-foreground">
          Leaving a business and deleting your account are different. Ask the
          owner to remove you from a business.
        </Text>
        {request.data ? (
          <Text className="mt-2 px-1 text-xs leading-5 text-muted-foreground">
            Request reference: {request.data.id}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="link"
          className="min-h-11 justify-center px-1"
          onPress={() => void openPolicy("delete-account")}
        >
          <Text className="text-sm font-semibold text-primary">
            How account deletion works
          </Text>
        </Pressable>
      </View>
      {actionError ? (
        <StatusBanner message={actionError} tone="destructive" />
      ) : null}
    </MobileScreen>
  )
}
