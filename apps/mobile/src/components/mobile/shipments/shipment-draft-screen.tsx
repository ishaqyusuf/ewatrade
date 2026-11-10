import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { SearchFooterField } from "@/components/mobile/search-footer-scope"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useTRPC } from "@/trpc/client"
import {
  type ShipmentDraft,
  type ShipmentDraftLine,
  buildShipmentDraftInput,
  emptyShipmentDraft,
  emptyShipmentLine,
  isShipmentDecimal,
  shipmentDraftCurrencies,
  shipmentDraftFromDetail,
  shipmentHandFreightLeftMinor,
  shipmentMissingRates,
} from "@ewatrade/utils/shipment-draft"
import { SHIPMENT_SOURCE_CURRENCIES } from "@ewatrade/utils/shipments"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { View } from "react-native"
import { FinanceFormBody } from "../finance/finance-form-body"
import type { FinanceWorkspace } from "../finance/finance-workspace-gate"
import {
  type ShipmentDetail,
  errorText,
  money,
  useRefreshShipments,
  useStoreStockChoices,
} from "./shipment-data"

export type DraftView = "edit" | "rates" | "costs"
type View_ = DraftView | { pick: string } | "supplier"

const today = () => new Date().toISOString().slice(0, 10)
const plain = (value: string) => value.replace(/,/g, "")

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      haptic
      className={`rounded-xl border px-4 py-3 ${selected ? "border-primary bg-accent" : "border-border bg-card"}`}
      onPress={onPress}
    >
      <Text>{label}</Text>
    </Pressable>
  )
}

