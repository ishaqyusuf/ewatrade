import { ActionButton } from "@/components/mobile/action-button"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import {
  SessionInventoryLine,
  SessionSourcePanel,
  SessionStatTile,
} from "@/components/mobile/session-flow"
import { StatusBanner } from "@/components/mobile/status-banner"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Modal } from "@/components/ui/modal"
import { Text } from "@/components/ui/text"
import {
  formatWholeQuantity as formatQuantity,
  normalizeWholeNumberInput,
  parseWholeQuantity as parseQuantity,
} from "@/lib/quantity"
import { useBusinessStore } from "@/store/businessStore"
import {
  type RetailOpsProduct,
  type RetailOpsRepSession,
  useRetailOpsStore,
} from "@/store/retailOpsStore"
import { useTRPC } from "@/trpc/client"
import type { BottomSheetModal } from "@gorhom/bottom-sheet"
import { useMutation } from "@tanstack/react-query"
import { forwardRef, useEffect, useMemo, useState } from "react"
import { View } from "react-native"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

type RepClockInSheetProps = {
  attendantName?: string
  onComplete?: () => void
}

type RepClockInContentProps = RepClockInSheetProps & {
  presentation?: "screen" | "sheet"
}

type OpeningInventoryDraftLine = {
  expectedQuantity: number
  id: string
  productId: string
  productName: string
  remoteVariantId?: string
  unitName: string
  variantId?: string
}

function formatClockInTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return "Today"

  return date.toLocaleString(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  })
}

