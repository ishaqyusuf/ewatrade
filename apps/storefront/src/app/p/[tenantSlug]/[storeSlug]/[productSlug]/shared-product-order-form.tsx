"use client"

import { formatMoney } from "@ewatrade/utils"
import { useMemo, useState } from "react"

type SharedProductOrderVariant = {
  availableQuantity: number
  id: string
  isDefault: boolean
  name: string
  priceMinor: number
}

type SharedProductOrderFormProps = {
  action: (formData: FormData) => void
  currencyCode: string
  errorMessage?: string | null
  productSlug: string
  requested?: string
  shareToken: string
  storeSlug: string
  tenantSlug: string
  variants: SharedProductOrderVariant[]
}

function toWholeQuantity(value: string, maxQuantity?: number) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) return 1

  const wholeQuantity = Math.max(1, Math.trunc(parsed))
  const availableQuantity =
    typeof maxQuantity === "number" && Number.isFinite(maxQuantity)
      ? Math.max(0, Math.trunc(maxQuantity))
      : null

  return availableQuantity ? Math.min(wholeQuantity, availableQuantity) : 1
}

export function SharedProductOrderForm({
  action,
  currencyCode,
  errorMessage,
  productSlug,
  requested,
  shareToken,
  storeSlug,
  tenantSlug,
  variants,
}: SharedProductOrderFormProps) {
  const firstAvailableVariant =
    variants.find((variant) => variant.availableQuantity > 0) ?? variants[0]
  const defaultVariant =
    variants.find(
      (variant) => variant.isDefault && variant.availableQuantity > 0,
    ) ?? firstAvailableVariant
  const [selectedVariantId, setSelectedVariantId] = useState(
    defaultVariant?.id ?? "",
  )
  const [quantity, setQuantity] = useState("1")
  const [customerAuthMode, setCustomerAuthMode] = useState<
    "login" | "register"
  >("register")
  const selectedVariant =
    variants.find((variant) => variant.id === selectedVariantId) ??
    defaultVariant
  const safeQuantity = toWholeQuantity(
    quantity,
    selectedVariant?.availableQuantity,
  )
  const hasAvailableVariant = variants.some(
    (variant) => variant.availableQuantity > 0,
  )
  const totalMinor = useMemo(
    () => (selectedVariant?.priceMinor ?? 0) * safeQuantity,
    [safeQuantity, selectedVariant?.priceMinor],
  )

  return (
    <form
      action={action}
      className="space-y-5"
      data-testid="shared-product-order-form"
    >
      <input name="tenantSlug" type="hidden" value={tenantSlug} />
      <input name="storeSlug" type="hidden" value={storeSlug} />
      <input name="productSlug" type="hidden" value={productSlug} />
      <input name="token" type="hidden" value={shareToken} />
      <input name="quantity" type="hidden" value={safeQuantity} />

      {requested ? (
        <div
          className="border border-green-700/30 bg-green-500/10 p-4 text-green-900 text-sm"
          data-testid="shared-product-order-requested"
        >
          Request received. Reference: {requested}.
        </div>
      ) : null}

      {errorMessage ? (
        <div
          className="border border-red-700/30 bg-red-500/10 p-4 text-red-900 text-sm"
          data-testid="shared-product-order-error"
        >
          {errorMessage}
        </div>
      ) : null}

      <fieldset className="space-y-3">
        <legend className="font-medium text-sm">Choose unit</legend>
        <div className="grid gap-3">
          {variants.map((variant) => (
            <label
              className="flex cursor-pointer items-center justify-between gap-4 border border-border p-4 text-sm"
              key={variant.id}
            >
              <span>
                <span className="block font-medium">{variant.name}</span>
                <span className="text-muted-foreground">
                  {formatMoney(variant.priceMinor / 100, currencyCode)}
                </span>
              </span>
              <input
                checked={selectedVariantId === variant.id}
                data-testid="shared-product-variant-radio"
                disabled={variant.availableQuantity <= 0}
                name="productVariantId"
                onChange={() => setSelectedVariantId(variant.id)}
                required
                type="radio"
                value={variant.id}
              />
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Quantity</span>
          <input
            className="border border-border bg-background px-3 py-3"
            data-testid="shared-product-quantity-input"
            max={selectedVariant?.availableQuantity ?? undefined}
            min="1"
            onChange={(event) => setQuantity(event.target.value)}
            required
            type="number"
            value={quantity}
          />
        </label>
        <div
          className="border border-border bg-surface p-4 text-sm"
          data-testid="shared-product-total"
        >
          <p className="text-muted-foreground">Total</p>
          <p className="mt-1 font-semibold text-2xl">
            {formatMoney(totalMinor / 100, currencyCode)}
          </p>
          <p className="mt-1 text-muted-foreground">
            {selectedVariant
              ? `${safeQuantity} x ${selectedVariant.name}`
              : "Choose an available unit"}
          </p>
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="font-medium text-sm">Customer account</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 border border-border p-4 text-sm">
            <input
              className="mt-1"
              checked={customerAuthMode === "register"}
              data-testid="shared-product-register-radio"
              name="customerAuthMode"
              onChange={() => setCustomerAuthMode("register")}
              type="radio"
              value="register"
            />
            <span>
              <span className="block font-medium">I am new</span>
              <span className="text-muted-foreground">
                Create my customer account for faster future orders.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 border border-border p-4 text-sm">
            <input
              className="mt-1"
              checked={customerAuthMode === "login"}
              data-testid="shared-product-login-radio"
              name="customerAuthMode"
              onChange={() => setCustomerAuthMode("login")}
              type="radio"
              value="login"
            />
            <span>
              <span className="block font-medium">I already registered</span>
              <span className="text-muted-foreground">
                Use my email and password for this order request.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Name</span>
          <input
            autoComplete="name"
            className="border border-border bg-background px-3 py-3"
            data-testid="shared-product-customer-name"
            name="customerName"
            placeholder={
              customerAuthMode === "register"
                ? "Enter your name"
                : "Enter your name if different"
            }
            required={customerAuthMode === "register"}
            type="text"
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Email</span>
          <input
            autoComplete="email"
            className="border border-border bg-background px-3 py-3"
            data-testid="shared-product-customer-email"
            name="customerEmail"
            placeholder="Enter your email address"
            required
            type="email"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Password</span>
          <input
            autoComplete={
              customerAuthMode === "register"
                ? "new-password"
                : "current-password"
            }
            className="border border-border bg-background px-3 py-3"
            data-testid="shared-product-customer-password"
            minLength={8}
            name="customerPassword"
            placeholder={
              customerAuthMode === "register"
                ? "Create a password"
                : "Enter your password"
            }
            required
            type="password"
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="font-medium">Phone</span>
          <input
            autoComplete="tel"
            className="border border-border bg-background px-3 py-3"
            data-testid="shared-product-customer-phone"
            name="customerPhone"
            placeholder="Enter your phone number"
            type="tel"
          />
        </label>
      </div>

      <label className="grid gap-2 text-sm">
        <span className="font-medium">Note</span>
        <textarea
          className="min-h-24 border border-border bg-background px-3 py-3"
          data-testid="shared-product-notes"
          name="notes"
          placeholder="Add pickup or order notes"
        />
      </label>

      <button
        className="w-full bg-foreground px-5 py-3 font-medium text-background"
        data-testid="shared-product-submit"
        disabled={!hasAvailableVariant}
        type="submit"
      >
        {hasAvailableVariant ? "Submit order request" : "Currently unavailable"}
      </button>
    </form>
  )
}
