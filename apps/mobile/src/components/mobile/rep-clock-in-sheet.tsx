import { ActionButton } from "@/components/mobile/action-button";
import { FormField } from "@/components/mobile/form-field";
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { Text } from "@/components/ui/text";
import {
  formatWholeQuantity as formatQuantity,
  normalizeWholeNumberInput,
  parseWholeQuantity as parseQuantity,
} from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { useBusinessStore } from "@/store/businessStore";
import {
  type RetailOpsProduct,
  type RetailOpsRepSession,
  useRetailOpsStore,
} from "@/store/retailOpsStore";
import { useTRPC } from "@/trpc/client";
import type { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useMutation } from "@tanstack/react-query";
import { forwardRef, useEffect, useMemo, useState } from "react";
import { View } from "react-native";

type RepClockInSheetProps = {
  attendantName?: string;
  onComplete?: () => void;
};

type OpeningInventoryDraftLine = {
  expectedQuantity: number;
  id: string;
  productId: string;
  productName: string;
  remoteVariantId?: string;
  unitName: string;
  variantId?: string;
};

function formatClockInTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Today";

  return date.toLocaleString(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  });
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
    };
    const variantLines = product.variants.map((variant) => ({
      expectedQuantity: variant.currentStock ?? variant.startingStock ?? 0,
      id: `${product.id}-${variant.id}`,
      productId: product.id,
      productName: product.name,
      remoteVariantId: variant.remoteId,
      unitName: variant.name,
      variantId: variant.id,
    }));

    return [primaryLine, ...variantLines];
  });
}

