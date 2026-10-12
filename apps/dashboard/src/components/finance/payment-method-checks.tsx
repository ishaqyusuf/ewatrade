"use client"
import { Checkbox, CheckboxField } from "@ewatrade/ui"
import {
  type MoneyAccountPurpose,
  ORDER_PAYMENT_METHODS,
  ORDER_PAYMENT_METHOD_LABELS,
  type OrderPaymentMethod,
  moneyAccountCanTake,
} from "@ewatrade/utils/finance-payment-methods"

/** Which payment methods a money account takes; cash only fits cash accounts. */
export function PaymentMethodChecks({
  purpose,
  value,
  onChange,
  disabled,
  error,
}: {
  purpose: MoneyAccountPurpose
  value: readonly OrderPaymentMethod[]
  onChange: (methods: OrderPaymentMethod[]) => void
  disabled?: boolean
  error?: string
}) {
  return (
    <fieldset className="grid gap-3" disabled={disabled}>
      <legend className="mb-1 text-sm font-medium">
        Accepted payment methods
      </legend>
      <p className="text-sm text-muted-foreground">
        Staff only see this account when a customer pays one of these ways.
      </p>
      {ORDER_PAYMENT_METHODS.map((method) => {
        const allowed = moneyAccountCanTake(purpose, method)
        return (
          <CheckboxField
            key={method}
            label={ORDER_PAYMENT_METHOD_LABELS[method]}
            description={
              allowed
                ? undefined
                : purpose === "CASH"
                  ? "Cash accounts only take cash."
                  : "Cash goes into a cash account."
            }
          >
            <Checkbox
              checked={allowed && value.includes(method)}
              disabled={disabled || !allowed}
              onCheckedChange={(checked) =>
                onChange(
                  ORDER_PAYMENT_METHODS.filter((row) =>
                    row === method ? checked === true : value.includes(row),
                  ),
                )
              }
            />
          </CheckboxField>
        )
      })}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </fieldset>
  )
}