function getOpeningInventoryLines(
  products: RetailOpsProduct[],
): OpeningInventoryDraftLine[] {
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

function OpenSessionSummary({
  session,
}: {
  session: RetailOpsRepSession
}) {
  const varianceLines = session.openingInventoryLines.filter(
    (line) => line.variance !== 0,
  )

  return (
    <View className="gap-3">
      <StatusBanner
        icon="Clock"
        message={`${session.attendantName} opened this sales day at ${formatClockInTime(
          session.clockedInAt,
        )}.`}
        title="Already clocked in"
        tone="success"
      />
      <View className="flex-row gap-3">
        <SessionStatTile
          label="Lines"
          value={String(session.openingInventoryLines.length)}
        />
        <SessionStatTile
          label="Variances"
          tone={varianceLines.length > 0 ? "destructive" : "success"}
          value={String(varianceLines.length)}
        />
      </View>
      {session.syncStatus === "pending" ? (
        <StatusBanner
          icon="Zap"
          message="This opening session is saved locally and will sync when the device reconnects."
          title="Pending sync"
          tone="warning"
        />
      ) : null}
    </View>
  )
}

export function RepClockInContent({
  attendantName = "Store Owner",
  onComplete,
  presentation = "sheet",
}: RepClockInContentProps) {
  const trpc = useTRPC()
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId)
  const clockInRepSession = useRetailOpsStore(
    (state) => state.clockInRepSession,
  )
  const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode)
  const allProducts = useRetailOpsStore((state) => state.products)
  const allRepSessions = useRetailOpsStore((state) => state.repSessions)
  const products = useMemo(
    () =>
      allProducts.filter(
        (product) =>
          (product.kind ?? "product") === "product" &&
          (!activeBusinessId ||
            (product.businessId ?? activeBusinessId) === activeBusinessId),
      ),
    [activeBusinessId, allProducts],
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
  const openingInventoryLines = useMemo(
    () => getOpeningInventoryLines(products),
    [products],
  )
  const openSession = repSessions.find(
    (session) =>
      session.status === "open" && session.attendantName === attendantName,
  )
  const [inventoryDraft, setInventoryDraft] = useState<Record<string, string>>(
    {},
  )
  const [inventoryLineQuery, setInventoryLineQuery] = useState("")
  const [note, setNote] = useState("")
  const [submitError, setSubmitError] = useState<string | null>(null)
  const openSessionMutation = useMutation(
    trpc.retailOps.openSession.mutationOptions({
      onError: (error) => {
        setSubmitError(error.message)
      },
    }),
  )
  const canOpenProductionSession =
    !isOfflineMode &&
    openingInventoryLines.length > 0 &&
    openingInventoryLines.every((line) => !!line.remoteVariantId)
  const canSubmit =
    !openSession &&
    openingInventoryLines.length > 0 &&
    openingInventoryLines.every((line) => inventoryDraft[line.id]?.trim()) &&
    !openSessionMutation.isPending
  const sourceLabel = isOfflineMode ? "Offline mode" : "Sync required"
  const sourceDetail = isOfflineMode
    ? "This clock-in will sync when connection is ready."
    : "Waiting for all product units to sync before direct production clock-in."
  const filteredOpeningInventoryLines = useMemo(() => {
    const normalizedQuery = inventoryLineQuery.trim().toLowerCase()

    if (!normalizedQuery) return openingInventoryLines

    return openingInventoryLines.filter((line) =>
      [line.productName, line.unitName]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    )
  }, [inventoryLineQuery, openingInventoryLines])
  const visibleOpeningInventoryLines = useMemo(
    () => filteredOpeningInventoryLines.slice(0, 12),
    [filteredOpeningInventoryLines],
  )

  useEffect(() => {
    setInventoryDraft((current) => {
      const nextDraft: Record<string, string> = {}

      for (const line of openingInventoryLines) {
        nextDraft[line.id] =
          current[line.id] ?? formatQuantity(line.expectedQuantity)
      }

      return nextDraft
    })
  }, [openingInventoryLines])

  const updateInventoryLine = (id: string, value: string) => {
    setInventoryDraft((current) => ({
      ...current,
      [id]: normalizeWholeNumberInput(value),
    }))
  }

  const submit = () => {
    if (!canSubmit) return

    const openingLines = openingInventoryLines.map((line) => ({
      confirmedQuantity: parseQuantity(inventoryDraft[line.id] ?? "0"),
      expectedQuantity: line.expectedQuantity,
      productId: line.productId,
      productName: line.productName,
      unitName: line.unitName,
      variantId: line.variantId,
    }))

    setSubmitError(null)

    if (canOpenProductionSession) {
      openSessionMutation.mutate(
        {
          inventoryLines: openingInventoryLines.map((line) => ({
            countedQuantity: parseQuantity(inventoryDraft[line.id] ?? "0"),
            productVariantId: line.remoteVariantId as string,
          })),
          notes: note.trim() || undefined,
          openingFloatMinor: 0,
        },
        {
          onSuccess: (session) => {
            clockInRepSession({
              attendantName,
              businessId: activeBusinessId ?? undefined,
              clockedInAt:
                session.openedAt instanceof Date
                  ? session.openedAt.toISOString()
                  : String(session.openedAt),
              note,
              openingInventoryLines: openingLines,
              remoteId: session.id,
              syncStatus: "synced",
            })
            setNote("")
            onComplete?.()
          },
        },
      )
      return
    }

    clockInRepSession({
      attendantName,
      businessId: activeBusinessId ?? undefined,
      note,
      openingInventoryLines: openingLines,
    })
    setNote("")
    onComplete?.()
  }

  const contentClassName =
    presentation === "screen" ? "gap-5 px-4 pb-6" : "gap-5 px-5 pb-6"

  const content = (
    <View className={contentClassName}>
      <View className="gap-2">
        <Text className="text-xl font-bold text-foreground">
          Start sales day
        </Text>
        <Text className="text-sm leading-5 text-muted-foreground">
          Confirm opening stock before recording sales for this business.
        </Text>
      </View>

      {!openSession && !canOpenProductionSession ? (
        <SessionSourcePanel
          detail={sourceDetail}
          label={sourceLabel}
          title={sourceLabel}
          tone="warning"
        />
      ) : null}

      {openSession ? (
        <OpenSessionSummary session={openSession} />
      ) : products.length === 0 ? (
        <EmptyState
          icon="Warehouse"
          message="A rep can clock in after at least one product unit exists."
          title="Add inventory first"
        />
      ) : (
        <View className="gap-4">
          {openingInventoryLines.length > 8 ? (
            <FormField
              label="Find stock line"
              leadingIcon="Search"
              onChangeText={setInventoryLineQuery}
              placeholder="Search products or units"
              value={inventoryLineQuery}
            />
          ) : null}
          {visibleOpeningInventoryLines.length > 0 ? (
            visibleOpeningInventoryLines.map((line) => {
              const confirmedQuantity = parseQuantity(
                inventoryDraft[line.id] ?? "0",
              )
              const variance = confirmedQuantity - line.expectedQuantity

              return (
                <SessionInventoryLine
                  expectedLabel={`Expected ${formatQuantity(
                    line.expectedQuantity,
                  )}`}
                  key={line.id}
                  productName={line.productName}
                  unitName={line.unitName}
                  varianceLabel={
                    variance === 0
                      ? "Opening stock balanced"
                      : `${variance > 0 ? "+" : ""}${formatQuantity(
                          variance,
                        )} variance`
                  }
                  varianceTone={variance === 0 ? "success" : "destructive"}
                >
                  <FormField
                    inputMode="numeric"
                    keyboardType="numeric"
                    label="Confirmed opening stock"
                    leadingIcon="Hash"
                    onChangeText={(value) =>
                      updateInventoryLine(line.id, value)
                    }
                    placeholder="Enter counted stock"
                    value={inventoryDraft[line.id] ?? ""}
                  />
                </SessionInventoryLine>
              )
            })
          ) : (
            <EmptyState
              icon="Search"
              message="Try another product or unit name."
              title="No matching stock lines"
            />
          )}
          {filteredOpeningInventoryLines.length >
          visibleOpeningInventoryLines.length ? (
            <Text className="text-xs font-semibold text-muted-foreground">
              Showing first {visibleOpeningInventoryLines.length} of{" "}
              {filteredOpeningInventoryLines.length} stock lines.
            </Text>
          ) : null}
        </View>
      )}

      {!openSession ? (
        <FormField
          label="Opening note"
          leadingIcon="StickyNote"
          onChangeText={setNote}
          placeholder="Enter variance or handover note"
          value={note}
        />
      ) : null}

      {submitError ? (
        <StatusBanner
          icon="TriangleAlert"
          message={submitError}
          title="Clock-in failed"
          tone="destructive"
        />
      ) : null}

      <ActionButton
        disabled={!canSubmit}
        isLoading={openSessionMutation.isPending}
        loadingLabel="Opening session"
        onPress={submit}
      >
        Clock in and start selling
      </ActionButton>

      <ActionButton onPress={onComplete} variant="outline">
        Done
      </ActionButton>
    </View>
  )

  if (presentation === "screen") {
    return (
      <KeyboardAwareScrollView
        className="flex-1"
        bottomOffset={320}
        contentContainerStyle={{ paddingBottom: 240 }}
        disableScrollOnKeyboardHide
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        {content}
      </KeyboardAwareScrollView>
    )
  }

  return (
    <BottomSheetKeyboardAwareScrollView
      bottomOffset={320}
      contentContainerStyle={{ paddingBottom: 240 }}
      keyboardShouldPersistTaps="handled"
    >
      {content}
    </BottomSheetKeyboardAwareScrollView>
  )
}

export const RepClockInSheet = forwardRef<
  BottomSheetModal,
  RepClockInSheetProps
>((props, ref) => {
  return (
    <Modal enableDynamicSizing ref={ref} snapPoints={["92%"]} title="Clock in">
      <RepClockInContent {...props} presentation="sheet" />
    </Modal>
  )
})

RepClockInSheet.displayName = "RepClockInSheet"