function OpenSessionSummary({
  session,
}: {
  session: RetailOpsRepSession;
}) {
  const varianceLines = session.openingInventoryLines.filter(
    (line) => line.variance !== 0,
  );

  return (
    <View className="gap-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
      <View className="flex-row gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/10">
          <Icon className="size-base text-emerald-600" name="Clock" />
        </View>
        <View className="flex-1 gap-1">
          <Text className="text-base font-bold text-foreground">
            Already clocked in
          </Text>
          <Text className="text-sm leading-5 text-muted-foreground">
            {session.attendantName} opened this sales day at{" "}
            {formatClockInTime(session.clockedInAt)}.
          </Text>
        </View>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1 rounded-xl bg-card p-3">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            Lines
          </Text>
          <Text className="mt-1 text-lg font-bold text-foreground">
            {session.openingInventoryLines.length}
          </Text>
        </View>
        <View className="flex-1 rounded-xl bg-card p-3">
          <Text className="text-xs font-semibold uppercase text-muted-foreground">
            Variances
          </Text>
          <Text
            className={cn(
              "mt-1 text-lg font-bold",
              varianceLines.length > 0
                ? "text-destructive"
                : "text-emerald-700",
            )}
          >
            {varianceLines.length}
          </Text>
        </View>
      </View>
      {session.syncStatus === "pending" ? (
        <View className="self-start rounded-full bg-amber-500/10 px-3 py-1">
          <Text className="text-xs font-bold text-amber-700">
            Pending sync
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export const RepClockInSheet = forwardRef<
  BottomSheetModal,
  RepClockInSheetProps
>(({ attendantName = "Store Owner", onComplete }, ref) => {
  const trpc = useTRPC();
  const activeBusinessId = useBusinessStore((state) => state.activeBusinessId);
  const clockInRepSession = useRetailOpsStore(
    (state) => state.clockInRepSession,
  );
  const isOfflineMode = useRetailOpsStore((state) => state.isOfflineMode);
  const products = useRetailOpsStore((state) =>
    state.products.filter(
      (product) =>
        !activeBusinessId ||
        (product.businessId ?? activeBusinessId) === activeBusinessId,
    ),
  );
  const repSessions = useRetailOpsStore((state) =>
    state.repSessions.filter(
      (session) =>
        !activeBusinessId ||
        (session.businessId ?? activeBusinessId) === activeBusinessId,
    ),
  );
  const openingInventoryLines = useMemo(
    () => getOpeningInventoryLines(products),
    [products],
  );
  const openSession = repSessions.find(
    (session) =>
      session.status === "open" && session.attendantName === attendantName,
  );
  const [inventoryDraft, setInventoryDraft] = useState<
    Record<string, string>
  >({});
  const [note, setNote] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const openSessionMutation = useMutation(
    trpc.retailOps.openSession.mutationOptions({
      onError: (error) => {
        setSubmitError(error.message);
      },
    }),
  );
  const canOpenProductionSession =
    !isOfflineMode &&
    openingInventoryLines.length > 0 &&
    openingInventoryLines.every((line) => !!line.remoteVariantId);
  const canSubmit =
    !openSession &&
    openingInventoryLines.length > 0 &&
    openingInventoryLines.every((line) => inventoryDraft[line.id]?.trim()) &&
    !openSessionMutation.isPending;
  const sourceLabel = canOpenProductionSession
    ? "Online"
    : isOfflineMode
      ? "Local"
      : "Local queue";
  const sourceDetail = canOpenProductionSession
    ? "This session will open in production immediately."
    : isOfflineMode
      ? "This clock-in will be queued locally and synced later."
      : "Waiting for all product units to sync before direct production clock-in.";

  useEffect(() => {
    setInventoryDraft((current) => {
      const nextDraft: Record<string, string> = {};

      for (const line of openingInventoryLines) {
        nextDraft[line.id] =
          current[line.id] ?? formatQuantity(line.expectedQuantity);
      }

      return nextDraft;
    });
  }, [openingInventoryLines]);

  const updateInventoryLine = (id: string, value: string) => {
    setInventoryDraft((current) => ({
      ...current,
      [id]: normalizeWholeNumberInput(value),
    }));
  };

  const submit = () => {
    if (!canSubmit) return;

    const openingLines = openingInventoryLines.map((line) => ({
      confirmedQuantity: parseQuantity(inventoryDraft[line.id] ?? "0"),
      expectedQuantity: line.expectedQuantity,
      productId: line.productId,
      productName: line.productName,
      unitName: line.unitName,
      variantId: line.variantId,
    }));

    setSubmitError(null);

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
            });
            setNote("");
            onComplete?.();
          },
        },
      );
      return;
    }

    clockInRepSession({
      attendantName,
      businessId: activeBusinessId ?? undefined,
      note,
      openingInventoryLines: openingLines,
    });
    setNote("");
    onComplete?.();
  };

  return (
    <Modal
      enableDynamicSizing
      ref={ref}
      snapPoints={["92%"]}
      title="Clock in"
    >
      <BottomSheetKeyboardAwareScrollView
        bottomOffset={112}
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 px-5 pb-6">
          <View className="gap-2">
            <Text className="text-xl font-bold text-foreground">
              Start sales day
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              Confirm opening stock before recording sales for this business.
            </Text>
          </View>

          {!openSession ? (
            <View className="rounded-2xl border border-border bg-card p-4">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1 gap-1">
                  <Text className="font-semibold text-foreground">
                    Clock-in source
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
          ) : null}

          {openSession ? (
            <OpenSessionSummary session={openSession} />
          ) : products.length === 0 ? (
            <View className="gap-2 rounded-2xl border border-dashed border-border p-4">
              <Text className="font-semibold text-foreground">
                Add inventory first
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                A rep can clock in after at least one product unit exists.
              </Text>
            </View>
          ) : (
            <View className="gap-4">
              {openingInventoryLines.map((line) => {
                const confirmedQuantity = parseQuantity(
                  inventoryDraft[line.id] ?? "0",
                );
                const variance = confirmedQuantity - line.expectedQuantity;

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
                      label="Confirmed opening stock"
                      onChangeText={(value) =>
                        updateInventoryLine(line.id, value)
                      }
                      placeholder={formatQuantity(line.expectedQuantity)}
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
                        ? "Opening stock balanced"
                        : `${variance > 0 ? "+" : ""}${formatQuantity(
                            variance,
                          )} variance`}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {!openSession ? (
            <FormField
              label="Opening note"
              onChangeText={setNote}
              placeholder="Optional variance or handover note"
              value={note}
            />
          ) : null}

          {submitError ? (
            <View className="rounded-2xl bg-destructive/10 p-3">
              <Text className="text-sm font-semibold text-destructive">
                {submitError}
              </Text>
            </View>
          ) : null}

          <ActionButton disabled={!canSubmit} onPress={submit}>
            {openSessionMutation.isPending
              ? "Opening session..."
              : "Clock in and start selling"}
          </ActionButton>

          <ActionButton onPress={onComplete} variant="outline">
            Done
          </ActionButton>
        </View>
      </BottomSheetKeyboardAwareScrollView>
    </Modal>
  );
});

RepClockInSheet.displayName = "RepClockInSheet";
