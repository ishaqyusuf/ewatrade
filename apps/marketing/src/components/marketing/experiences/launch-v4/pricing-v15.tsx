import { marketingAttrs } from "@/lib/marketing-interactions"
import { MARKETING_OFFERS, getMarketingPlanCta } from "@/lib/marketing-offers"
const count = (n: number) => n.toLocaleString("en-NG")
export function PricingV15({ signupEnabled }: { signupEnabled: boolean }) {
  return (
    <section className="pricing-section wrap" id="pricing">
      <div className="section-head">
        <h2>
          Start with your <br />
          first ten items.
        </h2>
        <p>
          Free stays free. Choose a paid plan when you need more room for your
          business and your team.
        </p>
      </div>
      <div className="plans">
        {MARKETING_OFFERS.map((plan) => {
          const cta = getMarketingPlanCta(plan.id, signupEnabled)
          return (
            <article className="plan" key={plan.id}>
              <h3>{plan.name}</h3>
              <p className="amount">
                ₦{count(plan.price)}
                <span>{plan.price === 0 ? "forever" : "/ month"}</span>
              </p>
              <p className="plan-for">{plan.description}</p>
              <ul>
                <li>
                  {count(plan.businesses)}{" "}
                  {plan.businesses === 1 ? "business" : "businesses"}
                </li>
                <li>
                  {plan.items === null ? "Unlimited" : count(plan.items)}{" "}
                  catalog items
                </li>
                <li>
                  {plan.orders === null ? "Unlimited" : count(plan.orders)}{" "}
                  orders a month
                </li>
                <li>
                  {plan.staff === 0
                    ? "Owner only"
                    : `Owner + ${count(plan.staff)} staff`}
                </li>
              </ul>
              <a
                className={`button ${plan.id === "free" ? "primary" : "secondary"}`}
                href={cta.href}
                {...marketingAttrs(cta.kind, "pricing", plan.id)}
              >
                {cta.label}
              </a>
            </article>
          )
        })}
      </div>
      <p className="pricing-note">
        Every plan includes a monthly assistant allowance. Contact us to
        activate a paid plan. No payment is taken from this page.
      </p>
      <details className="plan-comparison">
        <summary {...marketingAttrs("compare", "pricing")}>
          Compare all features
        </summary>
        <div className="plan-comparison-grid">
          {MARKETING_OFFERS.map((plan, i) => (
            <article key={plan.id}>
              <h3>{plan.name}</h3>
              <p>
                {i > 0
                  ? `Everything in ${MARKETING_OFFERS[i - 1]?.name}, plus:`
                  : "Includes:"}
              </p>
              <ul>
                {plan.included.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </details>
    </section>
  )
}
