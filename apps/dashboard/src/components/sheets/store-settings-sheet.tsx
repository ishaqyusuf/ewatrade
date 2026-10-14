"use client"
import {
  assistantObjectParams,
  closedAssistantObjectParams,
} from "@/hooks/use-assistant-receipt"
import { useTRPC } from "@/trpc/client"
import { Button, Sheet } from "@ewatrade/ui"
import { useQuery } from "@tanstack/react-query"
import { useQueryStates } from "nuqs"
import { SheetFrame } from "./sheet-frame"

const sections = {
  store_receipt_settings: "Receipt settings",
  store_reminder_settings: "Order reminders",
  store_order_visibility: "Sales rep order visibility",
} as const
type SectionKind = keyof typeof sections
const yesNo = (value: boolean) => (value ? "Yes" : "No")

export function useStoreSettingsParams() {
  const [{ storeSettings, storeSettingsSection }, setParams] = useQueryStates(
    assistantObjectParams,
    { history: "push" },
  )
  const section =
    storeSettingsSection && storeSettingsSection in sections
      ? (storeSettingsSection as SectionKind)
      : null
  return {
    isOpen: storeSettings !== null,
    storeId: storeSettings,
    section,
    open: (storeId: string, kind: SectionKind) =>
      setParams({
        ...closedAssistantObjectParams,
        storeSettings: storeId,
        storeSettingsSection: kind,
      }),
    close: () => setParams({ storeSettings: null, storeSettingsSection: null }),
  }
}

/**
 * The current settings of the Store a receipt names. A settings change keeps no
 * audit record of its own, so the receipt holds the values saved then and this
 * sheet shows today's values, labelled as current.
 */
export function StoreSettingsSheet() {
  const { isOpen, storeId, section, close } = useStoreSettingsParams()
  const trpc = useTRPC()
  const enabled = isOpen && Boolean(storeId)
  const input = { storeId: storeId ?? undefined }
  const options = { enabled, retry: false, staleTime: 0 } as const
  const receipts = useQuery(
    trpc.orders.receiptSettings.queryOptions(input, {
      ...options,
      enabled: enabled && section === "store_receipt_settings",
    }),
  )
  const reminders = useQuery(
    trpc.orders.reminderSettings.queryOptions(input, {
      ...options,
      enabled: enabled && section === "store_reminder_settings",
    }),
  )
  const visibility = useQuery(
    trpc.stores.orderVisibility.queryOptions(input, {
      ...options,
      enabled: enabled && section === "store_order_visibility",
    }),
  )
  const query =
    section === "store_receipt_settings"
      ? receipts
      : section === "store_reminder_settings"
        ? reminders
        : visibility
  const loading = query.isPending || query.isFetching || query.isPaused
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) void close()
      }}
    >
      {isOpen ? (
        <SheetFrame
          title={section ? sections[section] : "Store settings"}
          description="Current values. The saved receipt shows what was changed then."
          footer={
            section ? (
              <Button
                variant="outline"
                disabled={loading}
                onClick={() => void query.refetch()}
              >
                Refresh
              </Button>
            ) : null
          }
        >
          {!storeId || !section ? (
            <p role="alert">
              This settings link is invalid. Close it and open the saved receipt
              again.
            </p>
          ) : loading ? (
            <output aria-live="polite">Loading current settings…</output>
          ) : query.isError ? (
            <div role="alert" className="grid gap-3">
              <p>
                These settings are unavailable for your current business, access
                or plan.
              </p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          ) : section === "store_receipt_settings" && receipts.data ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Store</dt>
              <dd>{receipts.data.storeName}</dd>
              <dt className="text-muted-foreground">Using</dt>
              <dd>
                {receipts.data.source === "store"
                  ? "This Store's own settings"
                  : "Business defaults"}
              </dd>
              <dt className="text-muted-foreground">Customer name</dt>
              <dd>{yesNo(receipts.data.effective.showCustomerName)}</dd>
              <dt className="text-muted-foreground">Payment breakdown</dt>
              <dd>{yesNo(receipts.data.effective.showPaymentBreakdown)}</dd>
              <dt className="text-muted-foreground">Thank-you note</dt>
              <dd className="break-words">
                {receipts.data.effective.thankYouNote || "None"}
              </dd>
            </dl>
          ) : section === "store_reminder_settings" && reminders.data ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Reminder emails</dt>
              <dd>{reminders.data.enabled ? "On" : "Off"}</dd>
              <dt className="text-muted-foreground">Day before</dt>
              <dd>{yesNo(reminders.data.dayBeforeEnabled)}</dd>
              <dt className="text-muted-foreground">Same day</dt>
              <dd>{yesNo(reminders.data.sameDayEnabled)}</dd>
            </dl>
          ) : section === "store_order_visibility" && visibility.data ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Store</dt>
              <dd>{visibility.data.name}</dd>
              <dt className="text-muted-foreground">Sales reps see</dt>
              <dd>
                {visibility.data.salesRepOrderVisibility === "ALL_STORE_ORDERS"
                  ? "All orders in this Store"
                  : "Only orders they created"}
              </dd>
            </dl>
          ) : null}
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}
