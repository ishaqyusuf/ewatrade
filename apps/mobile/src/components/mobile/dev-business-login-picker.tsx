import { EmptyState } from "@/components/mobile/empty-state"
import {
  SecondaryOperationalRow,
  SecondarySheetHeader,
} from "@/components/mobile/secondary-operations"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import {
  DEV_SKIP_OTP_CODE,
  isDevLikeMode,
  isSkipOtpEnabled,
} from "@/lib/feature-flags"
import { type RetailOpsBusiness, useBusinessStore } from "@/store/businessStore"
import { BottomSheetFlatList } from "@gorhom/bottom-sheet"
import { useRouter } from "expo-router"
import { useMemo } from "react"

function toDevEmailSlug(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 36) || "business"
  )
}

function getDevBusinessEmail(business: RetailOpsBusiness) {
  return `owner+${toDevEmailSlug(business.name)}@dev.ewatrade.local`
}

function BusinessLoginRow({
  business,
  onPress,
}: {
  business: RetailOpsBusiness
  onPress: () => void
}) {
  const metadata = [business.category, business.country, business.salesMethod]
    .filter(Boolean)
    .join(" - ")

  return (
    <SecondaryOperationalRow
      detail={`${business.type ?? "Retail"} - ${business.currency ?? "NGN"}`}
      icon="Building2"
      metadata={metadata || getDevBusinessEmail(business)}
      onPress={onPress}
      title={business.name}
      trailing={<StatusBadge label="Dev login" tone="primary" />}
    />
  )
}

export function DevBusinessLoginPicker() {
  const router = useRouter()
  const modal = useModal()
  const businesses = useBusinessStore((state) => state.businesses)
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const setActiveBusiness = useBusinessStore((state) => state.setActiveBusiness)
  const skipOtpEnabled = isSkipOtpEnabled()
  const activeBusiness = useMemo(
    () =>
      businesses.find((business) => business.id === activeBusinessId) ??
      businesses[0],
    [activeBusinessId, businesses],
  )

  if (!isDevLikeMode()) return null

  const selectBusiness = (business: RetailOpsBusiness) => {
    setActiveBusiness(business.id)
    modal.dismiss()
    router.push({
      pathname: "/verify-email",
      params: {
        businessId: business.id,
        businessName: business.name,
        email: getDevBusinessEmail(business),
        fallback: "local",
        mode: "login",
        name: "Store Owner",
      },
    })
  }

  return (
    <>
      <View className="gap-2">
        <Text className="text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
          Email address
        </Text>
        <Pressable
          accessibilityHint="Opens the development business login picker"
          accessibilityLabel="Choose a development business"
          accessibilityRole="button"
          className="min-h-[50px] flex-row items-center justify-between gap-3 rounded-xl border border-border bg-card px-3.5 active:border-primary active:bg-accent"
          haptic
          onPress={() => modal.present()}
          transition
        >
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-sm font-bold text-foreground">
              {activeBusiness?.name ?? "Choose business"}
            </Text>
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {activeBusiness
                ? getDevBusinessEmail(activeBusiness)
                : "Open the business picker to continue"}
            </Text>
          </View>
          <StatusBadge
            label="Dev"
            tone={skipOtpEnabled ? "success" : "muted"}
          />
        </Pressable>
      </View>

      <Modal
        enableDynamicSizing
        ref={modal.ref}
        snapPoints={["72%"]}
        title="Dev businesses"
      >
        <BottomSheetFlatList<RetailOpsBusiness>
          contentContainerStyle={{ paddingBottom: 160 }}
          data={businesses}
          keyExtractor={(business) => business.id}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              className="mx-5"
              icon="Building2"
              message="Create a business through sign-up first, then come back here to log in quickly during development."
              title="No local businesses yet"
            />
          }
          ListHeaderComponent={
            <View className="gap-4 px-5 pb-4 pt-1">
              <SecondarySheetHeader
                description="Pick a local business to continue to the OTP screen without sending a live email."
                icon="Building2"
                title="Choose business"
              />
              <StatusBanner
                icon={skipOtpEnabled ? "CircleCheck" : "TriangleAlert"}
                message={
                  skipOtpEnabled
                    ? `SKIP_OTP is on. Use ${DEV_SKIP_OTP_CODE} on the next screen.`
                    : "SKIP_OTP is off. This picker still uses local fallback and will not send a login email."
                }
                title="Development login"
                tone={skipOtpEnabled ? "success" : "warning"}
              />
            </View>
          }
          renderItem={({ item }) => (
            <View className="px-5 pb-3">
              <BusinessLoginRow
                business={item}
                onPress={() => selectBusiness(item)}
              />
            </View>
          )}
        />
      </Modal>
    </>
  )
}
