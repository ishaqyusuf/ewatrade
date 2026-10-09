import { ActionButton } from "@/components/mobile/action-button"
import { ListCard, ToggleRow } from "@/components/mobile/green-till/kit"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { MobileScreen } from "@/components/mobile/screen"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Skeleton } from "@/components/ui/skeleton"
import { Text } from "@/components/ui/text"
import { Textarea } from "@/components/ui/textarea"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
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
import {
  Text as NativeText,
  View as NativeView,
  StyleSheet,
} from "react-native"
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
    <View className="flex-row items-center gap-2.5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close receipt settings"
        className="size-[44px] items-center justify-center rounded-[14px] bg-card shadow-sm"
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/admin-home")
        }
      >
        <Icon name="X" className="size-[20px] text-foreground" />
      </Pressable>
      <View className="min-w-0 flex-1">
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          className="text-[22px] font-extrabold text-foreground"
        >
          Receipt settings
        </Text>
        <Text numberOfLines={1} className="text-[12.5px] text-muted-foreground">
          One template for dashboard and mobile
        </Text>
      </View>
    </View>
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
      <MobileScreen scroll contentClassName="gap-3 px-[18px]">
        {header}
        <View className="rounded-[24px] bg-muted px-10 py-3 dark:bg-background">
          <ReceiptSettingsPreview
            settings={displayed}
            businessName={businessName}
            storeName={data.storeName}
          />
        </View>
        <View
          accessibilityRole="tablist"
          className="flex-row rounded-[14px] border border-border bg-muted p-[3px]"
        >
          {(
            [
              ["business", "Business"],
              ["store", data.storeName],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{
                disabled: mutation.isPending,
                selected: scope === value,
              }}
              disabled={mutation.isPending}
              className={
                scope === value
                  ? "min-h-[40px] flex-1 items-center justify-center rounded-[11px] bg-card px-2 shadow-sm"
                  : "min-h-[40px] flex-1 items-center justify-center rounded-[11px] px-2"
              }
              onPress={() => setScope(value)}
            >
              <Text
                numberOfLines={largeText ? 2 : 1}
                className={
                  scope === value
                    ? "text-center text-[13px] font-extrabold text-foreground"
                    : "text-center text-[13px] font-extrabold text-muted-foreground"
                }
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        <ListCard>
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
          <View className={inherited ? "opacity-50" : undefined}>
            <ToggleRow
              title="Customer name"
              sub="Off prints “Walk-in customer”"
              value={displayed.showCustomerName}
              disabled={locked}
              onValueChange={(value) => change({ showCustomerName: value })}
            />
          </View>
          <View className={inherited ? "opacity-50" : undefined}>
            <ToggleRow
              title="Payment breakdown"
              sub="Each payment with method and time"
              value={displayed.showPaymentBreakdown}
              disabled={locked}
              onValueChange={(value) => change({ showPaymentBreakdown: value })}
            />
          </View>
        </ListCard>
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
        <View
          className={
            inherited
              ? "rounded-[18px] bg-card px-3.5 py-3 opacity-50 shadow-sm"
              : "rounded-[18px] bg-card px-3.5 py-3 shadow-sm"
          }
        >
          <View className="flex-row justify-between gap-3">
            <Text
              nativeID="receipt-thank-you-label"
              className="text-[11.5px] font-bold text-muted-foreground"
            >
              Thank-you note
            </Text>
            <Text className="text-[11.5px] font-bold tabular-nums text-muted-foreground">
              {displayed.thankYouNote.length}/300
            </Text>
          </View>
          <Textarea
            accessibilityLabel="Thank-you note"
            accessibilityLabelledBy="receipt-thank-you-label"
            className="mt-1 min-h-[44px] rounded-none border-0 bg-transparent px-0 py-0 text-[14.5px] opacity-100 dark:bg-transparent"
            editable={!locked}
            maxLength={300}
            numberOfLines={6}
            value={displayed.thankYouNote}
            onChangeText={(value) => change({ thankYouNote: value })}
            placeholder="Thank you for shopping with us."
          />
        </View>
        <View className="mx-1 flex-row items-start gap-1.5">
          <Icon
            name="Info"
            className="mt-px size-[14px] text-muted-foreground"
          />
          <Text className="min-w-0 flex-1 text-xs text-muted-foreground">
            Business name, totals and payment status are always included.
          </Text>
        </View>
        {mutation.isError ? (
          <StatusBanner tone="destructive" message={mutation.error.message} />
        ) : saved ? (
          <StatusBanner
            tone="success"
            message="Receipt settings saved. New receipts use these settings."
          />
        ) : null}
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

// The miniature draws the receipt document at two-thirds size, like the
// workshop's preview, so every size below is the paper size times SCALE.
const SCALE = 0.66
const px = (value: number) => Math.round(value * SCALE * 10) / 10
const SAMPLE_LINES = [["Sample item", 2, 325000]] as const

function ReceiptSettingsPreview({
  settings,
  businessName,
  storeName,
}: { settings: ReceiptSettings; businessName: string; storeName: string }) {
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const money = (minor: number) => formatMinorMoney(minor, "NGN")
  const whole = (minor: number) => money(minor).replace(/\.00$/, "")
  const total = SAMPLE_LINES.reduce(
    (sum, [, qty, price]) => sum + qty * price,
    0,
  )
  const ink = { color: palette.paperInk, fontSize: px(10.5) }
  const muted = { color: palette.paperMuted, fontSize: px(10.5) }
  const label = {
    color: palette.paperMuted,
    fontSize: px(8),
    fontWeight: "700" as const,
    letterSpacing: px(0.8),
  }
  const note = settings.thankYouNote.trim()
  return (
    <NativeView
      accessible
      accessibilityLabel={`Sample receipt preview. Customer ${settings.showCustomerName ? "name shown" : "printed as Walk-in customer"}. Payment breakdown ${settings.showPaymentBreakdown ? "shown" : "hidden"}.`}
      style={[styles.paper, { backgroundColor: palette.paper }]}
    >
      <NativeView style={styles.paperHead}>
        <NativeView style={styles.flex}>
          <NativeText
            numberOfLines={1}
            style={{
              color: palette.paperInk,
              fontSize: px(13.5),
              fontWeight: "800",
            }}
          >
            {businessName}
          </NativeText>
          <NativeText numberOfLines={1} style={muted}>
            {storeName}
          </NativeText>
        </NativeView>
        <NativeView style={styles.paperDoc}>
          <NativeText
            style={{
              color: palette.paperAccent,
              fontSize: px(10),
              fontWeight: "800",
              letterSpacing: px(1.4),
            }}
          >
            RECEIPT
          </NativeText>
          <NativeText style={ink}>SAMPLE</NativeText>
          <NativeText style={muted}>{formatSampleDate(new Date())}</NativeText>
          <NativeView
            style={[styles.paperPill, { backgroundColor: palette.paperOk }]}
          >
            <NativeText
              style={{
                color: palette.paperOkInk,
                fontSize: px(9),
                fontWeight: "800",
              }}
            >
              Paid
            </NativeText>
          </NativeView>
        </NativeView>
      </NativeView>
      <NativeView
        style={[styles.paperAmount, { backgroundColor: palette.paperBand }]}
      >
        <NativeText style={muted}>Order total</NativeText>
        <NativeText
          style={{
            color: palette.paperInk,
            fontSize: px(18),
            fontWeight: "800",
          }}
        >
          {money(total)}
        </NativeText>
      </NativeView>
      <NativeView style={styles.paperTwo}>
        <NativeView style={styles.flex}>
          <NativeText style={label}>BILLED TO</NativeText>
          <NativeText style={ink}>
            {settings.showCustomerName ? "Sample customer" : "Walk-in customer"}
          </NativeText>
        </NativeView>
        <NativeView style={styles.flex}>
          <NativeText style={label}>PAYMENT</NativeText>
          <NativeText style={ink}>Paid</NativeText>
        </NativeView>
      </NativeView>
      <NativeView
        style={[styles.paperLine, { borderColor: palette.paperLine }]}
      >
        <NativeText style={[label, styles.flex]}>ITEM</NativeText>
        <NativeText style={[label, styles.colQty]}>QTY</NativeText>
        <NativeText style={[label, styles.colPrice]}>PRICE</NativeText>
        <NativeText style={[label, styles.colAmount]}>AMOUNT</NativeText>
      </NativeView>
      {SAMPLE_LINES.map(([name, qty, price]) => (
        <NativeView
          key={name}
          style={[styles.paperLine, { borderColor: palette.paperLine }]}
        >
          <NativeText numberOfLines={1} style={[ink, styles.flex]}>
            {name}
          </NativeText>
          <NativeText style={[ink, styles.colQty]}>{qty}</NativeText>
          <NativeText style={[ink, styles.colPrice]}>{whole(price)}</NativeText>
          <NativeText style={[ink, styles.colAmount]}>
            {whole(qty * price)}
          </NativeText>
        </NativeView>
      ))}
      <NativeView style={styles.paperSums}>
        <NativeView style={styles.paperSum}>
          <NativeText style={muted}>Subtotal</NativeText>
          <NativeText style={ink}>{money(total)}</NativeText>
        </NativeView>
        <NativeView
          style={[
            styles.paperSum,
            styles.paperTotal,
            { borderTopColor: palette.paperInk },
          ]}
        >
          <NativeText style={[ink, styles.bold, { fontSize: px(11.5) }]}>
            Order total
          </NativeText>
          <NativeText style={[ink, styles.bold, { fontSize: px(11.5) }]}>
            {money(total)}
          </NativeText>
        </NativeView>
        <NativeView style={styles.paperSum}>
          <NativeText style={muted}>Net payment received</NativeText>
          <NativeText style={ink}>{money(total)}</NativeText>
        </NativeView>
      </NativeView>
      {settings.showPaymentBreakdown ? (
        <NativeView style={styles.paperBreakdown}>
          <NativeText style={label}>PAYMENT BREAKDOWN</NativeText>
          <NativeView style={styles.paperSum}>
            <NativeText style={ink}>
              Cash <NativeText style={muted}>· 10:42</NativeText>
            </NativeText>
            <NativeText style={ink}>{money(total)}</NativeText>
          </NativeView>
        </NativeView>
      ) : null}
      {note ? (
        <NativeText
          style={[
            styles.paperNote,
            { color: palette.paperInk, fontSize: px(10.5) },
          ]}
        >
          {note}
        </NativeText>
      ) : null}
      <NativeText
        style={[
          styles.paperMade,
          { color: palette.paperFaint, fontSize: px(8.5) },
        ]}
      >
        Made with ẸwáTrade
      </NativeText>
    </NativeView>
  )
}

function formatSampleDate(date: Date) {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

const styles = StyleSheet.create({
  bold: { fontWeight: "800" },
  colAmount: { textAlign: "right", width: px(60) },
  colPrice: { textAlign: "right", width: px(56) },
  colQty: { textAlign: "right", width: px(26) },
  flex: { flex: 1, minWidth: 0 },
  paper: {
    borderRadius: px(10),
    boxShadow: "0 1px 2px rgba(0, 0, 0, 0.08), 0 6px 14px rgba(0, 0, 0, 0.08)",
    paddingBottom: px(12),
    paddingHorizontal: px(14),
    paddingTop: px(16),
  },
  paperAmount: {
    alignItems: "baseline",
    borderRadius: px(8),
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: px(8),
    marginTop: px(12),
    padding: px(10),
  },
  paperBreakdown: { marginTop: px(8) },
  paperDoc: { alignItems: "flex-end" },
  paperHead: { flexDirection: "row", gap: px(8) },
  paperLine: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: px(4),
    paddingVertical: px(5),
  },
  paperMade: { marginTop: px(8), textAlign: "center" },
  paperNote: { fontStyle: "italic", marginTop: px(10), textAlign: "center" },
  paperPill: {
    borderRadius: 999,
    marginTop: px(3),
    paddingHorizontal: px(7),
    paddingVertical: px(1),
  },
  paperSum: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: px(3),
  },
  paperSums: { marginTop: px(6) },
  paperTotal: { borderTopWidth: 1, marginTop: px(4), paddingTop: px(6) },
  paperTwo: { flexDirection: "row", gap: px(8), marginBottom: px(8) },
})
