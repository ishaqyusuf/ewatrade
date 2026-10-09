import {
  useAdminTabs,
  useResetAdminDock,
} from "@/components/mobile/admin-tabs/admin-tabs-context"
import { buildAppThemeOptions } from "@/components/mobile/app-theme-presentation"
import { commitAppThemeSelection } from "@/components/mobile/app-theme-selection"
import {
  ClassicMoreFrame,
  ClassicMoreHeader,
  ClassicMoreRow,
  ClassicMoreSection,
  ClassicMoreWorkspace,
} from "@/components/mobile/appearances/classic/more-screen"
import {
  MarketDayMoreFrame,
  MarketDayMoreHeader,
  MarketDayMoreRow,
  MarketDayMoreSection,
  MarketDayMoreWorkspace,
} from "@/components/mobile/appearances/market-day/more-screen"
import { StatusBanner } from "@/components/mobile/status-banner"
import { useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useColorScheme } from "@/hooks/use-color"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import {
  type AdminManagementRole,
  type AdminMoreItem,
  buildAccountSections,
  buildAdminMoreSections,
  canAccessAdminTabs,
} from "@/lib/admin-navigation"
import { getMobileRoleLabel, normalizeMobileRole } from "@/lib/mobile-roles"
import { getPlan } from "@/lib/retail-ops-subscription"
import { type ThemeOverride, setThemeOverride } from "@/lib/theme-preference"
import type { MobileWorkspaceFeatureAvailability } from "@/lib/workspace-feature-availability"
import {
  activeBusinessOfflineCommands,
  useOfflineCommandStore,
} from "@/store/offlineCommandStore"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useEffect, useRef, useState } from "react"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { ActionButton } from "../action-button"
import { HeroCard } from "../green-till/hero-card"
import { QuickActionRow, SectionHeader } from "../green-till/kit"
import { MoreApprovalCard } from "./more-approval-card"
import { MoreSignOutSheet, MoreThemeSheet } from "./more-sheets"
/** Short tile names so the four-up grid never wraps or truncates. */
const MORE_TILE_LABELS: Partial<Record<string, string>> = {
  finance: "Finance",
  "order-reminders": "Reminders",
  "payments-received": "Payments",
  "receipt-settings": "Receipts",
}
const MORE_ROW_DETAILS: Partial<Record<string, string>> = {
  "plan-billing": "Your plan and payments",
  "website-domain": "Store link and custom domain",
}

