import {
  ActionButton,
  SecondaryOperationalRow,
  StatusBadge,
  StatusBanner,
} from "@/components/mobile"
import { ClassicStaffOnboardingScreen } from "@/components/mobile/appearances/classic/staff-onboarding-screen"
import { MarketDayStaffOnboardingScreen } from "@/components/mobile/appearances/market-day/staff-onboarding-screen"
import { AuthFlowScreen } from "@/components/mobile/green-till/auth-screen"
import { SalesRepExampleStage } from "@/components/mobile/green-till/auth-stage"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { getMobileRoleLabel, isInvitedStaffProfile } from "@/lib/mobile-roles"
import { useBusinessStore } from "@/store/businessStore"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Redirect, useLocalSearchParams, useRouter } from "expo-router"
import { useMemo, useState } from "react"
import { View } from "react-native"

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

type CompletedStaffOnboarding = {
  role: string
  status: string
  tenant: {
    id: string
    name: string
    slug: string
  }
  user: {
    displayName: string
    email: string
    id: string
    name: string
  }
}

type ResolvedStaffInvite = {
  email: string
  expiresAt: Date
  membershipId: string | null
  role: string
  tenant: {
    id: string
    name: string
    slug: string
  }
}

function getSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? null

  return value ?? null
}

export function StaffOnboardingScreen() {
  const design = useMobileDesign("staff-onboarding")
  const Presentation =
    design === "market-day"
      ? MarketDayStaffOnboardingScreen
      : ClassicStaffOnboardingScreen
  const trpc = useTRPC()
  const router = useRouter()
  const params = useLocalSearchParams<{ inviteToken?: string }>()
  const { applyAuthenticatedSession, isAuthenticated, profile, session } =
    useAuthContext()
  const ensureBusiness = useBusinessStore((state) => state.ensureBusiness)
  const inviteToken = getSearchParam(params.inviteToken)?.trim() ?? ""
  const [name, setName] = useState(profile?.name ?? "")
  const [displayName, setDisplayName] = useState(profile?.name ?? "")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [ageChoice, setAgeChoice] = useState<
    EligibleAgeBand | "UNDER_13" | null
  >(null)
  const [ageError, setAgeError] = useState<string | null>(null)
  const ageStatus = useQuery(
    trpc.serviceCommerce.accountAgeStatus.queryOptions(undefined, {
      enabled: isAuthenticated && isInvitedStaffProfile(profile),
      retry: false,
    }),
  )
  const declareAge = useMutation(
    trpc.serviceCommerce.accountDeclareAgeBand.mutationOptions(),
  )
  const inviteQuery = useQuery(
    trpc.retailOps.resolveStaffInviteToken.queryOptions(
      { token: inviteToken },
      {
        enabled: !!inviteToken,
        retry: false,
      },
    ),
  )
  const resolvedInvite = inviteQuery.data as ResolvedStaffInvite | undefined
  const trimmedName = name.trim()
  const trimmedDisplayName = displayName.trim()
  const canSubmit = useMemo(
    () =>
      !!session && trimmedName.length > 0 && ageStatus.data?.eligible === true,
    [ageStatus.data?.eligible, session, trimmedName],
  )
  const completeStaffOnboardingMutation = useMutation(
    trpc.retailOps.completeStaffOnboarding.mutationOptions({
      onError: (error) => {
        setSubmitError(error.message)
      },
      onSuccess: (result) => {
        if (!session) return

        const completed = result as CompletedStaffOnboarding
        const business = ensureBusiness({
          id: completed.tenant.id,
          name: completed.tenant.name,
        })

        applyAuthenticatedSession({
          ...session,
          profile: {
            ...session.profile,
            businessId: completed.tenant.id,
            businessName: business.name,
            businessSlug: completed.tenant.slug,
            email: completed.user.email,
            id: completed.user.id,
            name:
              completed.user.displayName ||
              completed.user.name ||
              session.profile.name,
            role: completed.role,
            status: completed.status,
          },
        })
      },
    }),
  )

  if (!isAuthenticated && inviteToken) {
    return (
      <AuthFlowScreen
        stage={<SalesRepExampleStage />}
        appearanceScreen="staff-onboarding"
        eyebrow="Staff invitation"
        title="Staff invitation"
        subtitle="Sign in with your invited email address to accept this staff access."
      >
        {inviteQuery.isPending ? (
          <View className="border-y border-border py-5">
            <StatusBadge
              icon="Clock"
              label="Checking invitation"
              tone="muted"
            />
          </View>
        ) : inviteQuery.isError ? (
          <StatusBanner
            icon="TriangleAlert"
            message={inviteQuery.error.message}
            title="Invitation unavailable"
            tone="destructive"
          />
        ) : resolvedInvite ? (
          <SecondaryOperationalRow
            className="border-y"
            detail={resolvedInvite.email}
            icon="Mail"
            title={resolvedInvite.tenant.name}
            trailing={
              <StatusBadge
                className="self-start"
                label={getMobileRoleLabel(resolvedInvite.role)}
                tone="primary"
              />
            }
          />
        ) : null}

        <ActionButton
          disabled={inviteQuery.isPending}
          isLoading={inviteQuery.isPending}
          loadingLabel="Checking invitation"
          onPress={() =>
            router.push({
              pathname: "/login",
              params: resolvedInvite?.email
                ? { email: resolvedInvite.email }
                : undefined,
            })
          }
        >
          Sign in to accept invite
        </ActionButton>
      </AuthFlowScreen>
    )
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />
  }

  if (!isInvitedStaffProfile(profile)) {
    if (inviteToken) {
      return (
        <AuthFlowScreen
          stage={<SalesRepExampleStage />}
          appearanceScreen="staff-onboarding"
          eyebrow="Staff invitation"
          title="Wrong account"
          subtitle="This invite must be accepted with the email address that was added by the business owner."
        >
          <ActionButton onPress={() => router.replace("/login")}>
            Sign in with invited email
          </ActionButton>
          <StatusBanner
            icon="TriangleAlert"
            message="This invite must be accepted with the email address that was added by the business owner."
            title="Wrong account"
            tone="warning"
          />
        </AuthFlowScreen>
      )
    }

    return <Redirect href="/dashboard" />
  }

  if (ageStatus.isPending || ageStatus.isError || !ageStatus.data?.eligible) {
    return (
      <AuthFlowScreen
        stage={<SalesRepExampleStage />}
        appearanceScreen="staff-onboarding"
        eyebrow="Staff invitation"
        title="Before accepting staff access"
        subtitle="Staff access is for people aged 13 or older. Choose your own age range before entering staff details."
      >
        {ageStatus.isPending ? (
          <StatusBadge icon="Clock" label="Checking age status" tone="muted" />
        ) : ageStatus.isError ? (
          <ActionButton onPress={() => void ageStatus.refetch()}>
            Retry age check
          </ActionButton>
        ) : (
          <View className="gap-3">
            {ageChoices.map((choice) => (
              <Pressable
                key={choice.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: ageChoice === choice.value }}
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
                Staff access is not available to people under 13.
              </Text>
            ) : (
              <ActionButton
                disabled={!ageChoice || declareAge.isPending}
                isLoading={declareAge.isPending}
                loadingLabel="Saving age range"
                onPress={() => {
                  if (!ageChoice) return
                  setAgeError(null)
                  void declareAge
                    .mutateAsync({ ageBand: ageChoice })
                    .then(() => ageStatus.refetch())
                    .catch((error: unknown) =>
                      setAgeError(
                        error instanceof Error
                          ? error.message
                          : "Age range could not be saved.",
                      ),
                    )
                }}
              >
                Continue to staff setup
              </ActionButton>
            )}
          </View>
        )}
        {ageStatus.isError || ageError ? (
          <StatusBanner
            icon="TriangleAlert"
            message={ageError ?? "Age status is unavailable."}
            title="Unable to continue"
            tone="destructive"
          />
        ) : null}
      </AuthFlowScreen>
    )
  }

  const submit = () => {
    if (!canSubmit || completeStaffOnboardingMutation.isPending) return

    setSubmitError(null)
    completeStaffOnboardingMutation.mutate({
      displayName: trimmedDisplayName || undefined,
      name: trimmedName || undefined,
    })
  }

  return (
    <Presentation
      businessName={profile?.businessName ?? "Invited workspace"}
      canSubmit={canSubmit}
      displayName={displayName}
      email={profile?.email ?? "Invited email account"}
      isSubmitting={completeStaffOnboardingMutation.isPending}
      name={name}
      onChangeDisplayName={setDisplayName}
      onChangeName={setName}
      onSubmit={submit}
      roleLabel={getMobileRoleLabel(profile?.role)}
      submitError={submitError}
    />
  )
}
