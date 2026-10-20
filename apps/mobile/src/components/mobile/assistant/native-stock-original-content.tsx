import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { minorToStatedAmount } from "@ewatrade/assistant/general/stated-money"
import type { ReactNode } from "react"
import { ListCard } from "../green-till/kit"
import { stockCustodyText } from "./general-stock-editor-parts"

type Inventory = RouterOutputs["inventory"]
export type NativeStockOperation = NonNullable<Inventory["operationAudit"]>
export type NativeStockCount = Inventory["stockCountReview"]
export type NativeStockCloseout = Inventory["closeoutReview"]
export type NativeStockTransfer = Inventory["transferReview"]

const notRecorded = "Not recorded or unavailable"
const utc = (value: Date | string | null | undefined) =>
  value && Number.isFinite(new Date(value).getTime())
    ? new Date(value).toISOString()
    : notRecorded
const words = (value: string) => value.toLowerCase().replaceAll("_", " ")
const named = (product: string, variant: string) =>
  variant ? `${product} · ${variant}` : product
function cost(minor: number | string | null, currency: string | null) {
  if (minor === null) return "No cost snapshot"
  try {
    return `${currency ?? ""} ${minorToStatedAmount(minor)}`.trim()
  } catch {
    return "Cost unavailable"
  }
}

const operationTitles: Partial<Record<NativeStockOperation["type"], string>> = {
  RECEIPT: "Stock received",
  ADJUSTMENT: "Stock adjusted",
  CORRECTION: "Stock correction",
  CORRECTION_REPLACEMENT: "Stock correction",
  CORRECTION_REVERSAL: "Correction reversal",
  COUNT_RECONCILIATION: "Count reconciliation",
  CUSTODY_ASSIGNMENT: "Stock assigned",
  CUSTODY_RETURN: "Stock returned",
  TRANSFORMATION: "Stock repacked",
  STOCK_TRANSITION: "Stock transfer movement",
}

export function StockOperationContent({ op }: { op: NativeStockOperation }) {
  return (
    <>
      <Section title={operationTitles[op.type] ?? words(op.type)}>
        <Fact title="Effective (UTC)" value={utc(op.effectiveAt)} />
        <Fact title="Recorded (UTC)" value={utc(op.createdAt)} />
        <Fact title="Reason" value={op.reason ?? notRecorded} />
        <Fact title="Source" value={op.source || notRecorded} />
        <Fact
          title="Categories"
          value={
            op.categories.length
              ? op.categories.map((row) => row.name).join(", ")
              : "None"
          }
        />
        <Fact title="Recorded by" value="Name not included in this read" />
        {op.correctionOfOperationId ? (
          <Text className="text-sm text-foreground">
            This corrects an earlier operation. The earlier operation stays in
            history.
          </Text>
        ) : null}
        {op.correctionIds.length ? (
          <Text className="text-sm text-foreground">
            Corrected later {op.correctionIds.length}{" "}
            {op.correctionIds.length === 1 ? "time" : "times"}. This original
            stays in history.
          </Text>
        ) : null}
        {op.transformationConserved === false ? (
          <Text className="text-sm text-foreground">
            This repack did not conserve the stock exactly.
          </Text>
        ) : null}
      </Section>
      {op.movements.map((row) => (
        <Section key={row.id} title={named(row.productName, row.variantName)}>
          <Fact
            title="Entered"
            value={`${row.enteredQuantity} ${row.enteredInventoryUnitName} · factor ${row.unitFactorSnapshot}`}
          />
          <Fact
            title="On hand"
            value={`${row.previousOnHandQuantity} → ${row.resultingOnHandQuantity}`}
          />
          <Fact
            title="Custody"
            value={`${stockCustodyText(row.custodyType)} · ${row.storeName}`}
          />
          <Fact
            title="Cost per entered unit"
            value={cost(row.unitCostMinorSnapshot, row.currencyCodeSnapshot)}
          />
          {row.reversalOfMovementId || row.reversalIds.length ? (
            <Text className="text-xs text-muted-foreground">
              {row.reversalOfMovementId
                ? "This movement reverses an earlier one."
                : "This movement was reversed later; both stay in history."}
            </Text>
          ) : null}
        </Section>
      ))}
      <Footnote>
        A cost snapshot is not a purchase or payment. Opening this original
        changes no stock.
      </Footnote>
    </>
  )
}

export function StockCountContent({ count }: { count: NativeStockCount }) {
  return (
    <>
      <Section title="Stock count">
        <Fact title="Status" value={words(count.status)} />
        <Fact title="Saved (UTC)" value={utc(count.createdAt)} />
        <Fact title="Finalized (UTC)" value={utc(count.finalizedAt)} />
        <Fact title="Reason" value={count.reason ?? notRecorded} />
        <Text className="text-sm text-foreground">
          {count.status === "DRAFT"
            ? count.canFinalize
              ? "Observations are saved and can still be finalized."
              : "Stock or units changed since this count was saved, so it can't be finalized. Create a fresh count."
            : count.status === "FINALIZED"
              ? "Finalized. This saved record no longer changes."
              : "Cancelled. This saved record no longer changes."}
        </Text>
      </Section>
      {count.lines.map((line) => (
        <Section
          key={line.id}
          title={named(line.productName, line.variantName)}
        >
          <Fact title="Custody" value={stockCustodyText(line.custodyType)} />
          <Fact
            title={`System · counted · variance (${line.unitName})`}
            value={`${line.expectedQuantity} · ${line.observedQuantity} · ${line.varianceQuantity}`}
          />
          <Fact
            title="Now on hand · reserved"
            value={`${line.currentQuantity} · ${line.reservedQuantity}`}
          />
          {line.entries.map((entry, index) => (
            <Fact
              key={`${entry.enteredInventoryUnitId}:${index}`}
              title={`Observation ${index + 1}`}
              value={`${entry.enteredQuantity} ${entry.unitName} · factor ${entry.factor} = ${entry.canonicalQuantity}`}
            />
          ))}
          {!line.stockCurrent || !line.configurationCurrent ? (
            <Text className="text-xs text-muted-foreground">
              Stock or units changed since this count was saved.
            </Text>
          ) : null}
        </Section>
      ))}
      <Footnote>Opening this original changes no stock.</Footnote>
    </>
  )
}

