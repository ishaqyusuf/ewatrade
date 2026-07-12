import { ActionButton } from "@/components/mobile/action-button"
import { FormField } from "@/components/mobile/form-field"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Icon } from "@/components/ui/icon"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import {
  formatWholeQuantity as formatQuantity,
  normalizeWholeNumberInput,
  parseWholeQuantity,
} from "@/lib/quantity"
import { cn } from "@/lib/utils"
import { useBusinessStore } from "@/store/businessStore"
import {
  type RetailOpsCloseout,
  type RetailOpsProduct,
  type RetailOpsRepSession,
  type RetailOpsSale,
  useRetailOpsStore,
} from "@/store/retailOpsStore"
import { useTRPC } from "@/trpc/client"
import { formatMoney } from "@ewatrade/utils"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { useMutation } from "@tanstack/react-query"
import { forwardRef, useEffect, useMemo, useState } from "react"
import { View } from "react-native"

type CloseoutSheetProps = {
  attendantName?: string
  onComplete?: () => void
}

type InventoryDraftLine = {
  expectedQuantity: number
  id: string
  productId: string
  productName: string
  remoteVariantId?: string
  unitName: string
  variantId?: string
}

function parseAmount(value: string) {
  const amount = Number(value.replace(/[^\d.]/g, ""))
  return Number.isFinite(amount) ? amount : 0
}

function formatCloseoutTimestamp(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value)

  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString()
}

function formatVariance(value: number) {
  if (value === 0) return "Balanced"

  return `${value > 0 ? "+" : ""}${formatMoney(value, "NGN")}`
}

function getSalesAfterLastCloseout(
  sales: RetailOpsSale[],
  closeouts: RetailOpsCloseout[],
) {
  const latestCloseout = closeouts[0]

  if (!latestCloseout) return sales

  const latestCloseoutTime = new Date(latestCloseout.createdAt).getTime()

  if (Number.isNaN(latestCloseoutTime)) return sales

  return sales.filter((sale) => {
    const saleTime = new Date(sale.createdAt).getTime()

    return !Number.isNaN(saleTime) && saleTime > latestCloseoutTime
  })
}

function getPaymentTotals(sales: RetailOpsSale[]) {
  return sales.reduce(
    (totals, sale) => {
      if (sale.paymentMethod === "cash") {
        totals.cash += sale.total
      } else {
        totals.transfer += sale.total
      }

      totals.gross += sale.total

      return totals
    },
    {
      cash: 0,
      gross: 0,
      transfer: 0,
    },
  )
}

function getInventoryLines(products: RetailOpsProduct[]): InventoryDraftLine[] {
  return products.flatMap((product) => {
    const primaryLine = {
      expectedQuantity: product.currentStock ?? product.startingStock ?? 0,
      id: `${product.id}-primary`,
      productId: product.id,
      productName: product.name,
      remoteVariantId: product.remoteVariantId,
      unitName: product.unitName,
    }
    const variantLines = product.variants.map((variant) => ({
      expectedQuantity: variant.currentStock ?? variant.startingStock ?? 0,
      id: `${product.id}-${variant.id}`,
      productId: product.id,
      productName: product.name,
      remoteVariantId: variant.remoteId,
      unitName: variant.name,
      variantId: variant.id,
    }))

    return [primaryLine, ...variantLines]
  })
}

function SummaryStat({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <View className="flex-1 rounded-2xl bg-muted p-3">
      <Text className="text-xs font-semibold uppercase text-muted-foreground">
        {label}
      </Text>
      <Text className="mt-1 text-base font-bold text-foreground">{value}</Text>
    </View>
  )
}

function VarianceRow({
  label,
  value,
}: {
  label: string
  value: number
}) {
  const isBalanced = value === 0

  return (
    <View className="flex-row items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2">
      <Text className="text-sm font-semibold text-foreground">{label}</Text>
      <Text
        className={cn(
          "text-sm font-bold",
          isBalanced
            ? "text-emerald-700"
            : value > 0
              ? "text-primary"
              : "text-destructive",
        )}
      >
        {formatVariance(value)}
      </Text>
    </View>
  )
}