function Chips({
  values,
  value,
  label,
  onChange,
}: {
  values: readonly string[]
  value: string
  label: string
  onChange: (value: string) => void
}) {
  return (
    <View
      className="flex-row gap-2"
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
    >
      {values.map((code) => (
        <Pressable
          key={code}
          accessibilityRole="radio"
          accessibilityState={{ checked: code === value }}
          haptic
          className={`h-10 justify-center rounded-full border px-4 ${code === value ? "border-foreground bg-foreground" : "border-border bg-card"}`}
          onPress={() => onChange(code)}
        >
          <Text
            className={`text-sm font-bold ${code === value ? "text-background" : "text-muted-foreground"}`}
          >
            {code}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

/** Phone create/edit for a draft shipment: items, rates, then the freight split. */
export function ShipmentDraftScreen({
  book,
  storeId,
  detail,
  view: initialView,
  onDone,
  onBack,
}: {
  book: FinanceWorkspace["book"]
  storeId: string
  detail: ShipmentDetail | null
  view: DraftView
  onDone: (shipmentId: string) => void
  onBack: () => void
}) {
  const trpc = useTRPC()
  const refresh = useRefreshShipments()
  const [view, setView] = useState<View_>(initialView)
  const [draft, setDraft] = useState<ShipmentDraft>(() =>
    detail
      ? shipmentDraftFromDetail(detail)
      : emptyShipmentDraft(String(Date.now())),
  )
  const [query, setQuery] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const { choices } = useStoreStockChoices(storeId)
  const suppliers = useQuery(
    trpc.finance.suppliers.queryOptions({ bookId: book.id, limit: 50 }),
  )
  const create = useMutation(trpc.finance.shipments.create.mutationOptions())
  const update = useMutation(trpc.finance.shipments.update.mutationOptions())
  const currencies = shipmentDraftCurrencies(draft, book.currencyCode)
  const missing = shipmentMissingRates(draft, book.currencyCode)
  const set = (patch: Partial<ShipmentDraft>) =>
    setDraft((d) => ({ ...d, ...patch }))
  const setLine = (key: string, patch: Partial<ShipmentDraftLine>) =>
    setDraft((d) => ({
      ...d,
      lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    }))
  const setRate = (
    code: string,
    patch: Partial<ShipmentDraft["rates"][string]>,
  ) =>
    setDraft((d) => ({
      ...d,
      rates: {
        ...d.rates,
        [code]: {
          ...(d.rates[code] ?? { rate: "", rateDate: today(), source: "" }),
          ...patch,
        },
      },
    }))
  const supplierName =
    suppliers.data?.data.find((s) => s.id === draft.supplierId)?.name ?? ""

  async function save() {
    setError(null)
    setTried(true)
    if (view === "edit" && missing.length) {
      setView("rates")
      return
    }
    const built = buildShipmentDraftInput(draft, {
      bookId: book.id,
      storeId,
      bookCurrencyCode: book.currencyCode,
      clientCommandId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      choices,
      today: today(),
    })
    if (!built.ok) return setError(built.error)
    try {
      const result = detail
        ? await update.mutateAsync({
            ...built.input,
            shipmentId: detail.id,
            expectedRevision: detail.revision,
          })
        : await create.mutateAsync(built.input)
      await refresh()
      onDone(result.id)
    } catch (failure) {
      setError(errorText(failure))
    }
  }

  const saving = create.isPending || update.isPending
  const saveButton = (label: string) => (
    <ActionButton isLoading={saving} onPress={() => void save()}>
      {label}
    </ActionButton>
  )
  const feedback = error ? (
    <StatusBanner message={error} tone="destructive" />
  ) : null

  if (typeof view === "object") {
    const line = draft.lines.find((l) => l.key === view.pick)
    const filtered = choices.filter((c) =>
      c.label.toLowerCase().includes(query.trim().toLowerCase()),
    )
    const pick = (patch: Partial<ShipmentDraftLine>) => {
      if (line) setLine(line.key, patch)
      setQuery("")
      setView("edit")
    }
    return (
      <FinanceFormBody>
        <Text className="text-xl font-bold">Choose the stock item</Text>
        <Choice
          label="New product (not in Catalog yet)"
          selected={!line?.balanceSourceId}
          onPress={() =>
            pick({ balanceSourceId: "", enteredInventoryUnitId: "" })
          }
        />
        {filtered.map((c) => (
          <Choice
            key={c.balanceSourceId}
            label={c.label}
            selected={line?.balanceSourceId === c.balanceSourceId}
            onPress={() =>
              pick({
                balanceSourceId: c.balanceSourceId,
                enteredInventoryUnitId: c.inventoryUnitId,
              })
            }
          />
        ))}
        <SearchFooterField
          localSearch
          accessibilityLabel="Search stock items"
          placeholder="Item, variant or unit"
          value={query}
          onChangeText={setQuery}
        />
      </FinanceFormBody>
    )
  }

  if (view === "supplier")
    return (
      <FinanceFormBody>
        <Text className="text-xl font-bold">Supplier</Text>
        {suppliers.data && !suppliers.data.data.length ? (
          <Text className="text-sm text-muted-foreground">
            Add the supplier in Finance → Suppliers first.
          </Text>
        ) : null}
        {(suppliers.data?.data ?? [])
          .filter((s) =>
            s.name.toLowerCase().includes(query.trim().toLowerCase()),
          )
          .map((s) => (
            <Choice
              key={s.id}
              label={s.name}
              selected={s.id === draft.supplierId}
              onPress={() => {
                set({ supplierId: s.id })
                setQuery("")
                setView("edit")
              }}
            />
          ))}
        <SearchFooterField
          localSearch
          accessibilityLabel="Search suppliers"
          placeholder="Supplier name"
          value={query}
          onChangeText={setQuery}
        />
      </FinanceFormBody>
    )

  if (view === "rates")
    return (
      <FinanceFormBody>
        <Text className="text-xl font-bold">Rates to naira</Text>
        <Text className="text-sm text-muted-foreground">
          One rate for each currency. These stay with this shipment; later rate
          changes don’t change it.
        </Text>
        {currencies.length ? null : (
          <Text className="text-sm text-muted-foreground">
            Everything is in {book.currencyCode}. No rate needed.
          </Text>
        )}
        {currencies.map((code) => {
          const rate = draft.rates[code]
          const bad = tried && !isShipmentDecimal(rate?.rate ?? "")
          return (
            <View key={code} className="gap-3 rounded-[20px] bg-card p-4">
              <Text className="font-bold">{code}</Text>
              <FormField
                label={`Naira for 1 ${code}`}
                keyboardType="decimal-pad"
                leadingText="₦"
                value={rate?.rate ?? ""}
                error={bad ? `Enter a rate for ${code}.` : undefined}
                onChangeText={(value) => setRate(code, { rate: plain(value) })}
              />
              <FormField
                label="Where from"
                placeholder="Bank, agent…"
                value={rate?.source ?? ""}
                onChangeText={(value) => setRate(code, { source: value })}
              />
              <FormField
                label="Rate date"
                placeholder="YYYY-MM-DD"
                value={rate?.rateDate ?? today()}
                onChangeText={(value) => setRate(code, { rateDate: value })}
              />
            </View>
          )
        })}
        {feedback}
        {saveButton(detail ? "Save rates" : "Save shipment")}
        <ActionButton variant="outline" onPress={() => setView("edit")}>
          Back to items
        </ActionButton>
      </FinanceFormBody>
    )

  if (view === "costs" && detail) {
    const left = shipmentHandFreightLeftMinor(draft, detail.totals.freightMinor)
    return (
      <FinanceFormBody>
        <Text className="text-xl font-bold">Costs</Text>
        <Chips
          label="Share freight"
          values={["By value", "By hand"]}
          value={draft.split === "hand" ? "By hand" : "By value"}
          onChange={(value) =>
            set({ split: value === "By hand" ? "hand" : "value" })
          }
        />
        {draft.split === "hand" ? (
          <StatusBanner
            tone={left === BigInt(0) ? "success" : "warning"}
            message={
              left === BigInt(0)
                ? `All ${money(detail.totals.freightMinor, book.currencyCode)} freight is shared.`
                : `${money((left < 0 ? -left : left).toString(), book.currencyCode)} ${left > 0 ? "still to share" : "more than the freight"}.`
            }
          />
        ) : null}
        {detail.lines.map((line) => (
          <View key={line.id} className="gap-2 rounded-[20px] bg-card p-4">
            <Text className="font-bold">{line.description}</Text>
            <Text className="text-sm text-muted-foreground">
              {line.expectedQuantity} × {line.sourceCurrencyCode}{" "}
              {line.sourceUnitPrice} → goods{" "}
              {money(line.goodsMinor, book.currencyCode)}
            </Text>
            {draft.split === "hand" ? (
              <FormField
                label="Freight share"
                keyboardType="decimal-pad"
                leadingText="₦"
                value={
                  draft.lines.find((l) => l.key === line.id)?.freightOverride ??
                  ""
                }
                onChangeText={(value) =>
                  setLine(line.id, { freightOverride: plain(value) })
                }
              />
            ) : (
              <Text className="text-sm">
                Freight {money(line.freightMinor, book.currencyCode)} · landed{" "}
                {money(line.landedMinor, book.currencyCode)} ·{" "}
                {money(line.landedUnitMinor, book.currencyCode)} each
              </Text>
            )}
          </View>
        ))}
        {feedback}
        {saveButton("Save freight split")}
        <ActionButton variant="outline" onPress={onBack}>
          Back
        </ActionButton>
      </FinanceFormBody>
    )
  }

  return (
    <FinanceFormBody>
      <Text className="text-xl font-bold">
        {detail ? "Edit shipment" : "New shipment"}
      </Text>
      <FormField
        label="Name"
        placeholder="China consignment · Nov"
        value={draft.name}
        onChangeText={(name) => set({ name })}
      />
      <Pressable
        accessibilityRole="button"
        haptic
        className="gap-1 rounded-xl border border-border bg-card px-4 py-3"
        onPress={() => setView("supplier")}
      >
        <Text className="text-xs font-semibold text-muted-foreground">
          Supplier
        </Text>
        <Text>{supplierName || "Choose a supplier"}</Text>
      </Pressable>
      <FormField
        label="Supplier reference"
        value={draft.reference}
        onChangeText={(reference) => set({ reference })}
      />
      <FormField
        label="Expected"
        placeholder="YYYY-MM-DD"
        value={draft.expectedAt}
        onChangeText={(expectedAt) => set({ expectedAt })}
      />
      <Text className="text-lg font-bold">Items</Text>
      {draft.lines.map((line) => {
        const choice = choices.find(
          (c) => c.balanceSourceId === line.balanceSourceId,
        )
        return (
          <View key={line.key} className="gap-3 rounded-[20px] bg-card p-4">
            <Pressable
              accessibilityRole="button"
              haptic
              className="gap-1"
              onPress={() => setView({ pick: line.key })}
            >
              <Text className="text-xs font-semibold text-muted-foreground">
                Stock item
              </Text>
              <Text className="font-bold">
                {choice?.label ?? "New product · tap to choose from Catalog"}
              </Text>
            </Pressable>
            {choice ? null : (
              <FormField
                label="New product name"
                value={line.proposedName}
                onChangeText={(proposedName) =>
                  setLine(line.key, { proposedName })
                }
              />
            )}
            <FormField
              label="Quantity"
              keyboardType="decimal-pad"
              value={line.expectedQuantity}
              onChangeText={(value) =>
                setLine(line.key, { expectedQuantity: plain(value) })
              }
            />
            <Chips
              label="Supplier currency"
              values={[
                ...new Set([...SHIPMENT_SOURCE_CURRENCIES, book.currencyCode]),
              ]}
              value={line.sourceCurrencyCode}
              onChange={(sourceCurrencyCode) =>
                setLine(line.key, { sourceCurrencyCode })
              }
            />
            <FormField
              label={`Supplier price each (${line.sourceCurrencyCode})`}
              keyboardType="decimal-pad"
              value={line.sourceUnitPrice}
              onChangeText={(value) =>
                setLine(line.key, { sourceUnitPrice: plain(value) })
              }
            />
            {draft.lines.length > 1 ? (
              <ActionButton
                variant="outline"
                onPress={() =>
                  set({ lines: draft.lines.filter((l) => l.key !== line.key) })
                }
              >
                Remove item
              </ActionButton>
            ) : null}
          </View>
        )
      })}
      <ActionButton
        variant="outline"
        icon="Plus"
        disabled={draft.lines.length >= 50}
        onPress={() =>
          set({
            lines: [...draft.lines, emptyShipmentLine(String(Date.now()))],
          })
        }
      >
        Add item
      </ActionButton>
      <Text className="text-lg font-bold">Shipping charge</Text>
      <Chips
        label="Shipping charge currency"
        values={[
          ...new Set([...SHIPMENT_SOURCE_CURRENCIES, book.currencyCode]),
        ]}
        value={draft.freightCurrencyCode}
        onChange={(freightCurrencyCode) => set({ freightCurrencyCode })}
      />
      <FormField
        label={`Amount (${draft.freightCurrencyCode})`}
        keyboardType="decimal-pad"
        value={draft.freightAmount}
        onChangeText={(value) => set({ freightAmount: plain(value) })}
      />
      {currencies.length ? (
        <Pressable
          accessibilityRole="button"
          haptic
          onPress={() => setView("rates")}
        >
          <Text className="text-sm text-primary">
            {missing.length
              ? `Add rates for ${missing.join(" and ")}`
              : "Change rates"}
          </Text>
        </Pressable>
      ) : null}
      <Text className="text-sm text-muted-foreground">
        Saving doesn’t add stock. Stock goes up when you record an arrival.
      </Text>
      {feedback}
      {saveButton("Save shipment")}
      <ActionButton variant="outline" onPress={onBack}>
        Cancel
      </ActionButton>
    </FinanceFormBody>
  )
}
