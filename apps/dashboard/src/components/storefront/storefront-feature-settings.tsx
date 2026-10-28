"use client"

import type { StorefrontFeatureConfig } from "@ewatrade/storefront-contracts/features"
import { Button, Checkbox, Switch } from "@ewatrade/ui"
import { useId } from "react"

export function StorefrontFeatureSettings({
  legacy,
  config,
  disabled,
  onUpgrade,
  onChange,
}: {
  legacy: boolean
  config: StorefrontFeatureConfig | null
  disabled: boolean
  onUpgrade: () => void
  onChange: (config: StorefrontFeatureConfig) => void
}) {
  const id = useId()
  if (!config)
    return (
      <p role="alert">
        These feature settings are unavailable. Reload the draft.
      </p>
    )
  const update = (change: (next: StorefrontFeatureConfig) => void) => {
    const next = structuredClone(config)
    change(next)
    onChange(next)
  }
  return (
    <section className="sf-feature-settings">
      <header>
        <small>Storefront</small>
        <h1>Features</h1>
        <p>One set of customer features, styled to match your template.</p>
      </header>
      {legacy ? (
        <div className="sf-feature-settings-notice">
          <h2>Use shared feature settings</h2>
          <p>
            Move this draft's current settings here. Your live site stays the
            same until you save and publish.
          </p>
          <Button disabled={disabled} onClick={onUpgrade}>
            Use shared settings
          </Button>
        </div>
      ) : null}
      <fieldset disabled={disabled || legacy}>
        <div className="sf-feature-settings-row">
          <div>
            <label htmlFor={`${id}-login`}>Customer login</label>
            <p>Let customers sign in and find their request history.</p>
          </div>
          <Switch
            disabled={disabled || legacy}
            id={`${id}-login`}
            checked={config.accounts.enabled}
            onCheckedChange={(enabled) =>
              update((next) => {
                next.accounts.enabled = enabled
              })
            }
          />
        </div>
        <div className="sf-feature-settings-row">
          <div>
            <label htmlFor={`${id}-orders`}>Product order requests</label>
            <p>
              Let customers send a bag for your review. Requests do not confirm
              payment or stock.
            </p>
          </div>
          <Switch
            disabled={disabled || legacy}
            id={`${id}-orders`}
            checked={config.orders.enabled}
            onCheckedChange={(enabled) =>
              update((next) => {
                next.orders.enabled = enabled
                if (enabled && !next.orders.fulfilment.length)
                  next.orders.fulfilment = ["pickup"]
              })
            }
          />
        </div>
        <div className="sf-feature-settings-fulfilment">
          <h2>Fulfilment</h2>
          <p>Choose how customers can request their items.</p>
          {(["pickup", "delivery"] as const).map((method) => (
            <label key={method} htmlFor={`${id}-${method}`}>
              <Checkbox
                id={`${id}-${method}`}
                checked={config.orders.fulfilment.includes(method)}
                disabled={
                  disabled ||
                  legacy ||
                  (config.orders.enabled &&
                    config.orders.fulfilment.length === 1 &&
                    config.orders.fulfilment.includes(method))
                }
                onCheckedChange={(checked) =>
                  update((next) => {
                    next.orders.fulfilment = next.orders.fulfilment.filter(
                      (entry) => entry !== method,
                    )
                    if (checked) next.orders.fulfilment.push(method)
                  })
                }
              />
              {method === "pickup" ? "Pickup" : "Delivery"}
            </label>
          ))}
        </div>
        <div className="sf-feature-settings-row">
          <div>
            <label htmlFor={`${id}-stock`}>Show low-stock counts</label>
            <p>Share exact available quantities when stock is low.</p>
          </div>
          <Switch
            disabled={disabled || legacy}
            id={`${id}-stock`}
            checked={config.catalog.showLowStockCounts}
            onCheckedChange={(enabled) =>
              update((next) => {
                next.catalog.showLowStockCounts = enabled
              })
            }
          />
        </div>
      </fieldset>
      <aside className="sf-feature-settings-notice">
        Existing receipt links and valid customer history stay available when
        you turn off new requests or login. Availability also depends on your
        Store's current plan, catalog and contact channels.
      </aside>
      <p>
        Save draft to keep changes. Publishing uses the existing review and
        consent step.
      </p>
    </section>
  )
}
