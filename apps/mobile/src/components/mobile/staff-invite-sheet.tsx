import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import { ListCreateFab } from "@/components/mobile/list-create-fab"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import { SecondaryOperationalRow } from "@/components/mobile/secondary-operations"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Modal, useModal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useBusinessStore } from "@/store/businessStore"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import {
  getBusinessSubscription,
  getPlan,
  useSubscriptionStore,
} from "@/store/subscriptionStore"
import { useTRPC } from "@/trpc/client"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { forwardRef, useMemo, useState } from "react"
import { FlatList } from "react-native"

type StaffInviteSheetProps = {
  onComplete?: () => void
}

type StaffInviteContentProps = {
  onComplete?: () => void
}

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

function mapProductionStaff(staff: ProductionStaffMember): StaffRow {
  return {
    detail: `${getStaffRoleLabel(staff.role)} · invited ${formatStaffDate(
      staff.invitedAt ?? staff.createdAt,
    )}`,
    email: staff.user.email,
    id: staff.id,
    name:
      staff.user.displayName?.trim() ||
      staff.user.name?.trim() ||
      staff.user.email,
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
          tone={
            staff.statusLabel === "Active"
              ? "success"
              : staff.statusLabel === "Suspended"
                ? "destructive"
                : "warning"
          }
        />
      }
    />
  )
}

export function StaffInviteContent({ onComplete }: StaffInviteContentProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const inviteModal = useModal()
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const isOfflineMode = useOperationalModeStore((state) => state.isOfflineMode)
  const subscriptions = useSubscriptionStore((state) => state.subscriptions)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const subscription = getBusinessSubscription(subscriptions, activeBusinessId)
  const plan = getPlan(subscription.planId)
  const productionStaffQuery = useQuery(
    trpc.retailOps.staff.queryOptions(
      {
        limit: 100,
        role: "cashier",
        status: "all",
      },
      {
        enabled: !isOfflineMode,
        retry: false,
      },
    ),
  )
  const staffRows = useMemo(
    () =>
      ((productionStaffQuery.data ?? []) as ProductionStaffMember[]).map(
        mapProductionStaff,
      ),
    [productionStaffQuery.data],
  )
  const isAtStaffLimit = staffRows.length >= plan.limits.staff
  const inviteStaffMutation = useMutation(
    trpc.retailOps.inviteStaff.mutationOptions({
      onError: (error) => setSubmitError(error.message),
      onSuccess: async () => {
        setEmail("")
        setName("")
        setSubmitError(null)
        inviteModal.dismiss()
        await Promise.all([
          productionStaffQuery.refetch(),
          queryClient.invalidateQueries(
            trpc.tenant.featureAvailability.queryFilter(),
          ),
        ])
        onComplete?.()
      },
    }),
  )
  const canSubmit =
    !isAtStaffLimit &&
    !isOfflineMode &&
    !productionStaffQuery.isError &&
    isValidEmail(email) &&
    !inviteStaffMutation.isPending

  function submit() {
    if (!canSubmit) return
    setSubmitError(null)
    inviteStaffMutation.mutate({
      email: email.trim().toLowerCase(),
      name: name.trim(),
      role: "cashier",
    })
  }

  return (
    <View className="flex-1" testID="staff-directory-screen">
      <FlatList
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: 96,
          paddingHorizontal: 16,
        }}
        data={staffRows}
        keyExtractor={(staff) => staff.id}
        ListEmptyComponent={
          <EmptyState
            className="m-4 flex-1 justify-center"
            icon="Users"
            message={
              productionStaffQuery.isPending && !isOfflineMode
                ? "Loading staff."
                : "Add staff to give attendants access to sales and inventory work."
            }
            title={
              productionStaffQuery.isPending && !isOfflineMode
                ? "Loading staff"
                : "No staff yet"
            }
          />
        }
        ListHeaderComponent={
          <View className="gap-4 pb-4">
            <Text className="text-sm leading-5 text-muted-foreground">
              Staff includes invited, active, and suspended attendants.
            </Text>
            {isOfflineMode ? (
              <StatusBanner
                icon="Wind"
                message="Staff membership is managed online. Reconnect to refresh the list or send an invitation."
                title="Online connection required"
                tone="warning"
              />
            ) : null}
            {productionStaffQuery.isError ? (
              <StatusBanner
                actionLabel="Try again"
                icon="AlertCircle"
                message={productionStaffQuery.error.message}
                onActionPress={() => void productionStaffQuery.refetch()}
                tone="destructive"
              />
            ) : null}
            {isAtStaffLimit ? (
              <StatusBanner
                icon="TriangleAlert"
                message={`${plan.name} allows ${plan.limits.staff} attendants. Upgrade before inviting more staff.`}
                title="Staff limit reached"
                tone="warning"
              />
            ) : null}
          </View>
        }
        refreshControl={<QueryRefreshControl />}
        renderItem={({ item }) => <StaffRowItem staff={item} />}
        showsVerticalScrollIndicator={false}
      />

      <ListCreateFab
        accessibilityLabel="Add staff"
        onPress={() => {
          setSubmitError(null)
          inviteModal.present()
        }}
        testID="staff-add-fab"
      />

      <Modal
        enableDynamicSizing
        maxDynamicContentSize={620}
        ref={inviteModal.ref}
        snapPoints={["72%"]}
        title="Add staff"
      >
        <BottomSheetKeyboardAwareScrollView
          bottomOffset={280}
          contentContainerStyle={{ paddingBottom: 220 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-5 px-5 pb-6">
            <View className="gap-1">
              <Text className="text-lg font-extrabold text-foreground">
                Staff details
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                The attendant receives an email invite and signs in with their
                own account.
              </Text>
            </View>
            {submitError ? (
              <StatusBanner
                icon="TriangleAlert"
                message={submitError}
                title="Invite was not sent"
                tone="destructive"
              />
            ) : null}
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
            <ActionButton
              disabled={!canSubmit}
              isLoading={inviteStaffMutation.isPending}
              loadingLabel="Sending invite"
              onPress={submit}
            >
              Send invite
            </ActionButton>
          </View>
        </BottomSheetKeyboardAwareScrollView>
      </Modal>
    </View>
  )
}

export const StaffInviteSheet = forwardRef<
  BottomSheetModal,
  StaffInviteSheetProps
>(({ onComplete }, ref) => (
  <Modal ref={ref} snapPoints={["82%"]} title="Staff">
    <View className="h-[640px]">
      <StaffInviteContent onComplete={onComplete} />
    </View>
  </Modal>
))

StaffInviteSheet.displayName = "StaffInviteSheet"
