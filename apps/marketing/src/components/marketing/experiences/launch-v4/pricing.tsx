import { marketingAttrs } from "@/lib/marketing-interactions"
import { MARKETING_OFFERS, getMarketingPlanCta } from "@/lib/marketing-offers"
import { icons } from "@ewatrade/onboarding/components/product-preview/screens"
const count = (n: number) => n.toLocaleString("en-NG")
export function LaunchPricing({ signupEnabled }: { signupEnabled: boolean }) {
  return (
    <section className="gg-sec" id="pricing" aria-labelledby="price-h">
      <div className="gg-wrap">
        <div className="gg-sec-head">
          <h2 className="gg-h2" id="price-h">
            Start free. Grow when you’re ready.
          </h2>
          <p className="gg-lead">
            Free stays free forever. Paid plans are monthly. Every plan includes
            your assistant, in the app and on WhatsApp.
          </p>
        </div>
        <div className="gg-plans">
          {MARKETING_OFFERS.map((plan, index) => {
            const cta = getMarketingPlanCta(plan.id, signupEnabled)
            return (
              <article
                className={`gg-plan w-plan${plan.id === "growth" ? " gg-plan--hi" : ""}`}
                key={plan.id}
                aria-labelledby={`plan-${plan.id}`}
              >
                <div className="gg-plan-top">
                  <h3 id={`plan-${plan.id}`}>{plan.name}</h3>
                  {plan.id === "growth" && (
                    <span className="gg-tag">Recommended</span>
                  )}
                </div>
                <p className="gg-plan-price w-price">
                  ₦{count(plan.price)}{" "}
                  <small>{plan.price === 0 ? "forever" : "a month"}</small>
                </p>
                <p className="gg-plan-note">{plan.description}</p>
                <ul>
                  {[
                    count(plan.businesses) +
                      (plan.businesses === 1 ? " business" : " businesses"),
                    plan.items === null
                      ? "Unlimited catalog items"
                      : `${count(plan.items)} catalog items`,
                    plan.orders === null
                      ? "Unlimited orders"
                      : `${count(plan.orders)} orders a month`,
                    plan.staff === 0
                      ? "Just you"
                      : `You + ${count(plan.staff)} staff`,
                  ].map((label) => (
                    <li key={label}>
                      {icons.check}
                      <span>{label}</span>
                    </li>
                  ))}
                </ul>
                <div className="w-plan-ai">
                  <span aria-hidden="true">{icons.chat ?? icons.check}</span>
                  <span>
                    <b>Assistant in the app and on WhatsApp</b>
                    <small>Included monthly AI allowance</small>
                  </span>
                </div>
                <p className="w-plan-lead">
                  {index === 0
                    ? "Includes"
                    : `Everything in ${MARKETING_OFFERS[index - 1]?.name}, plus`}
                </p>
                <ul>
                  {plan.included.map((label) => (
                    <li key={label}>
                      {icons.check}
                      <span>{label}</span>
                    </li>
                  ))}
                </ul>
                <a
                  className={`gg-btn ${plan.id === "growth" ? "gg-btn--gold" : "gg-btn--line"}`}
                  href={cta.href}
                  {...marketingAttrs(cta.kind, "pricing", plan.id)}
                >
                  {cta.label}
                </a>
              </article>
            )
          })}
        </div>
        <div className="w-pai">
          <div className="w-pai-a">
            <span className="w-pai-ic" aria-hidden="true">
              {icons.chat ?? icons.check}
            </span>
            <div>
              <h3>Your assistant, on every plan</h3>
              <p>
                Ask in the app or on WhatsApp. Both share your plan’s included
                monthly AI allowance. When you reach it, everything else in
                ẸwáTrade keeps working.
              </p>
            </div>
          </div>
          <div>
            <span className="w-pai-ic" aria-hidden="true">
              {icons.users ?? icons.check}
            </span>
            <div>
              <h3>Customer messages · Growth and Pro</h3>
              <p>
                Sending messages to your customers is a different feature. Your
                assistant only talks to you about your business.
              </p>
            </div>
          </div>
        </div>
        <p className="gg-honest">
          Talk to us to activate a paid plan. No payment is taken from this
          page.
        </p>
        <details className="launch-compare w-compare">
          <summary {...marketingAttrs("compare", "pricing")}>
            Compare all features
          </summary>
          <section className="launch-table-scroll" aria-label="Plan comparison">
            <table>
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  {MARKETING_OFFERS.map((p) => (
                    <th scope="col" key={p.id}>
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    "Monthly price",
                    ...MARKETING_OFFERS.map((p) => `₦${count(p.price)}`),
                  ],
                  [
                    "Catalog items",
                    ...MARKETING_OFFERS.map((p) =>
                      p.items === null ? "Unlimited" : count(p.items),
                    ),
                  ],
                  [
                    "Orders per month",
                    ...MARKETING_OFFERS.map((p) =>
                      p.orders === null ? "Unlimited" : count(p.orders),
                    ),
                  ],
                  [
                    "Businesses",
                    ...MARKETING_OFFERS.map((p) => count(p.businesses)),
                  ],
                  [
                    "Staff",
                    ...MARKETING_OFFERS.map((p) =>
                      p.staff === 0 ? "Owner only" : `Owner + ${p.staff}`,
                    ),
                  ],
                  [
                    "Assistant in app and WhatsApp",
                    "Included",
                    "Included",
                    "Included",
                    "Included",
                  ],
                  [
                    "Monthly AI allowance",
                    "Included",
                    "Included",
                    "Included",
                    "Included",
                  ],
                  [
                    "Invoices, finance, expenses and suppliers",
                    "—",
                    "Included",
                    "Included",
                    "Included",
                  ],
                  [
                    "Team permissions and reports",
                    "—",
                    "Included",
                    "Included",
                    "Included",
                  ],
                  ["Customer messages", "—", "—", "Included", "Included"],
                  ["Offline sales devices", "1", "1", "5", "20"],
                ].map(([label, ...values]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    {values.map((value, index) => (
                      <td key={MARKETING_OFFERS[index]?.id}>{value}</td>
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
