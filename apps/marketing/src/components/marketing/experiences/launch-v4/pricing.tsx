import {
  PLAN_FEATURE_LABELS,
  getLaunchDefaultPlanName,
  getPaidLaunchPlanNames,
  getPricingPlans,
} from "@/lib/pricing-plans"
import { RETAIL_OPS_SUBSCRIPTION_PLANS } from "@ewatrade/db/subscription-plans"
import { icons } from "@ewatrade/onboarding/components/product-preview/screens"
export function LaunchPricing({ signupEnabled }: { signupEnabled: boolean }) {
  const plans = getPricingPlans(signupEnabled)
  return (
    <section className="gg-sec" id="pricing" aria-labelledby="price-h">
      <div className="gg-wrap">
        <div className="gg-sec-head">
          <h2 className="gg-h2" id="price-h">
            Start free. Grow when you’re ready.
          </h2>
          <p className="gg-lead">
            Free stays free forever. {getPaidLaunchPlanNames()} are free during
            launch. We’ll tell you before launch pricing ends.
          </p>
        </div>
        <div className="gg-plans">
          {plans.map((plan) => (
            <article
              className={`gg-plan${plan.popular ? " gg-plan--hi" : ""}`}
              key={plan.id}
              aria-labelledby={`plan-${plan.id}`}
            >
              <div className="gg-plan-top">
                <h3 id={`plan-${plan.id}`}>{plan.name}</h3>
                {plan.popular && <span className="gg-tag">Recommended</span>}
              </div>
              <p className="gg-plan-price">{plan.priceLabel}</p>
              <p className="gg-plan-note">{plan.description}</p>
              <ul>
                {plan.limits.map((limit) => (
                  <li key={limit.key}>
                    {icons.check}
                    <span>{limit.label}</span>
                  </li>
                ))}
              </ul>
              <p className="gg-plan-miss">
                {plan.notIncluded.length
                  ? `Not included: ${plan.notIncluded.join(", ")}.`
                  : "Includes invoices, finance, staff, suppliers and advanced reports."}
              </p>
              <a
                className={`gg-btn ${plan.popular ? "gg-btn--gold" : "gg-btn--line"}`}
                href={plan.cta.href}
              >
                {plan.cta.label}
              </a>
            </article>
          ))}
        </div>
        <p className="gg-honest">
          New businesses start on {getLaunchDefaultPlanName()} during launch.
        </p>
        <details className="launch-compare">
          <summary>Compare all features</summary>
          <section
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll the comparison.
            tabIndex={0}
            className="launch-table-scroll"
            aria-label="Plan comparison"
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  {plans.map((p) => (
                    <th key={p.id} scope="col">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {plans[0]?.limits.map((limit) => (
                  <tr key={limit.key}>
                    <th scope="row">
                      {limit.key === "products"
                        ? "Catalogue"
                        : limit.key.charAt(0).toUpperCase() +
                          limit.key.slice(1)}
                    </th>
                    {plans.map((p) => (
                      <td key={p.id}>
                        {p.limits.find((l) => l.key === limit.key)?.label}
                      </td>
                    ))}
                  </tr>
                ))}
                {Object.entries(PLAN_FEATURE_LABELS).map(([key, label]) => (
                  <tr key={key}>
                    <th scope="row">{label}</th>
                    {RETAIL_OPS_SUBSCRIPTION_PLANS.map((p) => (
                      <td key={p.id}>
                        {p.features.some((f) => f === key)
                          ? "Included"
                          : "Not included"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </details>
      </div>
    </section>
  )
}
