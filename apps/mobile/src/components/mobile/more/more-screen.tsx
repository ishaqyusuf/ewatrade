import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useEffect, useRef, useState } from "react"
import { buildAppThemeOptions } from "@/components/mobile/app-theme-presentation"
import { commitAppThemeSelection } from "@/components/mobile/app-theme-selection"
import { StatusBanner } from "@/components/mobile/status-banner"
import { useModal } from "@/components/ui/modal"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useColorScheme } from "@/hooks/use-color"
import { useMobileDesign } from "@/hooks/use-mobile-design"
import {
  type AdminManagementRole,
  type AdminMoreItem,
  buildAdminMoreSections,
  canAccessAdminTabs,
} from "@/lib/admin-navigation"
import { getMobileRoleLabel, normalizeMobileRole } from "@/lib/mobile-roles"
import { type ThemeOverride, setThemeOverride } from "@/lib/theme-preference"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  useAdminTabs,
  useResetAdminDock,
} from "@/components/mobile/admin-tabs/admin-tabs-context"
import {
  ClassicMoreFrame,
  ClassicMoreHeader,
  ClassicMoreWorkspace,
  ClassicMoreRow,
  ClassicMoreSection,
} from "@/components/mobile/appearances/classic/more-screen"
import {
  MarketDayMoreFrame,
  MarketDayMoreHeader,
  MarketDayMoreWorkspace,
  MarketDayMoreRow,
  MarketDayMoreSection,
} from "@/components/mobile/appearances/market-day/more-screen"
import { MoreThemeSheet, MoreSignOutSheet } from "./more-sheets"
import { MoreApprovalCard } from "./more-approval-card"
export function MoreScreen() {
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
  const { availability, syncAlertCount } = useAdminTabs()
  useResetAdminDock()
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
  const sections = buildAdminMoreSections({ availability, role })
  const offlineSettings = useQuery(
    trpc.offline.settings.queryOptions(undefined, {
      retry: false,
      staleTime: 30_000,
    }),
  )
  const offlineRecords = useQuery(
    trpc.offline.conflicts.queryOptions(
      {},
      { enabled: !isOffline, retry: false, staleTime: 30_000 },
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
          queryClient.invalidateQueries(trpc.orders.listPage.queryFilter()),
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

  if (!canAccessAdminTabs(auth.profile?.role)) return null

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
        <Header
          onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
          onSyncPress={() => router.push("/sync-status-modal")}
          syncAlertCount={syncAlertCount}
        />

        <Workspace
          businessName={auth.profile?.businessName ?? "Current business"}
          onPress={() => router.push("/business-switch-modal")}
          roleLabel={getMobileRoleLabel(auth.profile?.role)}
        />

        {sections.map((section) => (
          <Section key={section.id} title={section.title}>
            {section.items.map((item) => (
              <Row
                detail={
                  item.id === "inventory" && item.disabled
                    ? "Add a Product to enable inventory"
                    : item.id === "sync-offline"
                      ? `${offlineSettings.data ? (offlineSettings.data.approvalRequired ? "Staff approval on" : "Staff approval off") : "Approval settings unavailable"} · ${offlineRecords.data ? `${stagedRecords.length} waiting` : "Review count unavailable"}`
                      : undefined
                }
                item={item}
                key={item.id}
                onPress={() => handleItem(item)}
              />
            ))}
            {section.id === "offline" && stagedRecords.length > 0 ? (
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
        ))}
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
