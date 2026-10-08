import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { StatusPill, ToggleRow } from "@/components/mobile/green-till/kit"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { MobileScreen } from "@/components/mobile/screen"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { normalizeMobileRole } from "@/lib/mobile-roles"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import type { ReceiptSettings } from "@ewatrade/order-receipts"
import { receiptSettingsSchema } from "@ewatrade/order-receipts"
import { formatMinorMoney } from "@ewatrade/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { VariableContextProvider } from "nativewind"
import { type ReactNode, useRef, useState } from "react"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export function ReceiptSettingsScreen() {
  const { profile } = useAuthContext()
  const router = useRouter()
  const trpc = useTRPC()
  const offline = useOperationalModeStore((state) => state.isOfflineMode)
  const role = normalizeMobileRole(profile?.role)
  const allowed = role === "OWNER" || role === "ADMIN"
  const query = useQuery(
    trpc.orders.receiptSettings.queryOptions(
      { storeId: profile?.storeId },
      {
        enabled: allowed && !offline,
        refetchOnWindowFocus: false,
        retry: false,
      },
    ),
  )
  const [scope, setScope] = useState<"business" | "store">("business")
  const header = (
    <>
      {" "}
      <View className="flex-row items-center gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close receipt settings"
          className="size-[44px] items-center justify-center rounded-[14px] bg-card"
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/admin-home")
          }
        >
          <Icon name="X" className="size-[20px] text-foreground" />
        </Pressable>
        <Text
          accessibilityRole="header"
          className="min-w-0 flex-1 text-[23px] font-extrabold text-foreground"
        >
          Receipt settings
        </Text>
      </View>
      <Text className="text-sm text-muted-foreground">
        One receipt template, used across dashboard and mobile. Store settings
        can override business defaults.
      </Text>
    </>
  )
  if (allowed && !offline && query.data && !query.isError)
    return (
      <ReceiptSettingsEditor
        key={`${query.data.storeId}:${scope}`}
        data={query.data}
        header={header}
        businessName={profile?.businessName ?? "Your business"}
        scope={scope}
        setScope={setScope}
      />
    )
  return (
    <MobileScreen scroll contentClassName="gap-4 px-[18px] pb-10">
      {header}
      {!allowed ? (
        <StatusBanner
          tone="warning"
          message="Only Owners and Admins can change receipt settings."
        />
      ) : offline ? (
        <StatusBanner
          tone="warning"
          message="Reconnect to load and save receipt settings."
        />
      ) : query.isError ? (
        <StatusBanner
          tone="destructive"
          message={query.error.message}
          actionLabel="Try again"
          onActionPress={() => void query.refetch()}
        />
      ) : (
        <View accessibilityLabel="Loading receipt settings" className="gap-4">
          <Skeleton className="h-[300px] rounded-[20px]" />
          <Skeleton className="h-[60px] rounded-[14px]" />
          <Skeleton className="h-[130px] rounded-[20px]" />
        </View>
      )}
    </MobileScreen>
  )
}

