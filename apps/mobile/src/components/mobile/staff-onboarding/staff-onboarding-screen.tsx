import {
  ActionButton,
  MobileScreen,
  SecondaryOperationalRow,
  SecondarySheetHeader,
  StatusBadge,
  StatusBanner,
} from "@/components/mobile"
import { useAuthContext } from "@/hooks/use-auth"
import { ClassicStaffOnboardingScreen } from "@/components/mobile/appearances/classic/staff-onboarding-screen"
import { MarketDayStaffOnboardingScreen } from "@/components/mobile/appearances/market-day/staff-onboarding-screen"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import { getMobileRoleLabel, isInvitedStaffProfile } from "@/lib/mobile-roles"
import { useBusinessStore } from "@/store/businessStore"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Redirect, useLocalSearchParams, useRouter } from "expo-router"
import { useMemo, useState } from "react"
import { View } from "react-native"

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
    () => !!session && trimmedName.length > 0,
    [session, trimmedName],
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
      <MobileScreen contentClassName="justify-center gap-6">
        <SecondarySheetHeader
          description="Sign in with your invited email address to accept this staff access."
          icon="ShieldCheck"
          title="Staff invitation"
        />

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
      </MobileScreen>
    )
  }

  if (!isAuthenticated) {
    return <Redirect href="/login" />
  }

  if (!isInvitedStaffProfile(profile)) {
    if (inviteToken) {
      return (
        <MobileScreen contentClassName="justify-center gap-6">
          <SecondarySheetHeader
            description="This invite must be accepted with the email address that was added by the business owner."
            icon="ShieldCheck"
            title="Wrong account"
          />

          <ActionButton onPress={() => router.replace("/login")}>
            Sign in with invited email
          </ActionButton>
          <StatusBanner
            icon="TriangleAlert"
            message="This invite must be accepted with the email address that was added by the business owner."
            title="Wrong account"
            tone="warning"
          />
        </MobileScreen>
      )
    }

    return <Redirect href="/dashboard" />
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
