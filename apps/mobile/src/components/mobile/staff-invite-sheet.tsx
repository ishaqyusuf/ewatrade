import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import {
  SecondaryOperationalRow,
  SecondarySheetHeader,
} from "@/components/mobile/secondary-operations"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { useBusinessStore } from "@/store/businessStore"
import {
  type RetailOpsStaffMember,
  useRetailOpsStore,
} from "@/store/retailOpsStore"
import {
  getBusinessSubscription,
  getPlan,
  useSubscriptionStore,
} from "@/store/subscriptionStore"
import { useTRPC } from "@/trpc/client"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { useMutation, useQuery } from "@tanstack/react-query"
import { forwardRef, useMemo, useState } from "react"
import { View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

type StaffInviteSheetProps = {
  onComplete?: () => void
}

type StaffInviteContentProps = {
  ctaPlacement?: "inline" | "sticky"
  onComplete?: () => void
  presentation?: "screen" | "sheet"
}

const STAFF_PREVIEW_LIMIT = 6

type ProductionStaffMember = {
  acceptedAt?: Date | string | null
  createdAt?: Date | string
  id: string
  invitedAt?: Date | string | null
  role: string
  status: string
  updatedAt?: Date | string
  user: {
    displayName?: string | null
    email: string
    id: string
    name?: string | null
  }
}

type StaffRow = {
  detail: string
  email: string
  id: string
  name: string
  source: "local" | "production"
  sourceLabel: string
  statusLabel: string
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function formatStaffDate(value: Date | string | null | undefined) {
  if (!value) return "Not set"

  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) return "Not set"

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })
}

function getStaffStatusLabel(status: string) {
  const normalizedStatus = status.toLowerCase()

  if (normalizedStatus === "active") return "Active"
  if (normalizedStatus === "invited" || normalizedStatus === "pending") {
    return "Pending"
  }
  if (normalizedStatus === "suspended") return "Suspended"

  return status
}

function getStaffRoleLabel(role: string) {
  const normalizedRole = role.toLowerCase()

  if (normalizedRole === "cashier") return "Attendant"
  if (normalizedRole === "operator") return "Operator"
  if (normalizedRole === "manager") return "Manager"
  if (normalizedRole === "owner") return "Owner"
  if (normalizedRole === "admin") return "Admin"

  return role
}

function getStaffKey(staff: { email: string }) {
  return staff.email.trim().toLowerCase()
}

function mapProductionStaff(staff: ProductionStaffMember): StaffRow {
  const name =
    staff.user.displayName?.trim() ||
    staff.user.name?.trim() ||
    staff.user.email

  return {
    detail: `${getStaffRoleLabel(staff.role)} - invited ${formatStaffDate(
      staff.invitedAt ?? staff.createdAt,
    )}`,
    email: staff.user.email,
    id: staff.id,
    name,
    source: "production",
    sourceLabel: "Synced staff",
    statusLabel: getStaffStatusLabel(staff.status),
  }
}

function mapLocalStaff(staff: RetailOpsStaffMember): StaffRow {
  return {
    detail: `Attendant - invited ${formatStaffDate(staff.invitedAt)}`,
    email: staff.email,
    id: staff.id,
    name: staff.name,
    source: "local",
    sourceLabel:
      staff.syncStatus === "synced" ? "Local synced" : "Pending sync",
    statusLabel: getStaffStatusLabel(staff.status),
  }
}

function StaffRowItem({ staff }: { staff: StaffRow }) {
  return (
    <SecondaryOperationalRow
      detail={staff.detail}
      icon="User"
      metadata={staff.email}
      title={staff.name}
      trailing={
        <StatusBadge
          label={staff.statusLabel}
          tone={staff.statusLabel === "Active" ? "success" : "warning"}
        />
      }
    >
      <StatusBadge
        icon={staff.source === "production" ? "CircleCheck" : "Clock"}
        label={staff.sourceLabel}
        tone={staff.source === "production" ? "success" : "warning"}
      />
    </SecondaryOperationalRow>
  )
}

