import { ActionButton } from "@/components/mobile/action-button"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { EmptyState } from "@/components/mobile/empty-state"
import { ListCreateFab } from "@/components/mobile/list-create-fab"
import { QueryRefreshControl } from "@/components/mobile/query-refresh-control"
import {
  SecondaryOperationalRow,
  SecondarySheetHeader,
} from "@/components/mobile/secondary-operations"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import { useAuthContext } from "@/hooks/use-auth"
import { shouldShowListSearch } from "@/lib/list-pagination"
import { isLocalSessionToken } from "@/lib/session-store"
import { switchMobileBusinessSession } from "@/lib/workspace-feature-availability"
import { type RetailOpsBusiness, useBusinessStore } from "@/store/businessStore"
import { clearMobileDataCache, useTRPC } from "@/trpc/client"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { forwardRef, useMemo, useState } from "react"
import { View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

type BusinessSwitchSheetProps = {
  onComplete?: () => void
}

type BusinessSwitchContentProps = BusinessSwitchSheetProps & {
  presentation?: "screen" | "sheet"
}

const BUSINESS_PAGE_SIZE = 10

function BusinessRow({
  business,
  onPress,
  selected,
}: {
  business: RetailOpsBusiness
  onPress: () => void
  selected: boolean
}) {
  const metadata = [business.category, business.country, business.salesMethod]
    .filter(Boolean)
    .join(" - ")

  return (
    <SecondaryOperationalRow
      detail={`${business.type ?? "Retail"} - ${business.currency ?? "NGN"}`}
      icon="Building2"
      metadata={metadata}
      onPress={onPress}
      selected={selected}
      title={business.name}
      trailing={
        <StatusBadge
          icon={selected ? "CircleCheck" : "Building2"}
          label={selected ? "Active" : (business.currency ?? "NGN")}
          tone={selected ? "primary" : "muted"}
        />
      }
    >
      {selected ? (
        <StatusBadge label="Current workspace" tone="success" />
      ) : null}
    </SecondaryOperationalRow>
  )
}

export function BusinessSwitchContent({
  onComplete,
  presentation = "sheet",
}: BusinessSwitchContentProps) {
  const auth = useAuthContext()
  const router = useRouter()
  const trpc = useTRPC()
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const localBusinesses = useBusinessStore((state) => state.businesses)
  const setActiveBusiness = useBusinessStore((state) => state.setActiveBusiness)
  const [businessQuery, setBusinessQuery] = useState("")
  const [visibleBusinessCount, setVisibleBusinessCount] =
    useState(BUSINESS_PAGE_SIZE)
  const isLocalSession = isLocalSessionToken(auth.token)
  const productionBusinessesQuery = useQuery(
    trpc.tenant.businesses.queryOptions(undefined, {
      enabled: !!auth.token && !isLocalSession,
      retry: false,
    }),
  )
  const businesses: RetailOpsBusiness[] = isLocalSession
    ? localBusinesses
    : (productionBusinessesQuery.data ?? []).map((business) => ({
        createdAt: "",
        currency: business.currencyCode,
        id: business.id,
        name: business.name,
        role: business.role,
        slug: business.slug,
        type: "Business",
      }))
  const currentBusinessId = isLocalSession
    ? activeBusinessId
    : auth.profile?.businessId
  const filteredBusinesses = useMemo(() => {
    const normalizedQuery = businessQuery.trim().toLowerCase()

    if (!normalizedQuery) return businesses

    return businesses.filter((business) =>
      [
        business.name,
        business.type,
        business.currency,
        business.country,
        business.category,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    )
  }, [businessQuery, businesses])
  const visibleBusinesses = useMemo(
    () => filteredBusinesses.slice(0, visibleBusinessCount),
    [filteredBusinesses, visibleBusinessCount],
  )
  const showBusinessSearch = shouldShowListSearch(businesses.length)
  const loadMoreBusinesses = () => {
    if (visibleBusinessCount >= filteredBusinesses.length) return
    setVisibleBusinessCount((count) => count + BUSINESS_PAGE_SIZE)
  }
  const updateBusinessQuery = (value: string) => {
    setBusinessQuery(value)
    setVisibleBusinessCount(BUSINESS_PAGE_SIZE)
  }

  const activateBusiness = (business: RetailOpsBusiness) => {
    if (isLocalSession) {
      setActiveBusiness(business.id)
      if (auth.session) {
        auth.applyAuthenticatedSession(
          switchMobileBusinessSession(auth.session, business),
        )
      } else {
        clearMobileDataCache()
      }
      return
    }

    if (!auth.session || !business.slug) return

    auth.applyAuthenticatedSession(
      switchMobileBusinessSession(auth.session, business),
    )
  }

  const contentClassName =
    presentation === "screen" ? "gap-5 px-4 pb-6" : "gap-5 px-5 pb-6"

  const content = (
    <View className={contentClassName}>
      <SecondarySheetHeader
        description={
          isLocalSession
            ? "Switch between businesses or add another local workspace."
            : "Switch between businesses or set up a new workspace."
        }
        icon="Building2"
        title="Business workspace"
      />

      <View className="gap-3">
        <Text className="text-base font-bold text-foreground">
          Your businesses
        </Text>
        {!isLocalSession && productionBusinessesQuery.isPending ? (
          <EmptyState
            icon="Loader2"
            message="Loading the businesses available to this account."
            title="Loading workspaces"
          />
        ) : productionBusinessesQuery.isError ? (
          <StatusBanner
            icon="AlertCircle"
            message="Reconnect and try loading your business workspaces again."
            title="Businesses unavailable"
            tone="destructive"
          />
        ) : businesses.length > 0 ? (
          visibleBusinesses.length > 0 ? (
            <>
              {visibleBusinesses.map((business) => (
                <BusinessRow
                  business={business}
                  key={business.id}
                  onPress={() => activateBusiness(business)}
                  selected={currentBusinessId === business.id}
                />
              ))}
              {filteredBusinesses.length > visibleBusinesses.length ? (
                <Text className="text-xs font-semibold text-muted-foreground">
                  Scroll to load more businesses.
                </Text>
              ) : null}
            </>
          ) : (
            <EmptyState
              icon="Search"
              message="Try another business, branch, currency, or category."
              title="No matching businesses"
            />
          )
        ) : (
          <EmptyState
            icon="Building2"
            message="Create a business to scope inventory, staff, and sales."
            title="No business yet"
          />
        )}
      </View>

      <ActionButton onPress={onComplete} variant="outline">
        Done
      </ActionButton>
    </View>
  )

  if (presentation === "screen") {
    return (
      <View className="flex-1">
        <KeyboardAwareScrollView
          className="flex-1"
          bottomOffset={160}
          contentContainerStyle={{
            paddingBottom: showBusinessSearch ? 176 : 112,
          }}
          disableScrollOnKeyboardHide
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          refreshControl={isLocalSession ? undefined : <QueryRefreshControl />}
          onScroll={({ nativeEvent }) => {
            if (
              nativeEvent.layoutMeasurement.height +
                nativeEvent.contentOffset.y >=
              nativeEvent.contentSize.height - 160
            ) {
              loadMoreBusinesses()
            }
          }}
          scrollEventThrottle={16}
        >
          {content}
        </KeyboardAwareScrollView>
        {showBusinessSearch ? (
          <BottomSearchFooter
            accessibilityLabel="Find business"
            label="Find business"
            onChangeText={updateBusinessQuery}
            placeholder="Search businesses"
            totalCount={businesses.length}
            value={businessQuery}
          />
        ) : null}
        <ListCreateFab
          accessibilityLabel="Add a new business"
          bottomOffset={showBusinessSearch ? 80 : 0}
          onPress={() => router.push("/new-business-onboarding-modal" as never)}
          testID="business-add-fab"
        />
      </View>
    )
  }

  return (
    <View className="flex-1">
      <BottomSheetKeyboardAwareScrollView
        bottomOffset={160}
        contentContainerStyle={{
          paddingBottom: showBusinessSearch ? 176 : 112,
        }}
        keyboardShouldPersistTaps="handled"
        onScroll={({ nativeEvent }) => {
          if (
            nativeEvent.layoutMeasurement.height +
              nativeEvent.contentOffset.y >=
            nativeEvent.contentSize.height - 160
          ) {
            loadMoreBusinesses()
          }
        }}
        scrollEventThrottle={16}
      >
        {content}
      </BottomSheetKeyboardAwareScrollView>
      {showBusinessSearch ? (
        <BottomSearchFooter
          accessibilityLabel="Find business"
          includeSafeArea={false}
          label="Find business"
          onChangeText={updateBusinessQuery}
          placeholder="Search businesses"
          totalCount={businesses.length}
          value={businessQuery}
        />
      ) : null}
      <ListCreateFab
        accessibilityLabel="Add a new business"
        bottomOffset={showBusinessSearch ? 80 : 0}
        onPress={() => router.push("/new-business-onboarding-modal" as never)}
        testID="business-add-fab"
      />
    </View>
  )
}

export const BusinessSwitchSheet = forwardRef<
  BottomSheetModal,
  BusinessSwitchSheetProps
>((props, ref) => {
  return (
    <Modal
      enableDynamicSizing
      ref={ref}
      snapPoints={["90%"]}
      title="Businesses"
    >
      <BusinessSwitchContent {...props} presentation="sheet" />
    </Modal>
  )
})

BusinessSwitchSheet.displayName = "BusinessSwitchSheet"
