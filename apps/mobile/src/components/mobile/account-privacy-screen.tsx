import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { getMobileRoleLabel } from "@/lib/mobile-roles"
import { isLocalSessionToken } from "@/lib/session-store"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import {
  QuietGroup,
  QuietHeader,
  QuietRow,
} from "./account-privacy/quiet-settings"
import { useOpenPolicy } from "./account-privacy/use-open-policy"
import { MobileScreen } from "./screen"
import { StatusBanner } from "./status-banner"

export const LEAVE_BUSINESS_NOTE =
  "Leaving a business and deleting your account are different. Ask the owner to remove you from a business."

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? [parts[0], parts.at(-1)] : parts
  return letters.map((part) => part?.[0]?.toUpperCase() ?? "").join("") || "?"
}

export function AccountPrivacyScreen() {
  const router = useRouter()
  const { profile, token } = useAuthContext()
  const trpc = useTRPC()
  const { hasLegalPages, linkError, openPolicy } = useOpenPolicy()
  const legalStatus = useQuery(
    trpc.accountPrivacy.legalStatus.queryOptions(undefined, {
      retry: false,
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
  const statusError = request.error ?? deletionIntake.error ?? legalStatus.error
  const legal = legalStatus.data
  const needsAcceptance = Boolean(
    legal?.effective && legal.version && legal.effectiveDate && !legal.accepted,
  )
  const canAccept = needsAcceptance && hasLegalPages
  const legalValue = (accepted: string) =>
    legalStatus.isPending
      ? "Checking…"
      : legalStatus.isError
        ? "Unavailable"
        : legal?.accepted
          ? accepted
          : canAccept
            ? "Review"
            : undefined
  const name = profile?.name || "Your account"
  return (
    <MobileScreen contentClassName="gap-6 px-[18px] py-2">
      <QuietHeader
        backLabel="Back"
        onBack={() => router.back()}
        title="Account and privacy"
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
      <View className="gap-3">
        <QuietGroup>
          <QuietRow
            leading={
              <View className="size-10 items-center justify-center rounded-full bg-tint-lilac">
                <Text className="text-sm font-extrabold text-tint-lilac-foreground">
                  {initialsOf(name)}
                </Text>
              </View>
            }
            title={name}
            sub={profile?.email || "Signed-in account"}
            value={profile?.role ? getMobileRoleLabel(profile.role) : undefined}
          />
        </QuietGroup>
        {canAccept && legal?.effectiveDate ? (
          <QuietGroup>
            <QuietRow
              icon="TriangleAlert"
              tone="attention"
              title="New Terms version"
              sub={`Effective ${legal.effectiveDate}`}
              value="Review"
              onPress={() => router.push("/account-privacy-terms")}
            />
          </QuietGroup>
        ) : null}
        {needsAcceptance && !hasLegalPages ? (
          <StatusBanner
            message="Terms and Privacy are unavailable in this build. Acceptance is disabled until those pages can be reviewed."
            tone="warning"
          />
        ) : null}
      </View>
      <QuietGroup title="Connected">
        <QuietRow
          icon="WhatsApp"
          title="Assistant on WhatsApp"
          onPress={() => router.push("/assistant-whatsapp")}
        />
        {token && !isLocalSessionToken(token) && !token.startsWith("qas_") ? (
          <QuietRow
            icon="FileText"
            title="Your assistant data"
            sub="Download private chats and retained files"
            onPress={() => router.push("/assistant-data")}
          />
        ) : null}
      </QuietGroup>
      <QuietGroup title="Legal">
        <QuietRow
          icon="FileText"
          title="Terms of Service"
          value={legalValue("Accepted")}
          onPress={() =>
            canAccept
              ? router.push("/account-privacy-terms")
              : void openPolicy("terms")
          }
        />
        <QuietRow
          icon="ShieldCheck"
          title="Privacy Notice"
          value={legalValue("Acknowledged")}
          onPress={() =>
            canAccept
              ? router.push("/account-privacy-terms")
              : void openPolicy("privacy")
          }
        />
      </QuietGroup>
      <QuietGroup title="Help">
        <QuietRow
          icon="HelpCircle"
          title="Questions about your data"
          onPress={() => void openPolicy("support")}
        />
      </QuietGroup>
      <QuietGroup footer={LEAVE_BUSINESS_NOTE}>
        {request.data ? (
          <QuietRow
            icon="Clock"
            title="Deletion requested"
            value={request.data.status.toLowerCase().replaceAll("_", " ")}
            onPress={() => router.push("/account-privacy-delete")}
          />
        ) : (
          <QuietRow
            chevron={false}
            tone="danger"
            title="Delete account"
            onPress={() => router.push("/account-privacy-delete")}
          />
        )}
      </QuietGroup>
      {linkError ? (
        <StatusBanner message={linkError} tone="destructive" />
      ) : null}
    </MobileScreen>
  )
}