export function MoreScreen() {
  const { availability, syncAlertCount } = useAdminTabs()
  useResetAdminDock()
  return (
    <MoreContent availability={availability} syncAlertCount={syncAlertCount} />
  )
}
export function AccountScreen() {
  const { profile } = useAuthContext()
  const commands = useOfflineCommandStore((s) => s.commands)
  const syncAlertCount = activeBusinessOfflineCommands(
    commands,
    profile?.businessId,
  ).filter((c) => !["applied", "discarded"].includes(c.localStatus)).length
  return <MoreContent account syncAlertCount={syncAlertCount} />
}
function MoreContent({
  account = false,
  availability,
  syncAlertCount,
}: {
  account?: boolean
  availability?: MobileWorkspaceFeatureAvailability
  syncAlertCount: number
}) {
  const insets = useSafeAreaInsets()
  const appearance = useMobileDesign("more")
  const market = appearance === "market-day"
  const Frame = market ? MarketDayMoreFrame : ClassicMoreFrame
  const Header = market ? MarketDayMoreHeader : ClassicMoreHeader
  const Workspace = market ? MarketDayMoreWorkspace : ClassicMoreWorkspace
  const Row = market ? MarketDayMoreRow : ClassicMoreRow
  const Section = market ? MarketDayMoreSection : ClassicMoreSection
  const [headerHeight, setHeaderHeight] = useState(0)
  const [showCanvasStatusBar, setShowCanvasStatusBar] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: appearance changes invalidate header measurements
  useEffect(() => {
    setHeaderHeight(0)
    setShowCanvasStatusBar(false)
  }, [market])

  const router = useRouter()
  const auth = useAuthContext()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const isOffline = useOperationalModeStore((state) => state.isOfflineMode)
  const { colorScheme, setColorScheme, themeOverride } = useColorScheme()
  const themeModal = useModal()
  const signOutModal = useModal()
  const confirmSignOut = useRef(false)
  const savingTheme = useRef(false)
  const [themeError, setThemeError] = useState<string | null>(null)
  const [themeSavePending, setThemeSavePending] = useState(false)
  const normalizedRole = normalizeMobileRole(auth.profile?.role)
  const role: AdminManagementRole =
    normalizedRole === "ADMIN" || normalizedRole === "MANAGER"
      ? normalizedRole
      : "OWNER"
  const subscription = useQuery(
    trpc.retailOps.subscription.queryOptions(undefined, {
      enabled: !account && !isOffline && (role === "OWNER" || role === "ADMIN"),
      retry: false,
      staleTime: 60_000,
    }),
  )
  const planSnapshot =
    subscription.data?.tenant.id === auth.profile?.businessId
      ? subscription.data
      : undefined
  const sections = account
    ? buildAccountSections()
    : availability
      ? buildAdminMoreSections({
          availability,
          planFeatures: planSnapshot
            ? getPlan(planSnapshot.subscription.planId).features
            : undefined,
          role,
          staffAccessMode: auth.profile?.staffAccessMode,
        })
      : []
  const offlineSettings = useQuery(
    trpc.offline.settings.queryOptions(undefined, {
      enabled:
        !account &&
        !isOffline &&
        (auth.profile?.staffAccessMode !== "SCOPED" || role !== "MANAGER"),
      retry: false,
      staleTime: 30_000,
    }),
  )
  const offlineRecords = useQuery(
    trpc.offline.conflicts.queryOptions(
      {},
      {
        enabled:
          !account &&
          !isOffline &&
          (auth.profile?.staffAccessMode !== "SCOPED" || role !== "MANAGER"),
        retry: false,
        staleTime: 30_000,
      },
    ),
  )
  const reviewingOrder = useRef(false)
  const reviewOfflineRecord = useMutation(
    trpc.offline.review.mutationOptions({
      onSettled: () => {
        reviewingOrder.current = false
      },
      onSuccess: async () => {
        await Promise.all([
          offlineRecords.refetch(),
          queryClient.invalidateQueries(trpc.orders.list.queryFilter()),
          queryClient.invalidateQueries(trpc.orders.listPage.pathFilter()),
        ])
      },
    }),
  )
  const stagedRecords = (offlineRecords.data ?? []).filter(
    (record) => record.reviewKind === "approval",
  )
  const themeOptions = buildAppThemeOptions({
    resolvedColorScheme: colorScheme,
    themeOverride,
  })

  async function selectTheme(value: ThemeOverride) {
    if (savingTheme.current) return
    if (value === themeOverride) {
      themeModal.dismiss()
      return
    }

    savingTheme.current = true
    setThemeError(null)
    setThemeSavePending(true)
    const result = await commitAppThemeSelection({
      apply: setColorScheme,
      current: themeOverride,
      next: value,
      persist: setThemeOverride,
    })
    savingTheme.current = false
    setThemeSavePending(false)

    if (result === "saved") {
      themeModal.dismiss()
      return
    }

    setThemeError("We couldn't save this appearance on this device. Try again.")
  }

  function reviewOrder(commandId: string, decision: "approve" | "reject") {
    if (isOffline || reviewingOrder.current) return
    reviewingOrder.current = true
    reviewOfflineRecord.mutate({ commandId, decision })
  }
  function handleItem(item: AdminMoreItem) {
    if (item.disabled) return
    if (item.action.kind === "route") {
      router.push(item.action.href)
      return
    }
    if (item.action.kind === "theme") {
      themeModal.present()
      return
    }
    confirmSignOut.current = false
    signOutModal.present()
  }

  if (
    !auth.isAuthenticated ||
    (!account && !canAccessAdminTabs(auth.profile?.role))
  )
    return null

  return (
    <>
      <Frame
        showCanvasStatusBar={showCanvasStatusBar}
        onScroll={(event) => {
          const next =
            headerHeight > 0 &&
            Math.max(0, event.nativeEvent.contentOffset.y) >=
              headerHeight - insets.top
          setShowCanvasStatusBar((current) =>
            current === next ? current : next,
          )
        }}
      >
        {account ? (
          <ActionButton
            variant="ghost"
            icon="ArrowLeft"
            onPress={() => router.back()}
          >
            Account
          </ActionButton>
        ) : (
          <Header
            onLayout={(event) =>
              setHeaderHeight(event.nativeEvent.layout.height)
            }
            onSyncPress={() => router.push("/sync-status-modal")}
            syncAlertCount={syncAlertCount}
          />
        )}
        {isOffline ? (
          <StatusBanner
            tone="warning"
            message={`${syncAlertCount} changes waiting on this device. Reconnect to refresh and review orders.`}
          />
        ) : null}

        {account && !canAccessAdminTabs(auth.profile?.role) ? (
          <HeroCard
            label="Signed in"
            title={auth.profile?.name ?? "Your account"}
            sub={`${auth.profile?.businessName ?? "Current business"} · ${getMobileRoleLabel(auth.profile?.role)}`}
          >
            <ActionButton
              tone="cream"
              icon="RefreshCw"
              onPress={() => router.push("/business-switch-modal")}
            >
              Switch business
            </ActionButton>
          </HeroCard>
        ) : (
          <Workspace
            businessName={auth.profile?.businessName ?? "Current business"}
            onPress={() => router.push("/business-switch-modal")}
            roleLabel={getMobileRoleLabel(auth.profile?.role)}
          />
        )}

        {!account && !market && stagedRecords.length > 0 ? (
          <View className="gap-3">
            <SectionHeader
              title="Needs your review"
              actionLabel="See all"
              onAction={() => router.push("/sync-status-modal")}
            />
            {reviewOfflineRecord.isError ? (
              <StatusBanner
                tone="destructive"
                title="Review not saved"
                message={reviewOfflineRecord.error.message}
              />
            ) : null}
            {stagedRecords.slice(0, 3).map((record) => (
              <MoreApprovalCard
                key={record.id}
                appearance={appearance}
                actorName={
                  record.actor?.displayName ||
                  record.actor?.name ||
                  record.actor?.email ||
                  "Staff member"
                }
                disabled={isOffline || reviewOfflineRecord.isPending}
                onApprove={() => reviewOrder(record.id, "approve")}
                onReject={() => reviewOrder(record.id, "reject")}
              />
            ))}
          </View>
        ) : null}
        {sections.map((section) =>
          !market && section.id === "store-tools" ? (
            <View key={section.id}>
              <SectionHeader title="Store tools" />
              {Array.from(
                { length: Math.ceil(section.items.length / 4) },
                (_, group) => (
                  <QuickActionRow
                    columns={4}
                    key={section.items[group * 4]?.id}
                    actions={section.items
                      .slice(group * 4, group * 4 + 4)
                      .map((item) => ({
                        label: MORE_TILE_LABELS[item.id] ?? item.label,
                        icon: item.icon,
                        disabled: item.disabled,
                        onPress: () => handleItem(item),
                      }))}
                  />
                ),
              )}
            </View>
          ) : (
            <Section key={section.id} title={section.title}>
              {section.items.map((item) => (
                <Row
                  detail={
                    MORE_ROW_DETAILS[item.id] ??
                    (item.id === "app-theme"
                      ? themeOverride.charAt(0).toUpperCase() +
                        themeOverride.slice(1)
                      : item.id === "inventory" && item.disabled
                        ? "Add a Product to enable inventory"
                        : item.id === "sync-offline"
                          ? `${offlineSettings.data ? (offlineSettings.data.approvalRequired ? "Staff approval on" : "Staff approval off") : "Approval settings unavailable"} · ${offlineRecords.data ? `${stagedRecords.length} waiting` : "Review count unavailable"}`
                          : undefined)
                  }
                  item={item}
                  key={item.id}
                  onPress={() => handleItem(item)}
                />
              ))}
              {market &&
              section.id === "offline" &&
              stagedRecords.length > 0 ? (
                <View className="mt-2 border-y border-border">
                  {reviewOfflineRecord.isError ? (
                    <StatusBanner
                      tone="destructive"
                      title="Review not saved"
                      message={reviewOfflineRecord.error.message}
                    />
                  ) : null}
                  {stagedRecords.slice(0, 3).map((record) => (
                    <MoreApprovalCard
                      key={record.id}
                      appearance={appearance}
                      actorName={
                        record.actor?.displayName ||
                        record.actor?.name ||
                        record.actor?.email ||
                        "Staff member"
                      }
                      disabled={isOffline || reviewOfflineRecord.isPending}
                      onApprove={() => reviewOrder(record.id, "approve")}
                      onReject={() => reviewOrder(record.id, "reject")}
                    />
                  ))}
                </View>
              ) : null}
            </Section>
          ),
        )}
        {account ? (
          <ActionButton
            variant="outline"
            icon="RefreshCw"
            onPress={() => router.push("/sync-status-modal")}
          >
            Sync status · {syncAlertCount} waiting
          </ActionButton>
        ) : null}
        <Pressable
          accessibilityRole="button"
          className="min-h-12 justify-center px-5"
          onPress={() => router.push("/account-privacy")}
        >
          <Text className="font-semibold text-primary">
            Account, privacy and deletion
          </Text>
        </Pressable>
      </Frame>

      <MoreThemeSheet
        ref={themeModal.ref}
        appearance={appearance}
        options={themeOptions}
        pending={themeSavePending}
        error={themeError}
        onSelect={selectTheme}
      />
      <MoreSignOutSheet
        ref={signOutModal.ref}
        appearance={appearance}
        syncAlertCount={syncAlertCount}
        onCancel={() => {
          confirmSignOut.current = false
          signOutModal.dismiss()
        }}
        onConfirm={() => {
          if (confirmSignOut.current) return
          confirmSignOut.current = true
          signOutModal.dismiss()
          auth.signOutLocal()
        }}
      />
    </>
  )
}
