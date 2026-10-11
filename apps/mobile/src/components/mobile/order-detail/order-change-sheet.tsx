import { ActionButton } from "@/components/mobile/action-button"
import {
  type CommercialOrder,
  commerceLineTitle,
  formatCommerceDateTime,
  formatCommerceQuantity,
} from "@/components/mobile/commerce/commerce-model"
import { FormField } from "@/components/mobile/form-field"
import {
  ListCard,
  RecordRow,
  ToggleRow,
} from "@/components/mobile/green-till/kit"
import { MoneyField } from "@/components/mobile/money-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Icon, type IconKeys } from "@/components/ui/icon"
import { Modal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import type { GreenTillTint } from "@/lib/green-till-theme"
import { ORDER_PAYMENT_METHODS } from "@/lib/order-action-sheet-model"
import { formatOrderDetailMoney as formatMinorMoney } from "@/lib/order-detail-dispatch-docket"
import { cn } from "@/lib/utils"
import { useTRPC } from "@/trpc/client"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils"
import DateTimePicker from "@react-native-community/datetimepicker"
import { useInfiniteQuery } from "@tanstack/react-query"
import { type ReactNode, useDeferredValue, useState } from "react"
import { Platform } from "react-native"
import type { OrderChangeSheet, OrderChanges } from "./use-order-changes"

// Stable arrays: a new snap-point array on every render can interrupt the
// close animation and leave the sheet unable to present again.
const SNAP_POINTS = ["88%"]
const SNAP_POINTS_LARGE_TEXT = ["94%"]

const TITLES: Record<OrderChangeSheet, string> = {
  menu: "Change order",
  customer: "Change customer",
  details: "Delivery and note",
  items: "Items and prices",
  cancel: "Cancel order",
  refund: "Refund",
  return: "Return items",
}

/** One bottom sheet: the Change menu and each change form inside it. */
export function OrderChangeSheetModal({
  changes,
  isOffline,
  onRecordPayment,
  order,
}: {
  changes: OrderChanges
  isOffline: boolean
  onRecordPayment: () => void
  order: CommercialOrder
}) {
  const largeText = useLargeTextLayout()
  const sheet = changes.sheet
  return (
    <Modal
      key={changes.instance}
      ref={changes.modalRef}
      snapPoints={largeText ? SNAP_POINTS_LARGE_TEXT : SNAP_POINTS}
      title={sheet === "menu" ? `Change ${order.orderNumber}` : TITLES[sheet]}
    >
      <View className="flex-1" key={sheet}>
        {sheet === "menu" ? (
          <ChangeMenu
            changes={changes}
            isOffline={isOffline}
            onRecordPayment={onRecordPayment}
            order={order}
          />
        ) : sheet === "customer" ? (
          <CustomerForm changes={changes} order={order} />
        ) : sheet === "details" ? (
          <DetailsForm changes={changes} order={order} />
        ) : sheet === "items" ? (
          <ItemsForm changes={changes} order={order} />
        ) : sheet === "cancel" ? (
          <CancelForm changes={changes} order={order} />
        ) : sheet === "refund" ? (
          <RefundForm changes={changes} order={order} />
        ) : (
          <ReturnForm changes={changes} order={order} />
        )}
      </View>
    </Modal>
  )
}

/* ---------- menu ---------- */

type MenuKey =
  | "customer"
  | "details"
  | "items"
  | "cancel"
  | "refund"
  | "returnLine"
  | "payment"

/** Design 03 "Can do now": only what works now; locked actions fold away. */
function ChangeMenu({
  changes,
  isOffline,
  onRecordPayment,
  order,
}: {
  changes: OrderChanges
  isOffline: boolean
  onRecordPayment: () => void
  order: CommercialOrder
}) {
  const [showLocked, setShowLocked] = useState(false)
  const options = changes.options
  const money = (value: number) => formatMinorMoney(value, order.currencyCode)
  const moved =
    order.amountPaidMinor > 0 ||
    order.lines.some(
      (line) => line.productFulfillments.length > 0 || line.serviceFulfillment,
    )
  const hasBalance = order.balanceDueMinor > 0 && order.status !== "CANCELLED"
  const waiting = !isOffline && changes.optionsLoading
  const reasonFor = (key: MenuKey) => {
    if (isOffline) return "Needs a connection"
    if (key === "payment") return null
    if (!options) return "Could not check this order · reload"
    const option = options[key]
    return option.allowed ? null : (option.reason ?? "Not available")
  }
  const all: Array<{
    key: MenuKey
    icon: IconKeys
    tint: GreenTillTint
    title: string
    meta: string
    onPress: () => void
    danger?: boolean
  }> = [
    {
      key: "returnLine",
      icon: "Package",
      tint: "amber",
      title: "Return items",
      meta: "Stock back, and money if you want",
      onPress: () => changes.go("return"),
    },
    {
      key: "refund",
      icon: "Undo2",
      tint: "rose",
      title: "Refund",
      meta: `Up to ${money(options?.refund.refundableMinor ?? order.amountPaidMinor)}`,
      onPress: () => changes.go("refund"),
    },
    ...(hasBalance
      ? [
          {
            key: "payment" as const,
            icon: "CreditCard" as const,
            tint: "mint" as const,
            title: "Record payment",
            meta: `${money(order.balanceDueMinor)} due`,
            onPress: onRecordPayment,
          },
        ]
      : []),
    {
      key: "details",
      icon: "Calendar",
      tint: "sky",
      title: "Delivery and note",
      meta: order.deliveryDueAt
        ? formatCommerceDateTime(order.deliveryDueAt)
        : "No delivery time",
      onPress: () => changes.go("details"),
    },
    {
      key: "customer",
      icon: "User",
      tint: "lilac",
      title: "Customer",
      meta: order.customerName || "Walk-in customer",
      onPress: () => changes.go("customer"),
    },
    {
      key: "items",
      icon: "SquarePen",
      tint: "amber",
      title: "Items and prices",
      meta: "Change quantity or price",
      onPress: () => changes.go("items"),
    },
    {
      key: "cancel",
      icon: "Ban",
      tint: "rose",
      title: "Cancel order",
      meta: "Releases reserved stock",
      onPress: () => changes.go("cancel"),
      danger: true,
    },
  ]
  // Before money or stock moves, taking payment and editing come first.
  const ordered = moved
    ? all
    : [
        ...all.filter(
          (action) => !["returnLine", "refund"].includes(action.key),
        ),
        ...all.filter((action) =>
          ["returnLine", "refund"].includes(action.key),
        ),
      ]
  const open = waiting
    ? ordered.filter((action) => action.key === "payment")
    : ordered.filter((action) => !reasonFor(action.key))
  const locked = waiting
    ? []
    : ordered.filter((action) => reasonFor(action.key))
  const paidLabel =
    order.status === "CANCELLED"
      ? "cancelled"
      : order.balanceDueMinor <= 0
        ? "paid"
        : order.amountPaidMinor > 0
          ? "part paid"
          : "unpaid"
  return (
    <BottomSheetKeyboardAwareScrollView
      bottomOffset={24}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-3 px-5 pb-8">
        <Text className="text-sm text-muted-foreground">
          {order.customerName || "Walk-in customer"} · {money(order.totalMinor)}{" "}
          · {paidLabel}
          {moved && order.status !== "CANCELLED" ? ", handed over" : ""}
        </Text>
        {open.length ? (
          <>
            <GroupLabel>You can do now</GroupLabel>
            <ListCard>
              {open.map((action) => (
                <RecordRow
                  accessibilityLabel={action.title}
                  avatar={{ icon: action.icon, tint: action.tint }}
                  danger={action.danger}
                  key={action.key}
                  meta={action.meta}
                  onPress={action.onPress}
                  stackDetails
                  status={
                    <Icon
                      className="size-[16px] text-muted-foreground"
                      name="ChevronRight"
                    />
                  }
                  testID={`order-change-${action.key}`}
                  title={action.title}
                />
              ))}
            </ListCard>
          </>
        ) : null}
        {waiting ? (
          <Text className="text-sm text-muted-foreground">
            Checking what can change…
          </Text>
        ) : !open.length ? (
          <StatusBanner
            icon="Lock"
            message={reasonFor("details") ?? "Nothing can change right now."}
            title="Nothing can change right now"
            tone="muted"
          />
        ) : null}
        {locked.length ? (
          <View className="overflow-hidden rounded-[18px] bg-muted">
            <Pressable
              accessibilityLabel={`Not available now, ${locked.length}`}
              accessibilityRole="button"
              accessibilityState={{ expanded: showLocked }}
              className="min-h-11 flex-row items-center justify-between px-4 py-3"
              haptic
              onPress={() => setShowLocked((current) => !current)}
              testID="order-change-locked"
            >
              <Text className="text-[13px] font-extrabold text-muted-foreground">
                Not available now ({locked.length})
              </Text>
              <Icon
                className="size-[16px] text-muted-foreground"
                name={showLocked ? "ChevronUp" : "ChevronDown"}
              />
            </Pressable>
            {showLocked ? (
              <View className="px-4 pb-2">
                {locked.map((action, index) => (
                  <View
                    className={cn(
                      "flex-row items-start gap-3 py-2.5",
                      index > 0 && "border-t border-border",
                    )}
                    key={action.key}
                  >
                    <Icon
                      className="mt-0.5 size-[15px] text-muted-foreground"
                      name="Lock"
                    />
                    <View className="min-w-0 flex-1">
                      <Text className="text-[13px] font-bold text-foreground">
                        {action.title}
                      </Text>
                      <Text className="text-xs font-bold leading-5 text-tint-amber-foreground">
                        {reasonFor(action.key)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
        <View className="mt-1 flex-row gap-2">
          <Icon
            className="mt-0.5 size-[14px] text-muted-foreground"
            name="Info"
          />
          <Text className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
            Every change asks for a short reason and shows in Activity with your
            name.
          </Text>
        </View>
      </View>
    </BottomSheetKeyboardAwareScrollView>
  )
}

function reasonLines(reason: string) {
  const [first, ...rest] = reason.split(" · ")
  return [
    first ?? reason,
    ...rest.map((line) => line.charAt(0).toUpperCase() + line.slice(1)),
  ]
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <Text className="mt-2 text-[11.5px] font-extrabold uppercase tracking-wider text-muted-foreground">
      {children}
    </Text>
  )
}

/* ---------- shared form pieces ---------- */

function FormShell({
  changes,
  children,
  confirmLabel,
  confirmDisabled,
  destructive,
  onConfirm,
}: {
  changes: OrderChanges
  children: ReactNode
  confirmLabel: string
  confirmDisabled?: boolean
  destructive?: boolean
  onConfirm: () => void
}) {
  const largeText = useLargeTextLayout()
  return (
    <View className="flex-1">
      <BottomSheetKeyboardAwareScrollView
        bottomOffset={24}
        extraKeyboardSpace={24}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 px-5 pb-6">
          {children}
          {changes.error ? (
            <StatusBanner
              icon="AlertCircle"
              message={changes.error}
              title="Not saved"
              tone="destructive"
            />
          ) : null}
        </View>
      </BottomSheetKeyboardAwareScrollView>
      <View
        className={cn(
          "border-t border-border px-5 pb-5 pt-3",
          largeText ? "gap-2" : "flex-row gap-3",
        )}
      >
        <ActionButton
          className={largeText ? "w-full" : "w-auto flex-1"}
          disabled={changes.busy}
          onPress={() => changes.go("menu")}
          variant="outline"
        >
          Back
        </ActionButton>
        <ActionButton
          className={largeText ? "w-full" : "w-auto flex-[1.5]"}
          disabled={confirmDisabled || changes.busy}
          icon={destructive ? "Ban" : undefined}
          isLoading={changes.busy}
          loadingLabel="Saving…"
          onPress={onConfirm}
          testID="order-change-confirm"
          tone={destructive ? undefined : "gold"}
          variant={destructive ? "destructive" : undefined}
        >
          {confirmLabel}
        </ActionButton>
      </View>
    </View>
  )
}

function Chips<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label?: string
  onChange: (value: T) => void
  options: readonly (readonly [T, string])[]
  value: T
}) {
  return (
    <View className="gap-2">
      {label ? (
        <Text className="text-sm font-bold text-foreground">{label}</Text>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {options.map(([key, text]) => (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: value === key }}
            className={cn(
              // Same border width both ways: dropping the border on select
              // leaves the label undrawn on Android.
              "min-h-11 justify-center rounded-full border px-4",
              value === key
                ? "border-foreground bg-foreground"
                : "border-border bg-card",
            )}
            haptic
            key={key}
            onPress={() => onChange(key)}
          >
            <Text
              className={cn(
                "text-[13px] font-bold",
                value === key ? "text-background" : "text-foreground",
              )}
            >
              {text}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

/** Quick reasons, or "Other" to type one. Returns the reason to send. */
function useReason(options: string[]) {
  const [choice, setChoice] = useState(options[0] ?? "Other")
  const [typed, setTyped] = useState("")
  const value = choice === "Other" ? typed.trim() : choice
  const field = (
    <View className="gap-3">
      <Chips
        label="Reason"
        onChange={setChoice}
        options={[...options, "Other"].map((text) => [text, text] as const)}
        value={choice}
      />
      {choice === "Other" ? (
        <FormField
          label="Reason"
          maxLength={500}
          onChangeText={setTyped}
          placeholder="What happened"
          value={typed}
        />
      ) : null}
    </View>
  )
  return { choice, value, field }
}

function Effect({
  icon,
  message,
  title,
  tone = "primary",
}: {
  icon: IconKeys
  message: string
  title: string
  tone?: "primary" | "warning" | "success" | "muted"
}) {
  return (
    <StatusBanner icon={icon} message={message} title={title} tone={tone} />
  )
}

/* ---------- customer ---------- */

function CustomerForm({
  changes,
  order,
}: {
  changes: OrderChanges
  order: CommercialOrder
}) {
  const trpc = useTRPC()
  const [search, setSearch] = useState("")
  const query = useDeferredValue(search.trim())
  const [selected, setSelected] = useState<{
    id: string | null
    name: string
  } | null>(null)
  const reason = useReason(["Wrong customer picked", "Customer asked"])
  const directory = useInfiniteQuery(
    trpc.customers.listPage.infiniteQueryOptions(
      { limit: 20, query: query || undefined },
      { getNextPageParam: (page) => page.nextCursor, retry: false },
    ),
  )
  const customers = directory.data?.pages.flatMap((page) => page.items) ?? []
  const target = selected?.name ?? "the new customer"
  return (
    <FormShell
      changes={changes}
      confirmDisabled={!selected || !reason.value}
      confirmLabel="Save customer"
      onConfirm={() =>
        selected &&
        void changes.saveMetadata(
          { customerId: selected.id },
          reason.value,
          `Customer changed to ${selected.name}.`,
        )
      }
    >
      <FormField
        autoCapitalize="none"
        label="Find customer"
        leadingIcon="Search"
        onChangeText={setSearch}
        placeholder="Name or phone"
        value={search}
        variant="till-search"
      />
      <ListCard>
        <RecordRow
          avatar={{ icon: "Store", tint: "sky" }}
          meta="No customer on this order"
          onPress={() => setSelected({ id: null, name: "Walk-in customer" })}
          status={selected?.id === null ? <Selected /> : null}
          title="Walk-in customer"
        />
        {customers.map((customer) => (
          <RecordRow
            avatar={{
              initials: initials(customer.name),
              tint: "lilac",
            }}
            key={customer.id}
            meta={
              customer.id === order.customerId
                ? "Current customer"
                : customer.phone || customer.email || "No contact details"
            }
            onPress={
              customer.id === order.customerId
                ? undefined
                : () => setSelected({ id: customer.id, name: customer.name })
            }
            status={selected?.id === customer.id ? <Selected /> : null}
            title={customer.name}
          />
        ))}
      </ListCard>
      {directory.isPending ? (
        <Text className="text-sm text-muted-foreground">
          Loading customers…
        </Text>
      ) : null}
      {reason.field}
      <Effect
        icon="Info"
        message="Items, prices and payments stay the same."
        title={`Receipts and reminders go to ${target}`}
      />
    </FormShell>
  )
}

function Selected() {
  return <Icon className="size-[20px] text-primary" name="CheckCircle2" />
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?"

/* ---------- delivery and note ---------- */

function DetailsForm({
  changes,
  order,
}: {
  changes: OrderChanges
  order: CommercialOrder
}) {
  const initial = order.deliveryDueAt ? new Date(order.deliveryDueAt) : null
  const [due, setDue] = useState<Date | null>(initial)
  const [picker, setPicker] = useState<"date" | "time" | null>(null)
  const [note, setNote] = useState(order.notes ?? "")
  const reason = useReason(["Customer asked", "Our mistake"])
  const dueChanged = (due?.getTime() ?? null) !== (initial?.getTime() ?? null)
  const noteChanged = note.trim() !== (order.notes ?? "").trim()
  const moved =
    order.amountPaidMinor > 0 ||
    order.lines.some((line) => line.productFulfillments.length > 0)
  const quick = (days: number, hour: number) => {
    const next = new Date()
    next.setDate(next.getDate() + days)
    next.setHours(hour, 0, 0, 0)
    return next
  }
  return (
    <FormShell
      changes={changes}
      confirmDisabled={(!dueChanged && !noteChanged) || !reason.value}
      confirmLabel="Save"
      onConfirm={() =>
        void changes.saveMetadata(
          {
            ...(dueChanged
              ? { deliveryDueAt: due ? due.toISOString() : null }
              : {}),
            ...(noteChanged ? { notes: note.trim() || null } : {}),
          },
          reason.value,
          dueChanged && noteChanged
            ? "Delivery and note saved."
            : dueChanged
              ? "Delivery moved."
              : "Note saved.",
        )
      }
    >
      <View className="gap-2">
        <Text className="text-sm font-bold text-foreground">Delivery</Text>
        <Text className="text-[15px] font-bold text-foreground" selectable>
          {due ? formatCommerceDateTime(due) : "No delivery time"}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {(
            [
              ["Today, 5 pm", () => setDue(quick(0, 17))],
              ["Tomorrow, 9 am", () => setDue(quick(1, 9))],
              ["Pick date", () => setPicker("date")],
              ["Pick time", () => setPicker("time")],
            ] as const
          ).map(([label, onPress]) => (
            <Pressable
              accessibilityRole="button"
              className="min-h-11 justify-center rounded-full border border-border bg-card px-4"
              haptic
              key={label}
              onPress={onPress}
            >
              <Text className="text-[13px] font-bold text-foreground">
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        {picker ? (
          <DateTimePicker
            mode={picker}
            onChange={(event, next) => {
              if (Platform.OS !== "ios" || event.type === "dismissed")
                setPicker(null)
              if (event.type === "set" && next) setDue(next)
            }}
            value={due ?? new Date()}
          />
        ) : null}
      </View>
      <FormField
        label="Note"
        maxLength={2000}
        multiline
        onChangeText={setNote}
        placeholder="Shown on the order and receipt"
        value={note}
      />
      {reason.field}
      {moved ? (
        <Effect
          icon="Info"
          message="Delivery and note move no money or stock, so they stay editable after payment."
          title="Safe to change"
          tone="success"
        />
      ) : null}
    </FormShell>
  )
}

/* ---------- items and prices ---------- */

type LineDraft = { quantity: string; priceMajor: string }

function ItemsForm({
  changes,
  order,
}: {
  changes: OrderChanges
  order: CommercialOrder
}) {
  const lines = order.lines
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>(() =>
    Object.fromEntries(
      lines.map((line) => [
        line.id,
        {
          quantity: String(Number(line.quantity)),
          priceMajor: minorToMajorInput(line.unitPriceMinor ?? line.totalMinor),
        },
      ]),
    ),
  )
  const reason = useReason([
    "Customer added more",
    "Wrong quantity",
    "Price agreed",
  ])
  const rows = lines.map((line) => {
    const draft = drafts[line.id] ?? { quantity: "", priceMajor: "" }
    const quantity = Number(draft.quantity)
    const price = majorToMinor(draft.priceMajor)
    const unitPriced = line.unitPriceMinor !== null
    const total =
      price === null || !Number.isFinite(quantity) || quantity <= 0
        ? null
        : unitPriced
          ? Math.round(price * quantity)
          : price
    const quantityChanged =
      draft.quantity.trim() !== String(Number(line.quantity))
    const priceChanged =
      price !== (unitPriced ? line.unitPriceMinor : line.totalMinor)
    return {
      line,
      draft,
      quantity,
      price,
      total,
      unitPriced,
      quantityChanged,
      priceChanged,
    }
  })
  const invalid = rows.some((row) => row.total === null)
  const changed = rows.filter((row) => row.quantityChanged || row.priceChanged)
  const subtotal = rows.reduce((sum, row) => sum + (row.total ?? 0), 0)
  const newTotal =
    subtotal + order.serviceChargeMinor - order.discountMinor + order.taxMinor
  const delta = newTotal - order.totalMinor
  const money = (value: number) => formatMinorMoney(value, order.currencyCode)
  const step = (id: string, by: number) =>
    setDrafts((current) => {
      const value = Math.max(
        1,
        Math.round((Number(current[id]?.quantity) || 0) + by),
      )
      return {
        ...current,
        [id]: { ...current[id], quantity: String(value) } as LineDraft,
      }
    })
  return (
    <FormShell
      changes={changes}
      confirmDisabled={invalid || changed.length === 0 || !reason.value}
      confirmLabel="Save as new order"
      onConfirm={() =>
        void changes.saveItems(
          changed.map((row) => ({
            orderLineId: row.line.id,
            ...(row.quantityChanged ? { quantity: String(row.quantity) } : {}),
            ...(row.unitPriced
              ? row.priceChanged
                ? { unitPriceMinor: row.price ?? 0 }
                : {}
              : row.priceChanged || row.quantityChanged
                ? { enteredTotalMinor: row.price ?? 0 }
                : {}),
          })),
          reason.value,
        )
      }
    >
      {rows.map((row) => (
        <View className="gap-3 rounded-[18px] bg-muted p-3.5" key={row.line.id}>
          <View className="gap-0.5">
            <Text className="text-sm font-bold text-foreground">
              {commerceLineTitle(row.line)}
            </Text>
            {row.quantityChanged || row.priceChanged ? (
              <Text className="text-xs font-bold text-tint-amber-foreground">
                Was {formatCommerceQuantity(row.line.quantity)} ×{" "}
                {row.line.unitPriceMinor === null
                  ? money(row.line.totalMinor)
                  : money(row.line.unitPriceMinor)}
              </Text>
            ) : null}
          </View>
          <View className="flex-row items-end gap-2">
            <Pressable
              accessibilityLabel={`One less ${commerceLineTitle(row.line)}`}
              accessibilityRole="button"
              className="size-12 items-center justify-center rounded-[14px] bg-card"
              haptic
              onPress={() => step(row.line.id, -1)}
            >
              <Icon className="size-[18px] text-primary" name="Minus" />
            </Pressable>
            <View className="min-w-0 flex-1">
              <FormField
                keyboardType="decimal-pad"
                label="Quantity"
                onChangeText={(quantity) =>
                  setDrafts((current) => ({
                    ...current,
                    [row.line.id]: { ...row.draft, quantity },
                  }))
                }
                value={row.draft.quantity}
              />
            </View>
            <Pressable
              accessibilityLabel={`One more ${commerceLineTitle(row.line)}`}
              accessibilityRole="button"
              className="size-12 items-center justify-center rounded-[14px] bg-card"
              haptic
              onPress={() => step(row.line.id, 1)}
            >
              <Icon className="size-[18px] text-primary" name="Plus" />
            </Pressable>
          </View>
          <MoneyField
            currencyCode={order.currencyCode}
            label={row.unitPriced ? "Price each" : "Item total"}
            onChangeValue={(priceMajor) =>
              setDrafts((current) => ({
                ...current,
                [row.line.id]: { ...row.draft, priceMajor },
              }))
            }
            value={row.draft.priceMajor}
          />
        </View>
      ))}
      <View className="flex-row items-center justify-between rounded-[16px] bg-tint-amber px-4 py-3">
        <View>
          <Text className="text-xs font-bold text-tint-amber-foreground">
            New total
          </Text>
          <Text className="text-xs text-tint-amber-foreground">
            {delta === 0
              ? "No change yet"
              : `${delta > 0 ? "+" : "−"}${money(Math.abs(delta))}`}
          </Text>
        </View>
        <Text className="text-xl font-extrabold tabular-nums text-tint-amber-foreground">
          {money(newTotal)}
        </Text>
      </View>
      {reason.field}
      <Effect
        icon="ArrowLeftRight"
        message={`${order.orderNumber} closes as replaced and links to the new order. Reserved stock moves to it.`}
        title="Saves as a new order"
      />
    </FormShell>
  )
}

/* ---------- cancel ---------- */

function CancelForm({
  changes,
  order,
}: {
  changes: OrderChanges
  order: CommercialOrder
}) {
  const reason = useReason([
    "Customer changed their mind",
    "Duplicate order",
    "Out of stock",
  ])
  const releases = changes.cancelReview?.releases ?? []
  const title = (orderLineId: string) => {
    const line = order.lines.find((candidate) => candidate.id === orderLineId)
    return line ? commerceLineTitle(line) : "Item"
  }
  return (
    <FormShell
      changes={changes}
      confirmDisabled={!reason.value || changes.cancelReviewLoading}
      confirmLabel="Cancel order"
      destructive
      onConfirm={() => void changes.cancelOrder(reason.value)}
    >
      <Text className="text-[15px] font-bold text-foreground">
        Cancel {order.orderNumber} for{" "}
        {order.customerName || "Walk-in customer"}?
      </Text>
      <Effect
        icon="Package"
        message={
          changes.cancelReviewLoading
            ? "Checking reserved stock…"
            : releases.length
              ? releases
                  .map(
                    (release) =>
                      `${formatCommerceQuantity(release.quantity)} × ${title(release.orderLineId)}`,
                  )
                  .join(", ")
              : "No stock is reserved for this order."
        }
        title="Stock goes back on the shelf"
      />
      <Effect
        icon="CreditCard"
        message="Nothing was paid on this order."
        title="No refund needed"
        tone="success"
      />
      <Effect
        icon="ReceiptText"
        message="It is marked cancelled, with your reason, in Activity."
        title="The order stays in your records"
        tone="muted"
      />
      {reason.field}
    </FormShell>
  )
}

/* ---------- refund: design 02 "Amount + outcome" ---------- */

function OutcomeRow({
  after,
  before,
  emphasized,
  label,
}: {
  after: string
  before?: string
  emphasized?: boolean
  label: string
}) {
  return (
    <View className="flex-row items-baseline justify-between gap-3">
      <Text
        className={cn(
          "text-[13px] text-tint-amber-foreground",
          emphasized && "font-extrabold",
        )}
      >
        {label}
      </Text>
      <View className="flex-row items-baseline gap-1.5">
        {before ? (
          <Text className="text-[13px] tabular-nums text-tint-amber-foreground line-through opacity-70">
            {before}
          </Text>
        ) : null}
        {before ? (
          <Text className="text-[13px] text-tint-amber-foreground">→</Text>
        ) : null}
        <Text
          className={cn(
            "text-[13px] font-bold tabular-nums text-tint-amber-foreground",
            emphasized && "text-[15px] font-extrabold",
          )}
        >
          {after}
        </Text>
      </View>
    </View>
  )
}

function Outcome({ children }: { children: ReactNode }) {
  return (
    <View className="gap-2 rounded-[16px] bg-tint-amber px-4 py-3">
      <View className="flex-row items-center gap-2">
        <Icon className="size-[15px] text-tint-amber-foreground" name="Info" />
        <Text className="text-[13px] font-extrabold text-tint-amber-foreground">
          What the order shows after
        </Text>
      </View>
      {children}
    </View>
  )
}

function RefundForm({
  changes,
  order,
}: {
  changes: OrderChanges
  order: CommercialOrder
}) {
  const money = (value: number) => formatMinorMoney(value, order.currencyCode)
  const paid = changes.options?.refund.refundableMinor ?? order.amountPaidMinor
  const credit = changes.options?.credit
  const [pick, setPick] = useState<"all" | "half" | "other">("all")
  const [other, setOther] = useState("")
  const [method, setMethod] =
    useState<(typeof ORDER_PAYMENT_METHODS)[number][0]>("cash")
  const [reference, setReference] = useState("")
  const reason = useReason(["Overcharged", "Items came back", "Goodwill"])
  const amountMinor =
    pick === "all"
      ? paid
      : pick === "half"
        ? Math.floor(paid / 2)
        : majorToMinor(other)
  const valid = amountMinor !== null && amountMinor > 0 && amountMinor <= paid
  const amount = valid ? amountMinor : 0
  const overcharged = reason.choice === "Overcharged"
  const lowerTotal = overcharged && Boolean(credit?.allowed)
  const paidAfter = paid - amount
  const totalAfter = lowerTotal ? order.totalMinor - amount : order.totalMinor
  const dueAfter = Math.max(0, totalAfter - paidAfter)
  return (
    <FormShell
      changes={changes}
      confirmDisabled={!valid || !reason.value}
      confirmLabel={valid ? `Refund ${money(amount)}` : "Refund"}
      onConfirm={() =>
        valid &&
        void changes.recordRefund({
          amountMinor: amount,
          lowerTotal,
          method,
          reason: reason.value,
          reference,
        })
      }
    >
      <Text className="text-sm text-muted-foreground">
        Paid so far {money(paid)} · total {money(order.totalMinor)}
      </Text>
      <View className="gap-3">
        <Chips
          label="How much goes back?"
          onChange={setPick}
          options={[
            ["all", `All ${money(paid)}`],
            ["half", "Half"],
            ["other", "Other amount"],
          ]}
          value={pick}
        />
        {pick === "other" ? (
          <MoneyField
            currencyCode={order.currencyCode}
            error={
              amountMinor !== null && amountMinor > paid
                ? `At most ${money(paid)} was paid.`
                : undefined
            }
            label="Amount to give back"
            onChangeValue={setOther}
            value={other}
          />
        ) : null}
      </View>
      <Chips
        label="Paid back by"
        onChange={setMethod}
        options={ORDER_PAYMENT_METHODS}
        value={method}
      />
      {reason.field}
      {reason.choice === "Items came back" ? (
        <StatusBanner
          actionLabel="Open"
          icon="Package"
          message="It puts the stock back and works out the money from what came back."
          onActionPress={() => changes.go("return")}
          title="Use Return items instead"
          tone="primary"
        />
      ) : null}
      {overcharged && credit && !credit.allowed ? (
        <StatusBanner
          icon="Lock"
          message={credit.reason ?? "This order's total cannot change."}
          title="The total cannot drop here"
          tone="warning"
        />
      ) : null}
      <Outcome>
        <OutcomeRow
          after={money(paidAfter)}
          before={valid ? money(paid) : undefined}
          label="Paid"
        />
        <OutcomeRow
          after={money(totalAfter)}
          before={lowerTotal && valid ? money(order.totalMinor) : undefined}
          label="Total"
        />
        <OutcomeRow
          after={money(dueAfter)}
          emphasized
          label="Still to collect"
        />
      </Outcome>
      {valid && dueAfter > 0 && !lowerTotal ? (
        <StatusBanner
          icon="AlertCircle"
          message="Choose “Overcharged” if the price was wrong, so the total drops too."
          title={`${money(dueAfter)} will show as owed`}
          tone="destructive"
        />
      ) : null}
      <FormField
        label="Reference"
        onChangeText={setReference}
        placeholder="Optional"
        value={reference}
      />
    </FormShell>
  )
}

/* ---------- return: design 02 "All lines + money" ---------- */

const DISPOSITIONS = [
  ["restock", "Back on shelf"],
  ["quarantine", "Set aside"],
  ["damaged", "Damaged"],
  ["no_restock", "Not restocked"],
] as const
type Disposition = (typeof DISPOSITIONS)[number][0]

function ReturnForm({
  changes,
  order,
}: {
  changes: OrderChanges
  order: CommercialOrder
}) {
  const money = (value: number) => formatMinorMoney(value, order.currencyCode)
  const returnable = changes.options?.returnLine.lines ?? []
  const credit = changes.options?.credit
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    returnable.length === 1 && returnable[0]
      ? {
          [returnable[0].orderLineId]: Math.min(
            1,
            Number(returnable[0].quantity),
          ),
        }
      : {},
  )
  const [conditions, setConditions] = useState<Record<string, Disposition>>({})
  const [moneyBack, setMoneyBack] = useState(Boolean(credit?.allowed))
  const [method, setMethod] =
    useState<(typeof ORDER_PAYMENT_METHODS)[number][0]>("cash")
  const reason = useReason(["Customer returned it", "Wrong item", "Damaged"])
  const rows = returnable.flatMap((entry) => {
    const line = order.lines.find(
      (candidate) => candidate.id === entry.orderLineId,
    )
    if (!line) return []
    const max = Number(entry.quantity)
    const quantity = quantities[line.id] ?? 0
    const sold = Number(line.quantity)
    const value = sold > 0 ? Math.round((line.totalMinor * quantity) / sold) : 0
    return [{ line, max, quantity, value }]
  })
  const chosen = rows.filter((row) => row.quantity > 0)
  const value = Math.min(
    order.totalMinor,
    chosen.reduce((sum, row) => sum + row.value, 0),
  )
  const moneyOn = moneyBack && Boolean(credit?.allowed)
  const totalAfter = order.totalMinor - value
  const refund = Math.max(0, order.amountPaidMinor - totalAfter)
  const dueAfter = Math.max(0, totalAfter - (order.amountPaidMinor - refund))
  const step = (id: string, max: number, by: number) =>
    setQuantities((current) => {
      const next = Math.max(0, Math.min(max, (current[id] ?? 0) + by))
      return { ...current, [id]: Number(next.toFixed(6)) }
    })
  const restocked = chosen.filter(
    (row) => (conditions[row.line.id] ?? "restock") === "restock",
  )
  return (
    <FormShell
      changes={changes}
      confirmDisabled={!chosen.length || !reason.value}
      confirmLabel={
        !moneyOn || !chosen.length
          ? "Record return"
          : refund > 0
            ? `Refund ${money(refund)}`
            : `Take off ${money(value)}`
      }
      onConfirm={() =>
        void changes.returnItems({
          lines: chosen.map((row) => ({
            disposition: conditions[row.line.id] ?? "restock",
            orderLineId: row.line.id,
            quantity: String(row.quantity),
          })),
          money: moneyOn ? { method } : null,
          reason: reason.value,
        })
      }
    >
      <Text className="text-sm text-muted-foreground">
        Set how many of each came back.
      </Text>
      {rows.map((row) => (
        <View
          className={cn(
            "gap-3 rounded-[18px] bg-muted p-3.5",
            row.quantity === 0 && "opacity-70",
          )}
          key={row.line.id}
        >
          <View>
            <Text className="text-sm font-bold text-foreground">
              {commerceLineTitle(row.line)}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {formatCommerceQuantity(row.max)} handed over ·{" "}
              {money(
                Math.round(row.line.totalMinor / Number(row.line.quantity)),
              )}{" "}
              each
            </Text>
          </View>
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-row items-center rounded-[14px] bg-card">
              <Pressable
                accessibilityLabel={`One less ${commerceLineTitle(row.line)}`}
                accessibilityRole="button"
                className="size-11 items-center justify-center"
                haptic
                onPress={() => step(row.line.id, row.max, -1)}
              >
                <Icon className="size-[18px] text-primary" name="Minus" />
              </Pressable>
              <Text className="min-w-[56px] text-center text-[15px] font-bold tabular-nums text-foreground">
                {formatCommerceQuantity(row.quantity)}
                <Text className="text-xs text-muted-foreground">
                  {" "}
                  / {formatCommerceQuantity(row.max)}
                </Text>
              </Text>
              <Pressable
                accessibilityLabel={`One more ${commerceLineTitle(row.line)}`}
                accessibilityRole="button"
                className="size-11 items-center justify-center"
                haptic
                onPress={() => step(row.line.id, row.max, 1)}
              >
                <Icon className="size-[18px] text-primary" name="Plus" />
              </Pressable>
            </View>
            {row.quantity > 0 ? (
              <Text className="text-sm font-bold tabular-nums text-foreground">
                {money(row.value)}
              </Text>
            ) : null}
          </View>
          {row.quantity > 0 ? (
            <Chips
              onChange={(next) =>
                setConditions((current) => ({
                  ...current,
                  [row.line.id]: next,
                }))
              }
              options={DISPOSITIONS}
              value={conditions[row.line.id] ?? "restock"}
            />
          ) : null}
        </View>
      ))}
      <View className="rounded-[18px] bg-card px-3.5 shadow-sm">
        <ToggleRow
          disabled={!credit?.allowed}
          icon={{ name: "Undo2", tint: "rose" }}
          onValueChange={setMoneyBack}
          sub={
            !credit?.allowed
              ? (credit?.reason ?? "Not available")
              : !chosen.length
                ? "Choose what came back first"
                : refund > 0
                  ? `${money(refund)} back to the customer`
                  : `Takes ${money(value)} off what they owe`
          }
          title={
            refund > 0 || !chosen.length
              ? "Give money back now"
              : "Take it off what they owe"
          }
          value={moneyOn}
        />
      </View>
      {moneyOn && chosen.length ? (
        <>
          {refund > 0 ? (
            <Chips
              label="Paid back by"
              onChange={setMethod}
              options={ORDER_PAYMENT_METHODS}
              value={method}
            />
          ) : null}
          <Outcome>
            <OutcomeRow after={money(value)} label="Returned value" />
            <OutcomeRow
              after={money(totalAfter)}
              before={money(order.totalMinor)}
              label="Total"
            />
            <OutcomeRow
              after={money(dueAfter)}
              emphasized
              label="Still to collect"
            />
          </Outcome>
        </>
      ) : null}
      {reason.field}
      {chosen.length ? (
        <Text className="text-xs leading-5 text-muted-foreground">
          Stock back:{" "}
          {restocked.length
            ? restocked
                .map(
                  (row) =>
                    `${formatCommerceQuantity(row.quantity)} × ${commerceLineTitle(row.line)}`,
                )
                .join(", ")
            : "none"}
          {" · "}Money back: {moneyOn && refund > 0 ? money(refund) : "none"}
        </Text>
      ) : null}
    </FormShell>
  )
}
