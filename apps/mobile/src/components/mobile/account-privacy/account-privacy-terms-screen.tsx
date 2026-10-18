import { Text } from "@/components/ui/text"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { LegalAcceptancePanel } from "../legal-acceptance-panel"
import { MobileScreen } from "../screen"
import { StatusBanner } from "../status-banner"
import { QuietHeader } from "./quiet-settings"
import { useOpenPolicy } from "./use-open-policy"

/** Accept a new Terms version and acknowledge the Privacy Notice (Workshop 04). */
export function AccountPrivacyTermsScreen() {
  const router = useRouter()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { hasLegalPages, linkError, openPolicy } = useOpenPolicy()
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
        if (router.canGoBack()) router.back()
      },
    }),
  )
  const legal = legalStatus.data
  const error = acceptLegal.error?.message ?? linkError
  return (
    <MobileScreen contentClassName="gap-5 px-[18px] py-2">
      <QuietHeader
        backLabel="Account"
        onBack={() => router.back()}
        title="Terms and privacy"
      />
      {legalStatus.error ? (
        <StatusBanner
          title="Couldn’t load the current version"
          message={legalStatus.error.message}
          tone="destructive"
          actionLabel="Retry"
          actionDisabled={legalStatus.isFetching}
          onActionPress={() => void legalStatus.refetch()}
        />
      ) : legalStatus.isPending ? (
        <Text className="px-1 text-sm text-muted-foreground">
          Checking your acceptance…
        </Text>
      ) : !hasLegalPages ? (
        <StatusBanner
          message="Terms and Privacy are unavailable in this build. Acceptance is disabled until those pages can be reviewed."
          tone="warning"
        />
      ) : legal?.version && legal.effectiveDate ? (
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
        <Text className="px-1 text-sm leading-6 text-muted-foreground">
          There is no new version to accept.
        </Text>
      )}
      {error ? <StatusBanner message={error} tone="destructive" /> : null}
    </MobileScreen>
  )
}
