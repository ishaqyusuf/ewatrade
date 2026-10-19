import { BottomSheetInputProvider } from "@/components/ui/bottom-sheet-input-context"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useTRPC } from "@/trpc/client"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import { useQuery } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"
import { ActionButton } from "../action-button"
import { FormField } from "../form-field"
import { MoneyField } from "../money-field"
import {
  type NativeOrderAction,
  nativeOrderCandidate,
  replacementInputs,
} from "./native-order-values"

type Props = {
  initial: NativeOrderAction
  review?: string[]
  currencyCode: string
  disabled: boolean
  onSave: (payload: GeneralAction) => void
}

export function GeneralOrderOperationEditor(props: Props) {
  const { profile } = useAuthContext()
  const scope = JSON.stringify([
    profile?.id,
    profile?.businessId,
    profile?.storeId,
    profile?.role,
    profile?.staffAccessMode,
  ])
  return props.initial.action === "order_replace" ? (
    <ReplacementEditor key={scope} {...props} initial={props.initial} />
  ) : (
    <LineOperationEditor key={scope} {...props} initial={props.initial} />
  )
}

function EditorFrame({
  review,
  children,
  error,
  disabled,
  onSave,
}: {
  review?: string[]
  children: ReactNode
  error: string | null
  disabled: boolean
  onSave: () => void
}) {
  return (
    <BottomSheetInputProvider>
      <BottomSheetKeyboardAwareScrollView
        contentContainerStyle={{
          gap: 16,
          paddingHorizontal: 18,
          paddingBottom: 32,
        }}
      >
        <Text className="text-sm text-muted-foreground">
          Save changes, then review the refreshed proposal before confirming.
        </Text>
        {review?.length ? (
          <View className="gap-2 border-l border-border pl-3">
            {review.map((line, index) => (
              <Text
                key={`${index}:${line}`}
                className="text-sm text-muted-foreground"
              >
                {line}
              </Text>
            ))}
          </View>
        ) : null}
        {children}
        {error ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {error}
          </Text>
        ) : null}
        <ActionButton disabled={disabled} onPress={onSave}>
          Save and review
        </ActionButton>
      </BottomSheetKeyboardAwareScrollView>
    </BottomSheetInputProvider>
  )
}

function ReplacementEditor({
  initial,
  review,
  currencyCode,
  disabled,
  onSave,
}: Omit<Props, "initial"> & {
  initial: Extract<NativeOrderAction, { action: "order_replace" }>
}) {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const query = useQuery(
    mountOwnedRead(
      trpc.orders.get.queryOptions(
        { orderId: initial.orderId },
        {
          retry: false,
          staleTime: 0,
          gcTime: 0,
          refetchOnMount: "always",
          trpc: { abortOnUnmount: true },
        },
      ),
      mount,
    ),
  )
  const read = freshShownRead(query)
  const order = read.state === "ready" ? read.data : null
  const [changes, setChanges] = useState(() => replacementInputs(initial))
  const [reason, setReason] = useState(initial.reason)
  const [error, setError] = useState<string | null>(null)
  const pending = disabled || !order
  function save() {
    if (pending || !order) return
    const result = nativeOrderCandidate(initial, {
      reason,
      changes,
      sources: order.lines,
    })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    onSave(result.payload)
  }
  return (
    <EditorFrame review={review} error={error} disabled={pending} onSave={save}>
      {read.state === "refused" ? (
        <View className="gap-2">
          <Text accessibilityRole="alert" className="text-sm text-foreground">
            Order unavailable. Refresh it before editing.
          </Text>
          <ActionButton
            variant="outline"
            disabled={disabled}
            onPress={() => void query.refetch()}
          >
            Retry order
          </ActionButton>
        </View>
      ) : !order ? (
        <Text className="text-sm text-muted-foreground">
          Checking the original order and your current access…
        </Text>
      ) : (
        <>
          <Text className="text-sm text-foreground">
            Order {order.orderNumber}. The original order remains in history and
            is linked to its replacement.
          </Text>
          {initial.changes.map((line, index) => {
            const source = order.lines.find(
              (row) => row.id === line.orderLineId,
            )
            const change = changes[index]
            if (!change) return null
            return (
              <View
                key={line.orderLineId}
                className="gap-3 border border-border p-3"
              >
                <Text className="font-medium text-foreground">
                  {source?.snapshot?.catalogItemName ?? "Order item"} ·{" "}
                  {source?.snapshot?.offeringName ?? ""}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Original quantity {source?.quantity ?? "unavailable"}. Leave a
                  field blank to keep its original value.
                </Text>
                <FormField
                  label="Replacement quantity"
                  value={change.quantity}
                  editable={!pending}
                  keyboardType="decimal-pad"
                  onChangeText={(quantity) =>
                    setChanges((rows) =>
                      rows.map((row, position) =>
                        position === index ? { ...row, quantity } : row,
                      ),
                    )
                  }
                />
                <MoneyField
                  label={
                    source?.snapshot?.pricingPolicy === "order_total"
                      ? "Replacement item total"
                      : "Replacement unit price"
                  }
                  currencyCode={currencyCode}
                  value={change.amount}
                  editable={!pending}
                  onChangeValue={(amount) =>
                    setChanges((rows) =>
                      rows.map((row, position) =>
                        position === index ? { ...row, amount } : row,
                      ),
                    )
                  }
                />
              </View>
            )
          })}
          <FormField
            label="Reason"
            value={reason}
            editable={!pending}
            maxLength={500}
            multiline
            onChangeText={setReason}
          />
        </>
      )}
    </EditorFrame>
  )
}