export function StockCloseoutContent({
  closeout,
}: { closeout: NativeStockCloseout }) {
  return (
    <>
      <Section title="Custody closeout">
        <Fact title="Custody" value={stockCustodyText(closeout.custodyType)} />
        <Fact title="Status" value={words(closeout.status)} />
        <Fact title="Saved (UTC)" value={utc(closeout.createdAt)} />
        <Fact title="Finalized (UTC)" value={utc(closeout.finalizedAt)} />
        <Fact title="Reason" value={closeout.reason ?? notRecorded} />
        <Text className="text-sm text-foreground">
          {closeout.status === "DRAFT"
            ? closeout.canFinalize
              ? "Declarations are saved and can still be finalized."
              : "This closeout can't be finalized now. Save a fresh closeout."
            : closeout.status === "FINALIZED"
              ? "Finalized. This saved record no longer changes."
              : "Cancelled. This saved record no longer changes."}
        </Text>
      </Section>
      {closeout.lines.map((line) => (
        <Section
          key={line.id}
          title={named(line.productName, line.variantName)}
        >
          <Fact
            title={`Expected · declared · variance (${line.unitName})`}
            value={`${line.expectedQuantity} · ${line.declaredQuantity} · ${line.varianceQuantity}`}
          />
          <Fact
            title="Now on hand · reserved"
            value={`${line.currentQuantity} · ${line.reservedQuantity}`}
          />
          {!line.preservesReservations ? (
            <Text className="text-xs text-muted-foreground">
              The declaration is below reserved stock.
            </Text>
          ) : null}
          {!line.stockCurrent ? (
            <Text className="text-xs text-muted-foreground">
              Stock changed since this closeout was saved.
            </Text>
          ) : null}
        </Section>
      ))}
      <Footnote>
        A stock custody closeout, not a financial period close. Opening this
        original changes no stock.
      </Footnote>
    </>
  )
}

export function StockTransferContent({
  transfer,
  storeId,
}: { transfer: NativeStockTransfer; storeId: string }) {
  const side =
    transfer.sourceStore.id === storeId
      ? `${transfer.sourceStore.name} (source)`
      : `${transfer.targetStore.name} (destination)`
  return (
    <>
      <Section title={named(transfer.productName, transfer.variantName)}>
        <Fact title="Status" value={words(transfer.status)} />
        <Fact
          title="Route"
          value={`${transfer.sourceStore.name} → ${transfer.targetStore.name}`}
        />
        <Fact
          title="Unit"
          value={`${transfer.unitName} · factor ${transfer.factor}`}
        />
        <Fact
          title="Dispatched"
          value={`${transfer.dispatchedQuantity} on ${utc(transfer.createdAt)}`}
        />
        <Fact
          title="In transit"
          value={
            transfer.transit
              ? `${transfer.transit.quantity} · reserved ${transfer.transit.reserved}`
              : "Nothing in transit"
          }
        />
        <Fact title="Opened from" value={side} />
        <Text className="text-sm text-foreground">
          {transfer.status === "IN_TRANSIT" && transfer.transit
            ? `${transfer.targetStore.name} records receipt; ${transfer.sourceStore.name} can cancel the remaining transit.`
            : "Nothing is left to receive or cancel."}
        </Text>
      </Section>
      <Section title="Receipts so far">
        {transfer.acknowledgments.length ? (
          transfer.acknowledgments.map((row) => (
            <Fact
              key={row.id}
              title={`${row.kind === "RECEIVE" ? "Received" : "Returned to source"} · ${utc(row.effectiveAt)}`}
              value={`${row.quantity} ${transfer.unitName} · remaining ${row.remainingBefore} → ${row.remainingAfter} · ${row.reason}`}
            />
          ))
        ) : (
          <Text className="text-sm text-foreground">
            No receipt or cancellation yet.
          </Text>
        )}
        {transfer.acknowledgmentHistoryLimited ? (
          <Text className="text-xs text-muted-foreground">
            Only the most recent 100 entries are shown.
          </Text>
        ) : null}
      </Section>
      <Footnote>Opening this original changes no stock.</Footnote>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ListCard>
      <View className="gap-3 py-3">
        <Text
          accessibilityRole="header"
          className="text-lg font-bold text-foreground"
        >
          {title}
        </Text>
        {children}
      </View>
    </ListCard>
  )
}
function Fact({ title, value }: { title: string; value: string }) {
  return (
    <View className="gap-1">
      <Text className="text-xs text-muted-foreground">{title}</Text>
      <Text className="text-sm font-medium text-foreground">{value}</Text>
    </View>
  )
}
function Footnote({ children }: { children: ReactNode }) {
  return <Text className="text-xs text-muted-foreground">{children}</Text>
}