export function StaffInviteContent({
  ctaPlacement = "inline",
  onComplete,
  presentation = "sheet",
}: StaffInviteContentProps) {
  const trpc = useTRPC()
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const inviteStaff = useRetailOpsStore((state) => state.inviteStaff)
  const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode)
  const allStaff = useRetailOpsStore((state) => state.staff)
  const staff = useMemo(
    () =>
      allStaff.filter(
        (staffMember) =>
          !activeBusinessId ||
          (staffMember.businessId ?? activeBusinessId) === activeBusinessId,
      ),
    [activeBusinessId, allStaff],
  )
  const subscriptions = useSubscriptionStore((state) => state.subscriptions)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const subscription = getBusinessSubscription(subscriptions, activeBusinessId)
  const plan = getPlan(subscription.planId)
  const productionStaffQuery = useQuery(
    trpc.retailOps.staff.queryOptions(
      {
        limit: 50,
        role: "cashier",
        status: "all",
      },
      {
        enabled: !isOfflineMode,
        retry: false,
      },
    ),
  )
  const inviteStaffMutation = useMutation(
    trpc.retailOps.inviteStaff.mutationOptions({
      onError: (error) => {
        setSubmitError(error.message)
      },
      onSuccess: () => {
        setEmail("")
        setName("")
        setSubmitError(null)
        void productionStaffQuery.refetch()
        onComplete?.()
      },
    }),
  )
  const localStaffRows = useMemo(() => staff.map(mapLocalStaff), [staff])
  const productionStaffRows = useMemo(
    () =>
      ((productionStaffQuery.data ?? []) as ProductionStaffMember[]).map(
        mapProductionStaff,
      ),
    [productionStaffQuery.data],
  )
  const usesLocalStaffFallback = isOfflineMode || productionStaffQuery.isError
  const staffRows = useMemo(() => {
    if (usesLocalStaffFallback) return localStaffRows

    const productionStaffKeys = new Set(productionStaffRows.map(getStaffKey))
    const unsyncedLocalRows = localStaffRows.filter(
      (staffMember) => !productionStaffKeys.has(getStaffKey(staffMember)),
    )

    return [...productionStaffRows, ...unsyncedLocalRows]
  }, [localStaffRows, productionStaffRows, usesLocalStaffFallback])
  const visibleStaffRows = useMemo(
    () => staffRows.slice(0, STAFF_PREVIEW_LIMIT),
    [staffRows],
  )
  const isAtStaffLimit = staffRows.length >= plan.limits.staff
  const canSubmit =
    !isAtStaffLimit &&
    isValidEmail(email) &&
    (usesLocalStaffFallback || !inviteStaffMutation.isPending)
  const sourceLabel = isOfflineMode
    ? "Local"
    : productionStaffQuery.isError
      ? "Local fallback"
      : productionStaffQuery.isFetching
        ? "Refreshing"
        : "Online"
  const sourceDetail = isOfflineMode
    ? "Staff invites are queued on this device until sync reconnects."
    : productionStaffQuery.isError
      ? "Production staff list is unavailable, so local staff are shown."
      : productionStaffQuery.isFetching
        ? "Refreshing production staff."
        : "Production staff includes invited, active, and suspended attendant memberships."
  const shouldShowSourceNotice =
    sourceLabel !== "Online" && sourceLabel !== "Refreshing"

  const submit = () => {
    if (!canSubmit) return

    const normalizedEmail = email.trim().toLowerCase()
    const trimmedName = name.trim()

    setSubmitError(null)

    if (!usesLocalStaffFallback) {
      inviteStaffMutation.mutate({
        email: normalizedEmail,
        name: trimmedName || undefined,
        role: "cashier",
      })
      return
    }

    inviteStaff({
      businessId: activeBusinessId ?? undefined,
      email: normalizedEmail,
      name: trimmedName,
    })
    setEmail("")
    setName("")
    onComplete?.()
  }

  const action = (
    <ActionButton
      disabled={!canSubmit}
      isLoading={inviteStaffMutation.isPending}
      loadingLabel="Sending invite"
      onPress={submit}
    >
      Send invite
    </ActionButton>
  )
  const bodyClassName =
    presentation === "screen" ? "gap-5 px-4 pb-6" : "gap-5 px-5 pb-6"
  const stickyActionClassName =
    presentation === "screen"
      ? "absolute bottom-0 left-0 right-0 border-t border-border bg-background px-4 pb-5 pt-3"
      : "absolute bottom-0 left-0 right-0 border-t border-border bg-background px-5 pb-5 pt-3"

  const body = (
    <View className={bodyClassName}>
      <SecondarySheetHeader
        description="Send access to an attendant for sales and inventory work."
        icon="UserPlus"
        title="Add staff"
      />

      <View className="gap-4">
        <FormField
          label="Attendant name"
          leadingIcon="User"
          onChangeText={setName}
          placeholder="Enter attendant name"
          value={name}
        />
        <FormField
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="email"
          keyboardType="email-address"
          label="Email address"
          leadingIcon="Mail"
          onChangeText={setEmail}
          placeholder="Enter attendant email address"
          value={email}
        />
      </View>

      <StatusBanner
        icon="Mail"
        message="The attendant receives download instructions, signs in with their own email OTP, then confirms their sales profile."
        title="Email invite"
        tone="primary"
      />

      {shouldShowSourceNotice ? (
        <StatusBanner
          icon="Clock"
          message={sourceDetail}
          title={sourceLabel}
          tone="warning"
        />
      ) : null}

      {isAtStaffLimit ? (
        <StatusBanner
          icon="TriangleAlert"
          message={`${plan.name} allows ${plan.limits.staff} attendants. Upgrade before inviting more staff.`}
          title="Staff limit reached"
          tone="destructive"
        />
      ) : null}

      {submitError ? (
        <StatusBanner
          icon="TriangleAlert"
          message={submitError}
          title="Invite was not sent"
          tone="destructive"
        />
      ) : null}

      <View className="gap-3">
        <Text className="text-base font-bold text-foreground">Staff</Text>
        {staffRows.length > 0 ? (
          <>
            {visibleStaffRows.map((staffMember) => (
              <StaffRowItem key={staffMember.id} staff={staffMember} />
            ))}
            {staffRows.length > visibleStaffRows.length ? (
              <Text className="text-xs font-semibold text-muted-foreground">
                Showing first {visibleStaffRows.length} of {staffRows.length}{" "}
                attendants.
              </Text>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon="UserPlus"
            message="Invited attendants appear here after you send their access."
            title="No attendants yet"
          />
        )}
      </View>

      {ctaPlacement === "inline" ? action : null}
    </View>
  )

  if (ctaPlacement === "sticky") {
    return (
      <View className="flex-1">
        <KeyboardAwareScrollView
          className="flex-1"
          bottomOffset={160}
          contentContainerStyle={{ paddingBottom: 120 }}
          disableScrollOnKeyboardHide
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          {body}
        </KeyboardAwareScrollView>
        <View className={stickyActionClassName}>{action}</View>
      </View>
    )
  }

  return body
}

export const StaffInviteSheet = forwardRef<
  BottomSheetModal,
  StaffInviteSheetProps
>(({ onComplete }, ref) => {
  return (
    <Modal
      enableDynamicSizing
      ref={ref}
      snapPoints={["72%"]}
      title="Invite attendant"
    >
      <BottomSheetKeyboardAwareScrollView
        bottomOffset={320}
        contentContainerStyle={{ paddingBottom: 240 }}
        keyboardShouldPersistTaps="handled"
      >
        <StaffInviteContent onComplete={onComplete} />
      </BottomSheetKeyboardAwareScrollView>
    </Modal>
  )
})

StaffInviteSheet.displayName = "StaffInviteSheet"
