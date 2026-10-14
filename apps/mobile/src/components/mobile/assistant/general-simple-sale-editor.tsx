import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useTRPC } from "@/trpc/client"
import {
  type GeneralAction,
  type SimpleSale,
  similarSaleNames,
  simpleSaleAction,
} from "@ewatrade/assistant/general/contracts"
import { majorToMinor, minorToMajorInput } from "@ewatrade/utils/currency"
import { useQuery } from "@tanstack/react-query"
import { type ComponentProps, useDeferredValue, useState } from "react"
import { ActionButton } from "../action-button"
import { FormField } from "../form-field"

export function GeneralSimpleSaleEditor({
  initial,
  disabled,
  onSave,
}: {
  initial: SimpleSale
  disabled: boolean
  onSave: (sale: GeneralAction) => void
}) {
  const [sale, setSale] = useState(initial)
  const [received, setReceived] = useState(
    initial.receivedMinor === undefined
      ? ""
      : minorToMajorInput(initial.receivedMinor),
  )
  const [total, setTotal] = useState(
    initial.totalMinor === undefined
      ? ""
      : minorToMajorInput(initial.totalMinor),
  )
  const [error, setError] = useState("")
  const trpc = useTRPC()
  const customerName = useDeferredValue(sale.customerName)
  const options = useQuery(
    trpc.assistant.saleOptions.queryOptions({ customerName }),
  )
  const patch = (changes: Partial<SimpleSale>) =>
    setSale((current) => ({ ...current, ...changes }))
  function save() {
    const paid = majorToMinor(received)
    const full = majorToMinor(total)
    if ((received.trim() && paid === null) || (total.trim() && full === null)) {
      setError("Enter a valid amount.")
      return
    }
    const parsed = simpleSaleAction.safeParse({
      ...sale,
      receivedMinor: paid ?? undefined,
      totalMinor: full ?? undefined,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the sale details.")
      return
    }
    onSave(parsed.data)
  }
  const accounts = sale.accountName
    ? similarSaleNames(sale.accountName, options.data?.accounts ?? [])
    : (options.data?.accounts ?? [])
  return (
    <View className="gap-4 p-4">
      <FormField
        label="Receiving account"
        value={sale.accountName ?? ""}
        editable={!disabled}
        maxLength={160}
        placeholder="e.g. Ishaq PalmPay"
        onChangeText={(value) =>
          patch({
            accountName: value || undefined,
            moneyAccountId: undefined,
            createAccount: false,
          })
        }
      />
      <View className="flex-row flex-wrap gap-2">
        {accounts.map((account) => (
          <SaleChoice
            key={account.id}
            label={account.name}
            disabled={disabled}
            onPress={() =>
              patch({
                moneyAccountId: account.id,
                accountName: account.name,
                createAccount: false,
                method: account.purpose === "CASH" ? "cash" : "bank_transfer",
              })
            }
          />
        ))}
        {sale.accountName && !sale.moneyAccountId ? (
          <SaleChoice
            label={`Create ${sale.accountName}`}
            disabled={disabled}
            onPress={() => patch({ createAccount: true })}
          />
        ) : null}
      </View>
      <FormField
        label="Customer"
        value={sale.customerName ?? ""}
        editable={!disabled}
        maxLength={160}
        placeholder="Name or choose Walk-in"
        onChangeText={(value) =>
          patch({
            customerName: value || undefined,
            customerId: undefined,
            customerChoice: undefined,
          })
        }
      />
      <View className="flex-row flex-wrap gap-2">
        {options.data?.customers.map((customer) => (
          <SaleChoice
            key={customer.id}
            label={customer.name}
            disabled={disabled}
            onPress={() =>
              patch({
                customerId: customer.id,
                customerName: customer.name,
                customerChoice: undefined,
              })
            }
          />
        ))}
        {sale.customerName && !sale.customerId ? (
          <SaleChoice
            label="New customer"
            disabled={disabled}
            onPress={() => patch({ customerChoice: "new" })}
          />
        ) : null}
        <SaleChoice
          label="Walk-in"
          disabled={disabled}
          onPress={() =>
            patch({
              customerChoice: "walk_in",
              customerId: undefined,
              customerName: undefined,
            })
          }
        />
      </View>
      <Text className="text-sm text-muted-foreground">
        {sale.customerChoice === "walk_in"
          ? "Walk-in selected"
          : sale.customerChoice === "new"
            ? "New customer selected"
            : sale.customerId
              ? "Saved customer selected"
              : "Choose a customer or Walk-in"}
        {sale.createAccount ? ` · New account: ${sale.accountName}` : ""}
      </Text>
      <FormField
        label="Amount received"
        keyboardType="decimal-pad"
        value={received}
        editable={!disabled}
        onChangeText={setReceived}
      />
      <SaleChoice
        label={sale.partial ? "Part paid" : "Fully paid"}
        disabled={disabled}
        onPress={() => patch({ partial: !sale.partial })}
      />
      <FormField
        label="Full sale total"
        keyboardType="decimal-pad"
        value={total}
        editable={!disabled}
        onChangeText={setTotal}
      />
      <FormField
        label="Description (optional)"
        value={sale.description ?? ""}
        editable={!disabled}
        maxLength={200}
        onChangeText={(value) => patch({ description: value || undefined })}
      />
      {sale.attachmentIds.length ? (
        <Text className="text-sm text-muted-foreground">
          Image will be attached to order activity.
        </Text>
      ) : null}
      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
      <SaleChoice
        label="Update order card"
        disabled={disabled}
        onPress={save}
      />
    </View>
  )
}

function SaleChoice({
  label,
  ...props
}: ComponentProps<typeof ActionButton> & { label: string }) {
  return <ActionButton {...props}>{label}</ActionButton>
}