export const CloseoutSheet = forwardRef<BottomSheetModal, CloseoutSheetProps>(
  ({ attendantName = "Store Owner", onComplete }, ref) => {
    const trpc = useTRPC()
    const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
    const allCloseouts = useRetailOpsStore((state) => state.closeouts)
    const createCloseout = useRetailOpsStore((state) => state.createCloseout)
    const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode)
    const allProducts = useRetailOpsStore((state) => state.products)
    const allSales = useRetailOpsStore((state) => state.sales)
    const allRepSessions = useRetailOpsStore((state) => state.repSessions)
    const allSyncEvents = useRetailOpsStore((state) => state.syncEvents)
    const closeouts = useMemo(
      () =>
        allCloseouts.filter(
          (closeout) =>
            !activeBusinessId ||
            (closeout.businessId ?? activeBusinessId) === activeBusinessId,
        ),
      [activeBusinessId, allCloseouts],
    )
    const products = useMemo(
      () =>
        allProducts.filter(
          (product) =>
            !activeBusinessId ||
            (product.businessId ?? activeBusinessId) === activeBusinessId,
        ),
      [activeBusinessId, allProducts],
    )
    const sales = useMemo(
      () =>
        allSales.filter(
          (sale) =>
            !activeBusinessId ||
            (sale.businessId ?? activeBusinessId) === activeBusinessId,
        ),
      [activeBusinessId, allSales],
    )
    const repSessions = useMemo(
      () =>
        allRepSessions.filter(
          (session) =>
            !activeBusinessId ||
            (session.businessId ?? activeBusinessId) === activeBusinessId,
        ),
      [activeBusinessId, allRepSessions],
    )
    const syncEvents = useMemo(
      () =>
        allSyncEvents.filter(
          (event) =>
            !activeBusinessId ||
            (event.businessId ?? activeBusinessId) === activeBusinessId,
        ),
      [activeBusinessId, allSyncEvents],
    )
    const openSales = useMemo(
      () => getSalesAfterLastCloseout(sales, closeouts),
      [closeouts, sales],
    )
    const paymentTotals = useMemo(
      () => getPaymentTotals(openSales),
      [openSales],
    )
    const inventoryLines = useMemo(
      () => getInventoryLines(products),
      [products],
    )
    const [declaredCash, setDeclaredCash] = useState(
      formatQuantity(paymentTotals.cash),
    )
    const [declaredTransfer, setDeclaredTransfer] = useState(
      formatQuantity(paymentTotals.transfer),
    )
    const [inventoryDraft, setInventoryDraft] = useState<
      Record<string, string>
    >({})
    const [inventoryLineQuery, setInventoryLineQuery] = useState("")
    const [note, setNote] = useState("")
    const [submitError, setSubmitError] = useState<string | null>(null)
    const closeSessionMutation = useMutation(
      trpc.retailOps.closeSession.mutationOptions({
        onError: (error) => {
          setSubmitError(error.message)
        },
      }),
    )
    const openSession = useMemo<RetailOpsRepSession | undefined>(
      () =>
        repSessions.find(
          (session) =>
            session.status === "open" &&
            session.attendantName === attendantName,
        ),
      [attendantName, repSessions],
    )
    const pendingSyncCount = syncEvents.filter(
      (event) => event.status === "pending",
    ).length
    const cashVariance = parseAmount(declaredCash) - paymentTotals.cash
    const transferVariance =
      parseAmount(declaredTransfer) - paymentTotals.transfer
    const hasCloseoutWork = openSales.length > 0 || closeouts.length === 0
    const canCloseProductionSession =
      !isOfflineMode &&
      !!openSession?.remoteId &&
      pendingSyncCount === 0 &&
      inventoryLines.length > 0 &&
      inventoryLines.every((line) => !!line.remoteVariantId)
    const canSubmit =
      hasCloseoutWork &&
      inventoryLines.length > 0 &&
      declaredCash.trim().length > 0 &&
      declaredTransfer.trim().length > 0 &&
      inventoryLines.every((line) => inventoryDraft[line.id]?.trim()) &&
      !closeSessionMutation.isPending
    const sourceLabel = canCloseProductionSession
      ? "Online"
      : isOfflineMode
        ? "Local"
        : "Local queue"
    const sourceDetail = canCloseProductionSession
      ? "This closeout will close the production session immediately."
      : isOfflineMode
        ? "This closeout will be queued locally and synced later."
        : openSession?.remoteId
          ? pendingSyncCount > 0
            ? "Waiting for pending local changes to sync before direct production closeout."
            : "Waiting for all product units to sync before direct production closeout."
          : "Waiting for a synced clock-in session before direct production closeout."
    const filteredInventoryLines = useMemo(() => {
      const normalizedQuery = inventoryLineQuery.trim().toLowerCase()

      if (!normalizedQuery) return inventoryLines

      return inventoryLines.filter((line) =>
        [line.productName, line.unitName]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      )
    }, [inventoryLineQuery, inventoryLines])
    const visibleInventoryLines = useMemo(
      () => filteredInventoryLines.slice(0, 12),
      [filteredInventoryLines],
    )

    useEffect(() => {
      setDeclaredCash(formatQuantity(paymentTotals.cash))
      setDeclaredTransfer(formatQuantity(paymentTotals.transfer))
    }, [paymentTotals.cash, paymentTotals.transfer])

    useEffect(() => {
      setInventoryDraft((current) => {
        const nextDraft: Record<string, string> = {}

        for (const line of inventoryLines) {
          nextDraft[line.id] =
            current[line.id] ?? formatQuantity(line.expectedQuantity)
        }

        return nextDraft
      })
    }, [inventoryLines])

    const updateInventoryLine = (id: string, value: string) => {
      setInventoryDraft((current) => ({
        ...current,
        [id]: normalizeWholeNumberInput(value),
      }))
    }

    const submit = () => {
      if (!canSubmit) return

      const declaredCashAmount = parseAmount(declaredCash)
      const declaredTransferAmount = parseAmount(declaredTransfer)
      const closeoutLines = inventoryLines.map((line) => ({
        declaredQuantity: parseWholeQuantity(inventoryDraft[line.id] ?? "0"),
        expectedQuantity: line.expectedQuantity,
        productId: line.productId,
        productName: line.productName,
        unitName: line.unitName,
        variantId: line.variantId,
      }))
      const completeLocalCloseout = (
        syncStatus: "pending" | "synced",
        createdAt?: string,
      ) => {
        createCloseout({
          attendantName,
          businessId: activeBusinessId ?? undefined,
          createdAt,
          declaredCash: declaredCashAmount,
          declaredTransfer: declaredTransferAmount,
          inventoryLines: closeoutLines,
          note,
          syncStatus,
        })
        setNote("")
        onComplete?.()
      }

      setSubmitError(null)

      if (canCloseProductionSession && openSession?.remoteId) {
        closeSessionMutation.mutate(
          {
            cashierSessionId: openSession.remoteId,
            closingFloatMinor: declaredCashAmount,
            declaredTransferMinor: declaredTransferAmount,
            inventoryLines: inventoryLines.map((line) => ({
              countedQuantity: parseWholeQuantity(
                inventoryDraft[line.id] ?? "0",
              ),
              productVariantId: line.remoteVariantId as string,
            })),
            notes: note.trim() || undefined,
          },
          {
            onSuccess: (session) => {
              completeLocalCloseout(
                "synced",
                formatCloseoutTimestamp(session.closedAt),
              )
            },
          },
        )
        return
      }

      completeLocalCloseout("pending")
    }

    return (
      <Modal
        enableDynamicSizing
        ref={ref}
        snapPoints={["92%"]}
        title="Close day"
      >
        <BottomSheetKeyboardAwareScrollView
          bottomOffset={320}
          contentContainerStyle={{ paddingBottom: 240 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-5 px-5 pb-6">
            <View className="gap-2">
              <Text className="text-xl font-bold text-foreground">
                End-of-day closeout
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                Confirm payment declarations and closing stock before admin
                review.
              </Text>
            </View>

            <View className="rounded-2xl border border-border bg-card p-4">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1 gap-1">
                  <Text className="font-semibold text-foreground">
                    Closeout source
                  </Text>
                  <Text className="text-sm leading-5 text-muted-foreground">
                    {sourceDetail}
                  </Text>
                </View>
                <View className="rounded-full bg-muted px-3 py-1">
                  <Text className="text-xs font-bold text-muted-foreground">
                    {sourceLabel}
                  </Text>
                </View>
              </View>
            </View>

            <View className="gap-3 rounded-2xl border border-border bg-card p-4">
              <View className="flex-row items-center gap-2">
                <Icon className="size-base text-primary" name="ReceiptText" />
                <Text className="font-bold text-foreground">
                  Sales to close
                </Text>
              </View>
              <View className="flex-row gap-3">
                <SummaryStat label="Sales" value={String(openSales.length)} />
                <SummaryStat
                  label="Gross"
                  value={formatMoney(paymentTotals.gross, "NGN")}
                />
              </View>
              <View className="flex-row gap-3">
                <SummaryStat
                  label="Cash"
                  value={formatMoney(paymentTotals.cash, "NGN")}
                />
                <SummaryStat
                  label="Transfer"
                  value={formatMoney(paymentTotals.transfer, "NGN")}
                />
              </View>
              {pendingSyncCount > 0 ? (
                <View className="rounded-2xl bg-amber-500/10 p-3">
                  <Text className="text-sm font-semibold text-amber-700">
                    {pendingSyncCount} local change
                    {pendingSyncCount === 1 ? "" : "s"} still pending sync.
                  </Text>
                </View>
              ) : null}
              {!hasCloseoutWork ? (
                <View className="rounded-2xl bg-muted p-3">
                  <Text className="text-sm font-semibold text-muted-foreground">
                    No new sales have been recorded since the last closeout.
                  </Text>
                </View>
              ) : null}
            </View>

            <View className="gap-4">
              <FormField
                inputMode="decimal"
                keyboardType="numeric"
                label="Declared cash"
                onChangeText={setDeclaredCash}
                placeholder="Enter counted cash"
                value={declaredCash}
              />
              <FormField
                inputMode="decimal"
                keyboardType="numeric"
                label="Declared transfer"
                onChangeText={setDeclaredTransfer}
                placeholder="Enter counted transfer"
                value={declaredTransfer}
              />
              <View className="gap-2">
                <VarianceRow label="Cash variance" value={cashVariance} />
                <VarianceRow
                  label="Transfer variance"
                  value={transferVariance}
                />
              </View>
            </View>

            <View className="gap-3">
              <Text className="text-base font-bold text-foreground">
                Closing stock
              </Text>
              {inventoryLines.length > 0 ? (
                <View className="gap-3">
                  {inventoryLines.length > 8 ? (
                    <FormField
                      label="Find stock line"
                      onChangeText={setInventoryLineQuery}
                      placeholder="Search products or units"
                      value={inventoryLineQuery}
                    />
                  ) : null}
                  {visibleInventoryLines.length > 0 ? (
                    visibleInventoryLines.map((line) => {
                      const declaredQuantity = parseWholeQuantity(
                        inventoryDraft[line.id] ?? "0",
                      )
                      const variance = declaredQuantity - line.expectedQuantity

                      return (
                        <View
                          className="gap-3 rounded-2xl border border-border bg-card p-4"
                          key={line.id}
                        >
                          <View className="flex-row items-start justify-between gap-3">
                            <View className="flex-1 gap-1">
                              <Text className="font-semibold text-foreground">
                                {line.productName}
                              </Text>
                              <Text className="text-xs font-semibold uppercase text-muted-foreground">
                                {line.unitName}
                              </Text>
                            </View>
                            <Text className="text-xs font-bold text-muted-foreground">
                              Expected {formatQuantity(line.expectedQuantity)}
                            </Text>
                          </View>
                          <FormField
                            inputMode="numeric"
                            keyboardType="numeric"
                            label="Declared closing stock"
                            onChangeText={(value) =>
                              updateInventoryLine(line.id, value)
                            }
                            placeholder="Enter counted stock"
                            value={inventoryDraft[line.id] ?? ""}
                          />
                          <Text
                            className={cn(
                              "text-xs font-bold",
                              variance === 0
                                ? "text-emerald-700"
                                : "text-destructive",
                            )}
                          >
                            {variance === 0
                              ? "Stock balanced"
                              : `${variance > 0 ? "+" : ""}${formatQuantity(
                                  variance,
                                )} variance`}
                          </Text>
                        </View>
                      )
                    })
                  ) : (
                    <View className="gap-2 rounded-2xl border border-dashed border-border p-4">
                      <Text className="font-semibold text-foreground">
                        No matching stock lines
                      </Text>
                      <Text className="text-sm leading-5 text-muted-foreground">
                        Try another product or unit name.
                      </Text>
                    </View>
                  )}
                  {filteredInventoryLines.length >
                  visibleInventoryLines.length ? (
                    <Text className="text-xs font-semibold text-muted-foreground">
                      Showing first {visibleInventoryLines.length} of{" "}
                      {filteredInventoryLines.length} stock lines.
                    </Text>
                  ) : null}
                </View>
              ) : (
                <View className="gap-2 rounded-2xl border border-dashed border-border p-4">
                  <Text className="font-semibold text-foreground">
                    Add inventory first
                  </Text>
                  <Text className="text-sm leading-5 text-muted-foreground">
                    Closeout needs at least one inventory item to confirm.
                  </Text>
                </View>
              )}
            </View>

            <FormField
              label="Closeout note"
              onChangeText={setNote}
              placeholder="Enter variance reason or handover note"
              value={note}
            />

            {submitError ? (
              <View className="rounded-2xl bg-destructive/10 p-3">
                <Text className="text-sm font-semibold text-destructive">
                  {submitError}
                </Text>
              </View>
            ) : null}

            <ActionButton disabled={!canSubmit} onPress={submit}>
              {closeSessionMutation.isPending
                ? "Submitting closeout..."
                : "Submit closeout"}
            </ActionButton>

            <ActionButton onPress={onComplete} variant="outline">
              Done
            </ActionButton>
          </View>
        </BottomSheetKeyboardAwareScrollView>
      </Modal>
    )
  },
)

CloseoutSheet.displayName = "CloseoutSheet"