function ReceiptSettingsEditor({
  data,
  businessName,
  header,
  scope,
  setScope,
}: {
  data: RouterOutputs["orders"]["receiptSettings"]
  businessName: string
  header: ReactNode
  scope: "business" | "store"
  setScope: (value: "business" | "store") => void
}) {
  const trpc = useTRPC()
  const largeText = useLargeTextLayout()
  const insets = useSafeAreaInsets()
  const lockedRef = useRef(false)
  const quickFillSnapshot = useRef<ReceiptSettings | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const queryClient = useQueryClient()
  const [settings, setSettings] = useState(
    scope === "business" ? data.business : data.effective,
  )
  const [inherit, setInherit] = useState(data.override === null)
  const [saved, setSaved] = useState(false)
  const mutation = useMutation(
    trpc.orders.saveReceiptSettings.mutationOptions({
      onSuccess: async (next) => {
        setSettings(scope === "business" ? next.business : next.effective)
        setInherit(next.override === null)
        setSaved(true)
        quickFillSnapshot.current = null
        setCanUndo(false)
        await Promise.all([
          queryClient.invalidateQueries(
            trpc.orders.receiptSettings.queryFilter(),
          ),
          queryClient.invalidateQueries(
            trpc.orders.prepareReceipts.queryFilter(),
          ),
        ])
      },
    }),
  )
  const inherited = scope === "store" && inherit
  const displayed = inherited ? data.business : settings
  const valid = receiptSettingsSchema.safeParse(displayed)
  const locked = mutation.isPending || inherited
  lockedRef.current = locked
  const original = scope === "business" ? data.business : data.effective
  const dirty =
    (scope === "store" && inherit !== (data.override === null)) ||
    (!inherited &&
      (settings.showCustomerName !== original.showCustomerName ||
        settings.showPaymentBreakdown !== original.showPaymentBreakdown ||
        settings.thankYouNote.trim() !== original.thankYouNote.trim()))
  const change = (patch: Partial<typeof settings>) => {
    setSettings((current) => ({ ...current, ...patch }))
    setSaved(false)
    mutation.reset()
  }
  return (
    <View className="flex-1 bg-background">
      <MobileScreen scroll contentClassName="gap-4 px-[18px]">
        {header}
        <View className="gap-4">
          <ReceiptSettingsPreview
            settings={displayed}
            businessName={businessName}
          />
          <View className={largeText ? "gap-3" : "flex-row gap-3"}>
            <View className="flex-1">
              <ActionButton
                variant={scope === "business" ? "default" : "outline"}
                disabled={mutation.isPending}
                onPress={() => setScope("business")}
              >
                Business
              </ActionButton>
            </View>
            <View className="flex-1">
              <ActionButton
                variant={scope === "store" ? "default" : "outline"}
                disabled={mutation.isPending}
                onPress={() => setScope("store")}
              >
                This store
              </ActionButton>
            </View>
          </View>
          <Text className="font-semibold">
            {scope === "business" ? "Business defaults" : data.storeName}
          </Text>
          {scope === "store" ? (
            <ToggleRow
              title="Use business defaults"
              sub={`${data.storeName} follows the business template`}
              value={inherit}
              disabled={mutation.isPending}
              onValueChange={(value) => {
                setInherit(value)
                setSaved(false)
              }}
            />
          ) : null}
          <ToggleRow
            title="Customer name"
            sub="Off prints Walk-in customer"
            value={displayed.showCustomerName}
            disabled={locked}
            onValueChange={(value) => change({ showCustomerName: value })}
          />
          <ToggleRow
            title="Payment breakdown"
            sub="Each payment with method and time"
            value={displayed.showPaymentBreakdown}
            disabled={locked}
            onValueChange={(value) => change({ showPaymentBreakdown: value })}
          />
          {!locked ? (
            <QaQuickFillButton
              formId="receipt-settings"
              isDirty={dirty}
              canUndo={canUndo}
              onFill={() => {
                if (lockedRef.current) return
                quickFillSnapshot.current = { ...settings }
                change({
                  showCustomerName: true,
                  showPaymentBreakdown: true,
                  thankYouNote: "Thank you for shopping with us. — QA sample",
                })
                setCanUndo(true)
              }}
              onUndo={() => {
                if (lockedRef.current) return
                if (quickFillSnapshot.current) change(quickFillSnapshot.current)
                quickFillSnapshot.current = null
                setCanUndo(false)
              }}
            />
          ) : null}
          <FormField
            label="Thank-you note"
            multiline
            maxLength={300}
            editable={!locked}
            value={displayed.thankYouNote}
            onChangeText={(value) => change({ thankYouNote: value })}
            placeholder="Thank you for shopping with us."
          />
          <Text className="text-xs text-muted-foreground">
            {displayed.thankYouNote.length}/300 · Business identity, Order
            totals and payment status are included automatically.
          </Text>
          {mutation.isError ? (
            <StatusBanner tone="destructive" message={mutation.error.message} />
          ) : saved ? (
            <StatusBanner
              tone="success"
              message="Receipt settings saved. New receipts use these settings."
            />
          ) : null}
        </View>
      </MobileScreen>
      <VariableContextProvider
        value={{
          "--receipt-settings-safe-bottom": Math.max(insets.bottom, 16),
        }}
      >
        <View className="border-t border-border bg-background px-[18px] pt-3 pb-[var(--receipt-settings-safe-bottom)]">
          <ActionButton
            disabled={!valid.success || mutation.isPending || !dirty}
            isLoading={mutation.isPending}
            loadingLabel="Saving settings"
            onPress={() => {
              if (!valid.success || mutation.isPending || !dirty) return
              setSaved(false)
              mutation.mutate({
                storeId: data.storeId,
                scope,
                settings: inherited ? null : valid.data,
              })
            }}
          >
            {dirty ? "Save receipt settings" : "No changes to save"}
          </ActionButton>
        </View>
      </VariableContextProvider>
    </View>
  )
}

function ReceiptSettingsPreview({
  settings,
  businessName,
}: { settings: ReceiptSettings; businessName: string }) {
  const sampleTotal = formatMinorMoney(650000, "NGN").replace(/\.00$/, "")
  return (
    <View className="gap-3 rounded-[20px] bg-muted p-3.5">
      <Text className="text-xs font-bold text-muted-foreground">
        Sample preview · not a real receipt · NGN
      </Text>
      <View className="gap-3 rounded-[14px] bg-card p-5">
        <Text className="text-center text-sm font-extrabold text-foreground">
          {businessName}
        </Text>
        <Text className="text-center text-[28px] font-extrabold tabular-nums text-foreground">
          {sampleTotal}
        </Text>
        <View className="items-center">
          <StatusPill label="Paid" tone="ok" />
        </View>
        <Text className="text-xs text-muted-foreground">
          Receipt SAMPLE-001
        </Text>
        <Text className="text-sm text-foreground">
          Customer:{" "}
          {settings.showCustomerName ? "Sample customer" : "Walk-in customer"}
        </Text>
        <View className="gap-2 border-y border-border py-3">
          <Text className="text-sm text-foreground">
            Sample item · 2 ×{" "}
            {formatMinorMoney(325000, "NGN").replace(/\.00$/, "")}
          </Text>
          <Text className="text-sm font-bold text-foreground">
            Total · {sampleTotal}
          </Text>
        </View>
        {settings.showPaymentBreakdown ? (
          <View className="gap-1">
            <Text className="text-xs font-bold text-muted-foreground">
              Payment breakdown
            </Text>
            <Text className="text-sm text-foreground">
              Cash · {sampleTotal} · 10:42 (sample)
            </Text>
          </View>
        ) : null}
        {settings.thankYouNote.trim() ? (
          <Text className="text-center text-xs text-muted-foreground">
            {settings.thankYouNote.trim()}
          </Text>
        ) : null}
        <Text className="text-center text-[10.5px] text-muted-foreground">
          Made with ẸwáTrade
        </Text>
      </View>
    </View>
  )
}