function LineOperationEditor({
  initial,
  review,
  disabled,
  onSave,
}: Omit<Props, "initial"> & {
  initial: Exclude<NativeOrderAction, { action: "order_replace" }>
}) {
  const [reason, setReason] = useState(initial.reason)
  const [quantity, setQuantity] = useState(
    initial.action === "product_line_return" ? initial.quantity : "",
  )
  const [disposition, setDisposition] = useState(
    initial.action === "product_line_return"
      ? initial.disposition
      : ("restock" as const),
  )
  const [destination, setDestination] = useState<"reviewed" | "original">(
    "reviewed",
  )
  const [error, setError] = useState<string | null>(null)
  function save() {
    if (disabled) return
    const result = nativeOrderCandidate(initial, {
      reason,
      quantity,
      disposition,
      destination,
    })
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    onSave(result.payload)
  }
  return (
    <EditorFrame
      review={review}
      error={error}
      disabled={disabled}
      onSave={save}
    >
      {initial.action === "product_line_return" ? (
        <>
          <Text className="text-sm text-muted-foreground">
            A return records items, not a customer credit or cash refund.
          </Text>
          <FormField
            label="Quantity in the sold unit"
            value={quantity}
            editable={!disabled}
            keyboardType="decimal-pad"
            onChangeText={setQuantity}
          />
          <View
            className="gap-2"
            accessibilityRole="radiogroup"
            accessibilityLabel="What happens to the returned items?"
          >
            {(
              [
                ["restock", "Return to available stock"],
                ["damaged", "Damaged — do not restock"],
                ["quarantine", "Quarantine — do not restock"],
                ["no_restock", "Record return without restocking"],
              ] as const
            ).map(([value, label]) => (
              <Choice
                key={value}
                label={label}
                selected={disposition === value}
                disabled={disabled}
                onPress={() => setDisposition(value)}
              />
            ))}
          </View>
          {disposition === "restock" && initial.destinationBalanceSourceId ? (
            <View
              className="gap-2"
              accessibilityRole="radiogroup"
              accessibilityLabel="Stock destination"
            >
              <Choice
                label="Keep the reviewed destination"
                selected={destination === "reviewed"}
                disabled={disabled}
                onPress={() => setDestination("reviewed")}
              />
              <Choice
                label="Original stock source"
                selected={destination === "original"}
                disabled={disabled}
                onPress={() => setDestination("original")}
              />
            </View>
          ) : (
            <Text className="text-sm text-muted-foreground">
              {disposition === "restock"
                ? "Items return to their original stock source. Ask in chat to select a different destination."
                : "Available stock will not increase."}
            </Text>
          )}
        </>
      ) : initial.action === "service_line_authorize" ? (
        <Text className="text-sm text-muted-foreground">
          Authorize the saved service selection shown above. This records
          approval only, not service performance, a stock movement or payment.
        </Text>
      ) : (
        <Text className="text-sm text-muted-foreground">
          This uses the saved selection and quantity shown above. To select
          other items, ask in chat. The server records the performance time;
          this does not record payment.
        </Text>
      )}
      <FormField
        label="Reason"
        value={reason}
        editable={!disabled}
        maxLength={500}
        multiline
        onChangeText={setReason}
      />
    </EditorFrame>
  )
}

function Choice({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string
  selected: boolean
  disabled: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`rounded-lg border px-3 py-3 ${selected ? "border-primary bg-secondary" : "border-border bg-background"}`}
    >
      <Text className="text-sm text-foreground">{label}</Text>
    </Pressable>
  )
}
