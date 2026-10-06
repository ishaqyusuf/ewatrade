import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { MobileScreen } from "@/components/mobile/screen"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { normalizeMobileRole } from "@/lib/mobile-roles"
import { useOperationalModeStore } from "@/store/operationalModeStore"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { receiptSettingsSchema } from "@ewatrade/order-receipts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "expo-router"
import { useState } from "react"

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string
  checked: boolean
  disabled: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <Pressable
      className="min-h-14 flex-row items-center justify-between gap-4 border-b border-border py-4"
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
    >
      <Text className="flex-1 font-semibold">{label}</Text>
      <Text
        className={checked ? "font-bold text-primary" : "text-muted-foreground"}
      >
        {checked ? "On" : "Off"}
      </Text>
    </Pressable>
  )
}

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
  return (
    <MobileScreen scroll contentClassName="gap-5 pb-10">
      <ActionButton
        variant="ghost"
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace("/admin-home")
        }
      >
        Close receipt settings
      </ActionButton>
      <Text className="text-2xl font-bold">Receipt settings</Text>
      <Text className="text-sm text-muted-foreground">
        One receipt template, used across dashboard and mobile. Store settings
        can override business defaults.
      </Text>
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
      ) : query.data ? (
        <ReceiptSettingsEditor
          key={`${query.data.storeId}:${scope}`}
          data={query.data}
          scope={scope}
          setScope={setScope}
        />
      ) : (
        <Text>Loading receipt settings…</Text>
      )}
    </MobileScreen>
  )
}

function ReceiptSettingsEditor({
  data,
  scope,
  setScope,
}: {
  data: RouterOutputs["orders"]["receiptSettings"]
  scope: "business" | "store"
  setScope: (value: "business" | "store") => void
}) {
  const trpc = useTRPC()
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
  const change = (patch: Partial<typeof settings>) => {
    setSettings((current) => ({ ...current, ...patch }))
    setSaved(false)
    mutation.reset()
  }
  return (
    <View className="gap-4">
      <View className="flex-row gap-3">
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
            This Store
          </ActionButton>
        </View>
      </View>
      <Text className="font-semibold">
        {scope === "business" ? "Business defaults" : data.storeName}
      </Text>
      {scope === "store" ? (
        <Toggle
          label="Use business defaults"
          checked={inherit}
          disabled={mutation.isPending}
          onChange={(value) => {
            setInherit(value)
            setSaved(false)
          }}
        />
      ) : null}
      <Toggle
        label="Show customer name"
        checked={displayed.showCustomerName}
        disabled={locked}
        onChange={(value) => change({ showCustomerName: value })}
      />
      <Toggle
        label="Show payment breakdown"
        checked={displayed.showPaymentBreakdown}
        disabled={locked}
        onChange={(value) => change({ showPaymentBreakdown: value })}
      />
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
        {displayed.thankYouNote.length}/300 · Business identity, Order totals
        and payment status are included automatically.
      </Text>
      {mutation.isError ? (
        <StatusBanner tone="destructive" message={mutation.error.message} />
      ) : saved ? (
        <StatusBanner
          tone="success"
          message="Receipt settings saved. New receipts use these settings."
        />
      ) : null}
      <ActionButton
        disabled={!valid.success || mutation.isPending}
        isLoading={mutation.isPending}
        loadingLabel="Saving settings"
        onPress={() => {
          if (!valid.success) return
          setSaved(false)
          mutation.mutate({
            storeId: data.storeId,
            scope,
            settings: inherited ? null : valid.data,
          })
        }}
      >
        Save receipt settings
      </ActionButton>
    </View>
  )
}
