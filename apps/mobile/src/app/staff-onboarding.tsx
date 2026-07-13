import {
  ActionButton,
  MobileScreen,
  StatusBadge,
  StatusBanner,
} from "@/components/mobile"
import { FormField } from "@/components/mobile/form-field"
import { Icon } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
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

function isInvitedStaff(profile: { role?: string; status?: string } | null) {
  const role = profile?.role?.trim().toUpperCase()
  const status = profile?.status?.trim().toUpperCase()

  return (
    status === "INVITED" &&
    (role === "CASHIER" || role === "MANAGER" || role === "OPERATOR")
  )
}

function getSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? null

  return value ?? null
}

function getRoleLabel(role: string | undefined) {
  const normalizedRole = role?.trim().toUpperCase()

  if (normalizedRole === "CASHIER") return "Attendant"
  if (normalizedRole === "OPERATOR") return "Operator"
  if (normalizedRole === "MANAGER") return "Manager"

  return role ?? "Staff"
}

export default function StaffOnboardingRoute() {
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
    () =>
      !!session && (trimmedName.length > 0 || trimmedDisplayName.length > 0),
    [session, trimmedDisplayName, trimmedName],
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
        <View className="gap-4">
          <View className="h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Icon className="size-xl text-primary" name="ShieldCheck" />
          </View>
          <View className="gap-2">
            <Text className="text-3xl font-bold text-foreground">
              Staff invitation
            </Text>
            <Text className="text-base leading-6 text-muted-foreground">
              Sign in with your invited email address to accept this staff
              access.
            </Text>
          </View>
        </View>

        <View className="gap-3 rounded-2xl border border-border bg-card p-4">
          {inviteQuery.isPending ? (
            <StatusBadge
              icon="Clock"
              label="Checking invitation"
              tone="muted"
            />
          ) : inviteQuery.isError ? (
            <StatusBanner
              icon="TriangleAlert"
              message={inviteQuery.error.message}
              title="Invitation unavailable"
              tone="destructive"
            />
          ) : resolvedInvite ? (
            <>
              <Text className="text-base font-bold text-foreground">
                {resolvedInvite.tenant.name}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {resolvedInvite.email}
              </Text>
              <StatusBadge
                className="self-start"
                label={getRoleLabel(resolvedInvite.role)}
                tone="primary"
              />
            </>
          ) : null}
        </View>

        <ActionButton
          disabled={inviteQuery.isPending}
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

  if (!isInvitedStaff(profile)) {
    if (inviteToken) {
      return (
        <MobileScreen contentClassName="justify-center gap-6">
          <View className="gap-4">
            <View className="h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Icon className="size-xl text-primary" name="ShieldCheck" />
            </View>
            <View className="gap-2">
              <Text className="text-3xl font-bold text-foreground">
                Wrong account
              </Text>
              <Text className="text-base leading-6 text-muted-foreground">
                This invite must be accepted with the email address that was
                added by the business owner.
              </Text>
            </View>
          </View>

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
    <MobileScreen contentClassName="justify-center gap-6">
      <View className="gap-4">
        <View className="h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Icon className="size-xl text-primary" name="ShieldCheck" />
        </View>
        <View className="gap-2">
          <Text className="text-3xl font-bold text-foreground">
            Finish staff setup
          </Text>
          <Text className="text-base leading-6 text-muted-foreground">
            Confirm the name your team will see when you record sales.
          </Text>
        </View>
      </View>

      <View className="gap-4">
        <FormField
          autoCapitalize="words"
          label="Full name"
          onChangeText={setName}
          placeholder="Enter your full name"
          value={name}
        />
        <FormField
          autoCapitalize="words"
          helper="Optional. This can be the short name shown on sales."
          label="Display name"
          onChangeText={setDisplayName}
          placeholder="Enter your display name"
          value={displayName}
        />
        {submitError ? (
          <StatusBanner
            icon="TriangleAlert"
            message={submitError}
            title="Staff setup failed"
            tone="destructive"
          />
        ) : null}
      </View>

      <View className="gap-3">
        <ActionButton
          disabled={!canSubmit || completeStaffOnboardingMutation.isPending}
          onPress={submit}
        >
          {completeStaffOnboardingMutation.isPending
            ? "Activating..."
            : "Start selling"}
        </ActionButton>
        <Text className="text-center text-xs leading-5 text-muted-foreground">
          Your access stays tied to your own email account.
        </Text>
      </View>
    </MobileScreen>
  )
}
