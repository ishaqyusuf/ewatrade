import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useTRPC } from "@/trpc/client"
import {
  addExactDecimals,
  compareExactDecimals,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"
import {
  SHIPMENT_RECEIPT_CATEGORY,
  SHIPMENT_STATUS_LABELS,
  shipmentAdjustmentMinor,
  shipmentMajorToMinor,
  shipmentUnreceivedUnitMinor,
} from "@ewatrade/utils/shipments"
import { useMutation, useQuery } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"
import { useState } from "react"
import { ScrollView, View } from "react-native"
import { FinanceFormBody } from "../finance/finance-form-body"
import {
  type FinanceWorkspace,
  FinanceWorkspaceGate,
} from "../finance/finance-workspace-gate"
import { HeroCard } from "../green-till/hero-card"
import { ListCard, RecordRow, StatusPill } from "../green-till/kit"
import {
  SHIPMENT_PILL_TONE,
  type ShipmentDetail,
  type ShipmentLine,
  errorText,
  isOpenShipment,
  lineName,
  money,
  useCurrentStoreId,
  useRefreshShipments,
  useStoreStockChoices,
} from "./shipment-data"
import { type DraftView, ShipmentDraftScreen } from "./shipment-draft-screen"

type Step = DraftView | "landed" | "prices" | "arrival"
const commandId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`
const plain = (value: string) => value.replace(/,/g, "")
const sum = (
  lines: ShipmentLine[],
  key: "expectedQuantity" | "receivedQuantity" | "outstandingQuantity",
) => lines.reduce((total, line) => addExactDecimals(total, line[key]), "0")
const hasLeft = (line: ShipmentLine) =>
  compareExactDecimals(line.outstandingQuantity, "0") > 0

export function ShipmentScreen({ shipmentId }: { shipmentId: string }) {
  return (
    <FinanceWorkspaceGate requireOnline>
      {(workspace) => (
        <ShipmentWorkspace
          key={`${workspace.book.id}:${shipmentId}`}
          book={workspace.book}
          shipmentId={shipmentId}
        />
      )}
    </FinanceWorkspaceGate>
  )
}

function ShipmentWorkspace({
  book,
  shipmentId,
}: {
  book: FinanceWorkspace["book"]
  shipmentId: string
}) {
  const trpc = useTRPC()
  const router = useRouter()
  const storeId = useCurrentStoreId()
  const isNew = shipmentId === "new"
  const detail = useQuery(
    trpc.finance.shipments.detail.queryOptions(
      { bookId: book.id, shipmentId },
      { enabled: !isNew, retry: false },
    ),
  )
  const [step, setStep] = useState<Step | null>(null)
  const [lineId, setLineId] = useState<string | null>(null)

  if (isNew)
    return storeId ? (
      <ShipmentDraftScreen
        book={book}
        storeId={storeId}
        detail={null}
        view="edit"
        onBack={() => router.back()}
        onDone={(id) =>
          router.replace({
            pathname: "/shipment/[shipmentId]",
            params: { shipmentId: id },
          } as Href)
        }
      />
    ) : (
      <Text className="px-[18px] text-muted-foreground">Loading…</Text>
    )
  if (detail.isError)
    return (
      <View className="px-[18px]">
        <StatusBanner
          message={detail.error.message}
          tone="destructive"
          actionLabel="Try again"
          onActionPress={() => void detail.refetch()}
        />
      </View>
    )
  if (!detail.data)
    return <Text className="px-[18px] text-muted-foreground">Loading…</Text>
  const d = detail.data
  const back = () => setStep(null)

  if (
    d.status === "DRAFT" &&
    (step === "edit" || step === "rates" || step === "costs")
  )
    return (
      <ShipmentDraftScreen
        key={`${d.revision}:${step}`}
        book={book}
        storeId={d.storeId}
        detail={d}
        view={step}
        onBack={back}
        onDone={back}
      />
    )
  if (step === "costs")
    return (
      <CostsView
        detail={d}
        currencyCode={book.currencyCode}
        onBack={back}
        onChange={(id) => {
          setLineId(id)
          setStep("landed")
        }}
      />
    )
  if (step === "landed")
    return (
      <LandedView
        key={`${lineId}:${d.revision}`}
        detail={d}
        lineId={lineId}
        currencyCode={book.currencyCode}
        onBack={() => setStep("costs")}
      />
    )
  if (step === "prices")
    return (
      <PricesView
        key={d.revision}
        detail={d}
        currencyCode={book.currencyCode}
        onBack={back}
      />
    )
  if (step === "arrival")
    return (
      <ArrivalView
        key={d.revision}
        detail={d}
        currencyCode={book.currencyCode}
        onBack={back}
      />
    )
  return (
    <RecordView detail={d} currencyCode={book.currencyCode} onStep={setStep} />
  )
}

function RecordView({
  detail: d,
  currencyCode,
  onStep,
}: {
  detail: ShipmentDetail
  currencyCode: string
  onStep: (step: Step) => void
}) {
  const trpc = useTRPC()
  const refresh = useRefreshShipments()
  const [error, setError] = useState<string | null>(null)
  const confirm = useMutation(trpc.finance.shipments.confirm.mutationOptions())
  const reopen = useMutation(trpc.finance.shipments.reopen.mutationOptions())
  const expected = sum(d.lines, "expectedQuantity")
  const received = sum(d.lines, "receivedQuantity")
  const draft = d.status === "DRAFT"
  const open = isOpenShipment(d.status)
  const canReopen =
    d.status === "EXPECTED" && !d.receipts.length && !d.adjustments.length
  const rates = d.rates.length
    ? d.rates
        .map(
          (r) =>
            `1 ${r.currencyCode} = ${money(shipmentMajorToMinor(r.rate) ?? "0", currencyCode)}`,
        )
        .join(" · ")
    : `All in ${currencyCode}`

  async function run(kind: "confirm" | "reopen") {
    setError(null)
    try {
      await (kind === "confirm" ? confirm : reopen).mutateAsync({
        bookId: d.bookId,
        clientCommandId: commandId(),
        shipmentId: d.id,
        expectedRevision: d.revision,
      })
      await refresh()
    } catch (failure) {
      setError(errorText(failure))
    }
  }

  return (
    <View className="flex-1">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 140 }}
      >
        <View className="gap-4">
          <Text className="text-sm text-muted-foreground">
            {[d.supplierName, d.reference].filter(Boolean).join(" · ")}
          </Text>
          <HeroCard
            label="Landed cost"
            amount={money(d.totals.landedMinor, currencyCode)}
            sub={
              <StatusPill
                label={SHIPMENT_STATUS_LABELS[d.status]}
                tone={SHIPMENT_PILL_TONE[d.status]}
              />
            }
            stats={[
              { label: "Expected", value: expected },
              { label: "Arrived", value: received },
              {
                label: "To come",
                value: subtractExactDecimals(expected, received),
              },
            ]}
          />
          {error ? <StatusBanner message={error} tone="destructive" /> : null}
          <Text className="text-lg font-bold">Items</Text>
          <ListCard>
            {d.lines.map((line) => (
              <RecordRow
                key={line.id}
                avatar={{ icon: "Package", tint: "mint" }}
                title={lineName(line)}
                meta={[
                  line.stockItem ? "In Catalog" : "New product",
                  line.receivedQuantity === "0"
                    ? `${line.expectedQuantity} expected`
                    : `${line.receivedQuantity} of ${line.expectedQuantity} in${hasLeft(line) ? ` · ${line.outstandingQuantity} to come` : ""}`,
                ]}
                amount={`${money(line.landedUnitMinor, currencyCode)} each`}
              />
            ))}
          </ListCard>
          <ListCard>
            {draft ? (
              <RecordRow
                avatar={{ icon: "Pencil", tint: "muted" }}
                title="Items and supplier prices"
                meta={`${d.lines.length} items`}
                onPress={() => onStep("edit")}
              />
            ) : null}
            <RecordRow
              avatar={{ icon: "RefreshCw", tint: "muted" }}
              title="Rates to naira"
              meta={rates}
              onPress={draft ? () => onStep("rates") : undefined}
            />
            <RecordRow
              avatar={{ icon: "Calculator", tint: "muted" }}
              title="Costs and freight"
              meta={`${money(d.totals.freightMinor, currencyCode)} freight${d.totals.adjustmentMinor === "0" ? "" : ` · ${money(d.totals.adjustmentMinor, currencyCode)} changed`}`}
              onPress={() => onStep("costs")}
            />
            <RecordRow
              avatar={{ icon: "Tag", tint: "muted" }}
              title="Selling prices"
              meta="New prices apply from when you save"
              onPress={() => onStep("prices")}
            />
          </ListCard>
          <Text className="text-lg font-bold">Arrivals</Text>
          {d.receipts.length ? (
            <ListCard>
              {d.receipts.map((r) => (
                <RecordRow
                  key={r.id}
                  avatar={{ icon: "Download", tint: "mint" }}
                  title={new Date(r.receivedAt).toDateString()}
                  meta={r.lines
                    .map((l) => {
                      const line = d.lines.find((x) => x.id === l.lineId)
                      return `${l.quantity} ${line ? lineName(line) : ""}`
                    })
                    .join(" · ")}
                  amount={money(r.totalMinor, currencyCode)}
                />
              ))}
            </ListCard>
          ) : (
            <Text className="rounded-[20px] bg-card p-4 text-sm leading-6 text-muted-foreground">
              Nothing has arrived yet. Stock goes up only when you record an
              arrival.
            </Text>
          )}
        </View>
      </ScrollView>
      <View className="absolute inset-x-0 bottom-0 gap-2 px-[18px] pb-8">
        {draft ? (
          <ActionButton
            isLoading={confirm.isPending}
            onPress={() => void run("confirm")}
          >
            Confirm shipment
          </ActionButton>
        ) : null}
        {open && canReopen ? (
          <ActionButton
            variant="outline"
            isLoading={reopen.isPending}
            onPress={() => void run("reopen")}
          >
            Reopen to edit
          </ActionButton>
        ) : null}
        {open ? (
          <ActionButton icon="Download" onPress={() => onStep("arrival")}>
            Record arrival
          </ActionButton>
        ) : null}
      </View>
    </View>
  )
}

function CostsView({
  detail: d,
  currencyCode,
  onBack,
  onChange,
}: {
  detail: ShipmentDetail
  currencyCode: string
  onBack: () => void
  onChange: (lineId: string) => void
}) {
  return (
    <FinanceFormBody>
      <Text className="text-xl font-bold">Costs</Text>
      {d.lines.map((line) => (
        <View key={line.id} className="gap-1 rounded-[20px] bg-card p-4">
          <Text className="font-bold">{lineName(line)}</Text>
          {[
            [
              `${line.expectedQuantity} × ${line.sourceCurrencyCode} ${line.sourceUnitPrice}`,
              money(line.goodsMinor, currencyCode),
            ],
            ["Freight share", money(line.freightMinor, currencyCode)],
            ...(line.adjustmentMinor === "0"
              ? []
              : [["Change", money(line.adjustmentMinor, currencyCode)]]),
            ["Landed", money(line.landedMinor, currencyCode)],
            ["Each", money(line.landedUnitMinor, currencyCode)],
          ].map(([label, value]) => (
            <View key={label} className="flex-row justify-between gap-3">
              <Text className="text-sm text-muted-foreground">{label}</Text>
              <Text className="text-sm font-bold">{value}</Text>
            </View>
          ))}
          {isOpenShipment(d.status) && hasLeft(line) ? (
            <Pressable
              accessibilityRole="button"
              haptic
              className="pt-2"
              onPress={() => onChange(line.id)}
            >
              <Text className="font-bold text-primary">Change landed cost</Text>
            </Pressable>
          ) : null}
        </View>
      ))}
      <View className="gap-1 rounded-[20px] bg-card p-4">
        {[
          ["Goods", d.totals.goodsMinor],
          ["Freight", d.totals.freightMinor],
          ["Changes to cost", d.totals.adjustmentMinor],
          ["Landed cost", d.totals.landedMinor],
        ].map(([label, value]) => (
          <View key={label} className="flex-row justify-between gap-3">
            <Text className="text-sm text-muted-foreground">{label}</Text>
            <Text className="text-sm font-bold">
              {money(value ?? "0", currencyCode)}
            </Text>
          </View>
        ))}
      </View>
      <ActionButton onPress={onBack}>Done</ActionButton>
    </FinanceFormBody>
  )
}

function LandedView({
  detail: d,
  lineId,
  currencyCode,
  onBack,
}: {
  detail: ShipmentDetail
  lineId: string | null
  currencyCode: string
  onBack: () => void
}) {
  const trpc = useTRPC()
  const refresh = useRefreshShipments()
  const [target, setTarget] = useState("")
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const adjust = useMutation(
    trpc.finance.shipments.adjustLineCost.mutationOptions(),
  )
  const line = d.lines.find((l) => l.id === lineId)
  if (!line) return null
  const unitNow = shipmentUnreceivedUnitMinor(
    line.unreceivedCostMinor,
    line.outstandingQuantity,
  )
  const targetMinor = shipmentMajorToMinor(target)
  const delta =
    targetMinor && unitNow
      ? shipmentAdjustmentMinor({
          targetUnitMinor: targetMinor,
          outstandingQuantity: line.outstandingQuantity,
          unreceivedCostMinor: line.unreceivedCostMinor,
        })
      : null
  const signed = (minor: string) =>
    `${minor.startsWith("-") ? "−" : "+"}${money(minor.replace("-", ""), currencyCode)}`

  async function save() {
    setError(null)
    if (!delta || delta === "0" || !line)
      return setError("Enter a landed cost different from the worked-out one.")
    if (!reason.trim()) return setError("Say why the cost is different.")
    try {
      await adjust.mutateAsync({
        bookId: d.bookId,
        clientCommandId: commandId(),
        shipmentId: d.id,
        expectedRevision: d.revision,
        lineId: line.id,
        amountMinor: delta,
        reason: reason.trim(),
      })
      await refresh()
      onBack()
    } catch (failure) {
      setError(errorText(failure))
    }
  }

  return (
    <FinanceFormBody>
      <Text className="text-xl font-bold">Landed cost</Text>
      <Text className="text-sm text-muted-foreground">{lineName(line)}</Text>
      <View className="gap-1 rounded-[20px] bg-card p-4">
        <Text className="text-sm text-muted-foreground">
          Worked out, for the {line.outstandingQuantity} still to come
        </Text>
        <Text className="text-2xl font-bold">
          {unitNow ? money(unitNow, currencyCode) : "—"} each
        </Text>
      </View>
      <FormField
        label="Landed cost to use, each"
        keyboardType="decimal-pad"
        leadingText="₦"
        value={target}
        onChangeText={(value) => setTarget(plain(value))}
      />
      {delta && delta !== "0" && targetMinor && unitNow ? (
        <StatusBanner
          tone="warning"
          title={`${signed((BigInt(targetMinor) - BigInt(unitNow)).toString())} each × ${line.outstandingQuantity} = ${signed(delta)}`}
          message={`Landed total ${money(line.landedMinor, currencyCode)} → ${money((BigInt(line.landedMinor) + BigInt(delta)).toString(), currencyCode)}`}
        />
      ) : null}
      <FormField
        label="Reason"
        placeholder="Why the cost is different"
        value={reason}
        onChangeText={setReason}
      />
      <Text className="text-sm text-muted-foreground">
        Selling prices don’t change here. Items already received keep their
        cost.
      </Text>
      {error ? <StatusBanner message={error} tone="destructive" /> : null}
      <ActionButton isLoading={adjust.isPending} onPress={() => void save()}>
        Save
      </ActionButton>
      <ActionButton variant="outline" onPress={onBack}>
        Back to costs
      </ActionButton>
    </FinanceFormBody>
  )
}

function PricesView({
  detail: d,
  currencyCode,
  onBack,
}: {
  detail: ShipmentDetail
  currencyCode: string
  onBack: () => void
}) {
  const trpc = useTRPC()
  const refresh = useRefreshShipments()
  const { choices } = useStoreStockChoices(d.storeId)
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const update = useMutation(trpc.catalog.updatePrice.mutationOptions())
  const rows = d.lines.map((line) => ({
    line,
    offering:
      choices.find((c) => c.balanceSourceId === line.balanceSourceId)
        ?.offering ?? null,
  }))

  async function save() {
    setError(null)
    const changes = rows.flatMap(({ line, offering }) => {
      const minor = shipmentMajorToMinor(prices[line.id] ?? "")
      return offering && minor && Number(minor) !== offering.priceMinor
        ? [{ offering, minor }]
        : []
    })
    if (!changes.length) return setError("Enter at least one new price.")
    setSaving(true)
    try {
      for (const { offering, minor } of changes)
        await update.mutateAsync({
          offeringId: offering.id,
          expectedRevision: offering.revision,
          priceMinor: Number(minor),
          reason: `New price from shipment ${d.name}`,
        })
      await refresh()
      onBack()
    } catch (failure) {
      setError(errorText(failure))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FinanceFormBody>
      <Text className="text-xl font-bold">Selling prices</Text>
      <Text className="text-sm text-muted-foreground">
        New prices apply to sales from when you save. Past orders and their
        costs don’t change.
      </Text>
      {rows.map(({ line, offering }) => {
        const next = shipmentMajorToMinor(prices[line.id] ?? "")
        const profit = next ? BigInt(next) - BigInt(line.landedUnitMinor) : null
        return (
          <View key={line.id} className="gap-3 rounded-[20px] bg-card p-4">
            <Text className="font-bold">{lineName(line)}</Text>
            <Text className="text-sm text-muted-foreground">
              Landed {money(line.landedUnitMinor, currencyCode)} each · selling{" "}
              {offering
                ? money(offering.priceMinor, currencyCode)
                : line.stockItem
                  ? "with no fixed price"
                  : "not in Catalog yet"}
            </Text>
            {offering ? (
              <FormField
                label="New price"
                keyboardType="decimal-pad"
                leadingText="₦"
                value={prices[line.id] ?? ""}
                onChangeText={(value) =>
                  setPrices((p) => ({ ...p, [line.id]: plain(value) }))
                }
              />
            ) : null}
            {profit !== null ? (
              <StatusBanner
                tone={profit > 0 ? "success" : "destructive"}
                message={
                  profit > 0
                    ? `Profit ${money(profit.toString(), currencyCode)} each`
                    : `Below landed cost by ${money((-profit).toString(), currencyCode)}`
                }
              />
            ) : null}
          </View>
        )
      })}
      {error ? <StatusBanner message={error} tone="destructive" /> : null}
      <ActionButton isLoading={saving} onPress={() => void save()}>
        Save prices
      </ActionButton>
      <ActionButton variant="outline" onPress={onBack}>
        Back
      </ActionButton>
    </FinanceFormBody>
  )
}

function ArrivalView({
  detail: d,
  currencyCode,
  onBack,
}: {
  detail: ShipmentDetail
  currencyCode: string
  onBack: () => void
}) {
  const trpc = useTRPC()
  const refresh = useRefreshShipments()
  const { choices } = useStoreStockChoices(d.storeId)
  const balances = useQuery(
    trpc.inventory.balanceReport.queryOptions(
      { storeId: d.storeId },
      { retry: false },
    ),
  )
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const receive = useMutation(trpc.finance.shipments.receive.mutationOptions())
  const mapLine = useMutation(trpc.finance.shipments.mapLine.mutationOptions())
  const open = d.lines.filter(hasLeft)
  const total = open.reduce((t, l) => t + (quantities[l.id] ?? 0), 0)
  const max = (line: ShipmentLine) =>
    Math.floor(Number(line.outstandingQuantity))

  async function chooseStock(line: ShipmentLine, balanceSourceId: string) {
    const choice = choices.find((c) => c.balanceSourceId === balanceSourceId)
    if (!choice) return
    setError(null)
    try {
      await mapLine.mutateAsync({
        bookId: d.bookId,
        clientCommandId: commandId(),
        shipmentId: d.id,
        expectedRevision: d.revision,
        lineId: line.id,
        balanceSourceId,
        enteredInventoryUnitId: choice.inventoryUnitId,
      })
      await refresh()
    } catch (failure) {
      setError(errorText(failure))
    }
  }

  async function save() {
    setError(null)
    const lines: Parameters<typeof receive.mutateAsync>[0]["lines"] = []
    for (const line of open) {
      const quantity = quantities[line.id] ?? 0
      if (!quantity) continue
      const row = balances.data?.rows.find(
        (r) => r.balanceSourceId === line.balanceSourceId,
      )
      if (!row) return setError(`Choose the stock item for ${lineName(line)}.`)
      lines.push({
        lineId: line.id,
        quantity: String(quantity),
        expectedBalanceRevision: row.revision,
        expectedConfigurationVersionId: row.configurationVersionId,
        categories: [{ name: SHIPMENT_RECEIPT_CATEGORY }],
      })
    }
    if (!lines.length) return setError("Enter what arrived.")
    if (lines.length > 10)
      return setError("Record up to 10 items per arrival, then the rest.")
    try {
      await receive.mutateAsync({
        bookId: d.bookId,
        clientCommandId: commandId(),
        shipmentId: d.id,
        receivedAt: new Date(),
        lines,
      })
      await refresh()
      onBack()
    } catch (failure) {
      setError(errorText(failure))
    }
  }

  return (
    <FinanceFormBody>
      <Text className="text-xl font-bold">Record arrival</Text>
      <Pressable
        accessibilityRole="button"
        haptic
        onPress={() =>
          setQuantities(
            Object.fromEntries(
              open.filter((l) => l.balanceSourceId).map((l) => [l.id, max(l)]),
            ),
          )
        }
      >
        <Text className="font-bold text-primary">
          Everything still to come arrived
        </Text>
      </Pressable>
      {open.map((line) => {
        const now = quantities[line.id] ?? 0
        const step = (by: number) =>
          setQuantities((q) => ({
            ...q,
            [line.id]: Math.max(0, Math.min(max(line), now + by)),
          }))
        return (
          <View key={line.id} className="gap-3 rounded-[20px] bg-card p-4">
            <Text className="font-bold">{lineName(line)}</Text>
            <Text className="text-sm text-muted-foreground">
              {line.expectedQuantity} expected · {line.receivedQuantity} in
              before
            </Text>
            {line.balanceSourceId ? (
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-muted-foreground">
                  Arrived now
                </Text>
                <View className="flex-row items-center gap-2">
                  <ActionButton
                    variant="outline"
                    accessibilityLabel={`Fewer ${lineName(line)}`}
                    disabled={now <= 0}
                    onPress={() => step(-1)}
                  >
                    −
                  </ActionButton>
                  <Text className="min-w-10 text-center text-lg font-bold">
                    {now}
                  </Text>
                  <ActionButton
                    variant="outline"
                    accessibilityLabel={`More ${lineName(line)}`}
                    disabled={now >= max(line)}
                    onPress={() => step(1)}
                  >
                    +
                  </ActionButton>
                </View>
              </View>
            ) : (
              <View className="gap-2">
                <Text className="text-sm">
                  New product: add it in Catalog, then choose it here.
                </Text>
                {choices.slice(0, 8).map((c) => (
                  <Pressable
                    key={c.balanceSourceId}
                    accessibilityRole="button"
                    haptic
                    disabled={mapLine.isPending}
                    className="rounded-xl border border-border px-4 py-3"
                    onPress={() => void chooseStock(line, c.balanceSourceId)}
                  >
                    <Text>{c.label}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Text className="text-sm">
              {max(line) - now
                ? `${max(line) - now} still to come after this`
                : "All in after this"}
            </Text>
          </View>
        )
      })}
      <Text className="text-sm text-muted-foreground">
        Stock goes up by what you record now, at landed cost. A supplier bill is
        recorded for each arrival.
      </Text>
      {error ? <StatusBanner message={error} tone="destructive" /> : null}
      <ActionButton
        isLoading={receive.isPending}
        disabled={!total}
        onPress={() => void save()}
      >
        {total ? `Receive ${total} items` : "Pick what arrived"}
      </ActionButton>
      <ActionButton variant="outline" onPress={onBack}>
        Back
      </ActionButton>
      <Text className="text-xs text-muted-foreground">
        Landed cost for the whole shipment:{" "}
        {money(d.totals.landedMinor, currencyCode)}
      </Text>
    </FinanceFormBody>
  )
}
