import {
  getLaunchDefaultPlanName,
  getPaidLaunchPlanNames,
  getPricingPlans,
} from "@/lib/pricing-plans"
import type { ReactNode } from "react"
import "./pricing.css"

export type PricingProps = {
  signupEnabled: boolean
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="shop-eyebrow">
      <span aria-hidden="true" />
      {children}
    </p>
  )
}

export function Pricing({ signupEnabled }: PricingProps) {
  const plans = getPricingPlans(signupEnabled)
  const paidNames = getPaidLaunchPlanNames()
  return (
    <section
      className="shop-pricing shop-wrap"
      id="pricing"
      aria-labelledby="pricing-title"
    >
      <div className="shop-section-heading">
        <Eyebrow>Plans</Eyebrow>
        <h2 id="pricing-title">
          Start free.
          <br />
          <em>Grow when you’re ready.</em>
        </h2>
        <p>
          Choose the plan that fits how you trade today. Move up when your
          business does.
        </p>
      </div>
      <ul className="shop-pricing-grid">
        {plans.map((plan) => (
          <li
            key={plan.id}
            className="shop-plan"
            data-popular={plan.popular || undefined}
            aria-labelledby={`plan-${plan.id}`}
          >
            <div className="shop-plan-head">
              <h3 id={`plan-${plan.id}`}>{plan.name}</h3>
              {plan.popular ? (
                <span className="shop-plan-badge">Most popular</span>
              ) : null}
            </div>
            <p className="shop-plan-price">{plan.priceLabel}</p>
            <p className="shop-plan-description">{plan.description}</p>
            <ul className="shop-plan-limits" aria-label={`${plan.name} limits`}>
              {plan.limits.map((limit) => (
                <li key={limit.key}>
                  <span aria-hidden="true">✓</span>
                  {limit.label}
                </li>
              ))}
            </ul>
            {plan.notIncluded.length ? (
              <div className="shop-plan-missing">
                <p>Not included</p>
                <ul>
                  {plan.notIncluded.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <a
              className={
                plan.cta.kind === "signup"
                  ? "shop-button shop-plan-cta"
                  : "shop-plan-cta shop-plan-cta-outline"
              }
              href={plan.cta.href}
            >
              {plan.cta.label} <span aria-hidden="true">↗</span>
            </a>
          </li>
        ))}
      </ul>
      <div className="shop-pricing-note">
        <p>
          {paidNames} are free during launch. We’ll announce pricing before
          billing starts — nothing is charged automatically.
        </p>
        <p>
          New businesses start on {getLaunchDefaultPlanName()} during launch.
        </p>
      </div>
    </section>
  )
}
