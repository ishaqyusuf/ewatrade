import { ActionButton } from "@/components/mobile/action-button"
import {
  type CommercialOrder,
  commerceLineTitle,
  formatCommerceDateTime,
  formatCommerceQuantity,
} from "@/components/mobile/commerce/commerce-model"
import { FormField } from "@/components/mobile/form-field"
import { ListCard, RecordRow } from "@/components/mobile/green-till/kit"
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

const TITLES: Record<OrderChangeSheet, string> = {
  menu: "Change order",
  customer: "Change customer",
  details: "Delivery and note",
  items: "Items and prices",
  cancel: "Cancel order",
  refund: "Refund",
  return: "Return an item",
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
      ref={changes.modalRef}
      snapPoints={[largeText ? "94%" : "88%"]}
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
  const options = changes.options
  const lockedAll = isOffline
    ? "Needs a connection"
    : changes.optionsLoading
      ? "Checking…"
      : !options
        ? "Could not check this order · reload"
        : null
  const row = (
    key: "customer" | "details" | "items" | "cancel" | "refund" | "returnLine",
    input: {
      icon: IconKeys
      tint: GreenTillTint
      title: string
      meta: string
      target: OrderChangeSheet
      danger?: boolean
    },
  ) => {
    const option = options?.[key]
    const reason = lockedAll ?? (option?.allowed ? null : option?.reason)
    return (
      <RecordRow
        accessibilityLabel={
          reason ? `${input.title}, locked: ${reason}` : input.title
        }
        avatar={{ icon: reason ? "Lock" : input.icon, tint: input.tint }}
        danger={input.danger && !reason}
        meta={reason ? reasonLines(reason) : input.meta}
        onPress={reason ? undefined : () => changes.go(input.target)}
        stackDetails
        status={
          reason ? null : (
            <Icon
              className="size-[16px] text-muted-foreground"
              name="ChevronRight"
            />
          )
        }
        testID={`order-change-${input.target}`}
        title={input.title}
      />
    )
  }
  const paid = order.amountPaidMinor > 0
  return (
    <BottomSheetKeyboardAwareScrollView
      bottomOffset={24}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-3 px-5 pb-8">
        <Text className="text-sm text-muted-foreground">
          {order.customerName || "Walk-in customer"} ·{" "}
          {formatMinorMoney(order.totalMinor, order.currencyCode)}
        </Text>
        <GroupLabel>Order</GroupLabel>
        <ListCard>
          {row("customer", {
            icon: "User",
            tint: "lilac",
            title: "Customer",
            meta: order.customerName || "Walk-in customer",
            target: "customer",
          })}
          {row("details", {
            icon: "Calendar",
            tint: "sky",
            title: "Delivery and note",
            meta: order.deliveryDueAt
              ? formatCommerceDateTime(order.deliveryDueAt)
              : "No delivery time",
            target: "details",
          })}
          {row("items", {
            icon: "SquarePen",
            tint: "amber",
            title: "Items and prices",
            meta: "Change quantity or price",
            target: "items",
          })}
        </ListCard>
        <GroupLabel>Money and stock</GroupLabel>
        <ListCard>
          {order.balanceDueMinor > 0 && order.status !== "CANCELLED" ? (
            <RecordRow
              avatar={{ icon: isOffline ? "Lock" : "CreditCard", tint: "mint" }}
              meta={
                isOffline
                  ? "Needs a connection"
                  : `${formatMinorMoney(order.balanceDueMinor, order.currencyCode)} due`
              }
              onPress={isOffline ? undefined : onRecordPayment}
              stackDetails
              status={
                isOffline ? null : (
                  <Icon
                    className="size-[16px] text-muted-foreground"
                    name="ChevronRight"
                  />
                )
              }
              testID="order-change-payment"
              title="Record payment"
            />
          ) : null}
          {row("refund", {
            icon: "Undo2",
            tint: "rose",
            title: "Refund",
            meta: paid
              ? `Up to ${formatMinorMoney(options?.refund.refundableMinor ?? order.amountPaidMinor, order.currencyCode)}`
              : "Nothing paid yet",
            target: "refund",
          })}
          {row("returnLine", {
            icon: "Package",
            tint: "amber",
            title: "Return an item",
            meta: "Put stock back or record damage",
            target: "return",
          })}
        </ListCard>
        <View className="mt-2">
          <ListCard>
            {row("cancel", {
              icon: "Ban",
              tint: "rose",
              title: "Cancel order",
              meta: "Releases reserved stock",
              target: "cancel",
              danger: true,
            })}
          </ListCard>
        </View>
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
              "min-h-11 justify-center rounded-full px-4",
              value === key ? "bg-foreground" : "border border-border bg-card",
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
  return { value, field }
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
                      `${formatCommerceQuantity(release.quantity)} ${release.unitName} of ${title(release.orderLineId)}`,
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

/* ---------- refund ---------- */

function RefundForm({
  changes,
  order,
}: {
  changes: OrderChanges
  order: CommercialOrder
}) {
  const refundable =
    changes.options?.refund.refundableMinor ?? order.amountPaidMinor
  const [amount, setAmount] = useState(minorToMajorInput(refundable))
  const [method, setMethod] =
    useState<(typeof ORDER_PAYMENT_METHODS)[number][0]>("cash")
  const [reference, setReference] = useState("")
  const reason = useReason(["Customer returned items", "Overcharged"])
  const amountMinor = majorToMinor(amount)
  const tooMuch = amountMinor !== null && amountMinor > refundable
  return (
    <FormShell
      changes={changes}
      confirmDisabled={
        amountMinor === null || amountMinor <= 0 || tooMuch || !reason.value
      }
      confirmLabel={
        amountMinor && amountMinor > 0
          ? `Refund ${formatMinorMoney(amountMinor, order.currencyCode)}`
          : "Refund"
      }
      onConfirm={() =>
        amountMinor &&
        void changes.recordRefund({
          amountMinor,
          method,
          reason: reason.value,
          reference,
        })
      }
    >
      <MoneyField
        currencyCode={order.currencyCode}
        error={
          tooMuch
            ? `At most ${formatMinorMoney(refundable, order.currencyCode)} was paid.`
            : undefined
        }
        label="Amount to give back"
        onChangeValue={setAmount}
        value={amount}
      />
      <Chips
        label="Paid back by"
        onChange={setMethod}
        options={ORDER_PAYMENT_METHODS}
        value={method}
      />
      <FormField
        label="Reference"
        onChangeText={setReference}
        placeholder="Optional"
        value={reference}
      />
      {reason.field}
      <Effect
        icon="Info"
        message="Items stay as they are. Use Return an item to put stock back."
        title="Money only"
        tone="muted"
      />
    </FormShell>
  )
}

/* ---------- return ---------- */

const DISPOSITIONS = [
  ["restock", "Back on the shelf"],
  ["quarantine", "Set aside"],
  ["damaged", "Damaged"],
  ["no_restock", "Not restocked"],
] as const

function ReturnForm({
  changes,
  order,
}: {
  changes: OrderChanges
  order: CommercialOrder
}) {
  const returnable = changes.options?.returnLine.lines ?? []
  const [lineId, setLineId] = useState(returnable[0]?.orderLineId ?? "")
  const chosen = returnable.find((line) => line.orderLineId === lineId)
  const [quantity, setQuantity] = useState(
    chosen ? String(Number(chosen.quantity)) : "1",
  )
  const [disposition, setDisposition] =
    useState<(typeof DISPOSITIONS)[number][0]>("restock")
  const reason = useReason(["Customer returned it", "Wrong item", "Damaged"])
  const number = Number(quantity)
  const tooMany = chosen ? number > Number(chosen.quantity) : false
  const title = (orderLineId: string) => {
    const line = order.lines.find((candidate) => candidate.id === orderLineId)
    return line ? commerceLineTitle(line) : "Item"
  }
  return (
    <FormShell
      changes={changes}
      confirmDisabled={
        !chosen ||
        !Number.isFinite(number) ||
        number <= 0 ||
        tooMany ||
        !reason.value
      }
      confirmLabel="Record return"
      onConfirm={() =>
        chosen &&
        void changes.recordReturn({
          disposition,
          orderLineId: chosen.orderLineId,
          quantity: quantity.trim(),
          reason: reason.value,
        })
      }
    >
      <ListCard>
        {returnable.map((line) => (
          <RecordRow
            avatar={{ icon: "Package", tint: "amber" }}
            key={line.orderLineId}
            meta={`${formatCommerceQuantity(line.quantity)} handed over, not yet returned`}
            onPress={() => {
              setLineId(line.orderLineId)
              setQuantity(String(Number(line.quantity)))
            }}
            status={lineId === line.orderLineId ? <Selected /> : null}
            title={title(line.orderLineId)}
          />
        ))}
      </ListCard>
      <FormField
        error={
          tooMany && chosen
            ? `At most ${formatCommerceQuantity(chosen.quantity)} can come back.`
            : undefined
        }
        keyboardType="decimal-pad"
        label="Quantity returned"
        onChangeText={setQuantity}
        value={quantity}
      />
      <Chips
        label="What happens to it"
        onChange={setDisposition}
        options={DISPOSITIONS}
        value={disposition}
      />
      {reason.field}
      <Effect
        icon="Info"
        message="Money does not move. Use Refund if you give money back."
        title="Stock only"
        tone="muted"
      />
    </FormShell>
  )
}
