import { marketingAttrs } from "@/lib/marketing-interactions"
import { icons } from "@ewatrade/onboarding/components/product-preview/screens"
const features = [
  [
    "catalog",
    "Catalog and storefront",
    "Products and services in one catalog, with prices and units. Share a public storefront so customers can see what you sell.",
    "Free storefront shows up to 10 items",
  ],
  [
    "orders",
    "Sales and orders",
    "Payment and fulfilment are tracked separately, so a paid order never looks finished. A simple sale records money received with a description.",
    "Paid · Preparing",
  ],
  [
    "box",
    "Inventory",
    "Count by the crate, the bag or the piece. Orders move stock, and low stock shows before you run out.",
    "Low stock · Exact units",
  ],
  [
    "users",
    "Customer balances",
    "Who owes you, how much and since when, in one customer book.",
    "Customer balances",
  ],
  [
    "wallet",
    "Finance, expenses and suppliers",
    "Record expenses, keep your suppliers, send invoices and close the day against the cash you counted.",
    "Starter and up",
  ],
  [
    "lock",
    "Team permissions",
    "Give each person a role. Sales reps can be set to ‘Only their own sales’, and you still see every naira.",
    "Starter and up",
  ],
  [
    "chat",
    "Assistant and WhatsApp",
    "Ask in the app or on WhatsApp. Answers stay in the chat; changes come back to you to review and confirm.",
    "",
  ],
  [
    "cloudoff",
    "Mobile app, offline sales",
    "Sell at the counter. When the signal drops, sales save on the phone and sync when it’s back.",
    "Offline works for recording sales",
  ],
]
export function Features() {
  return (
    <section className="gg-sec" id="features" aria-labelledby="feat-h">
      <div className="gg-wrap">
        <div className="gg-split-head">
          <h2 className="gg-h2" id="feat-h">
            Everything the business runs on. In one place.
          </h2>
          <p className="gg-lead">
            Catalog, orders, stock, customers and money, with your team and your
            assistant beside you. The same numbers on the web, the phone and in
            the chat.
          </p>
        </div>
        <ul className="w-feats">
          {features.map(([icon, title, copy, note]) => (
            <li
              className={`w-feat${icon === "chat" ? " w-feat--ai" : ""}`}
              key={title}
            >
              <i>{icons[icon ?? ""] ?? icons.check}</i>
              <h3>{title}</h3>
              <p>{copy}</p>
              {icon === "chat" ? (
                <a
                  className="w-feat-link"
                  href="#assistant"
                  {...marketingAttrs("navigation", "features", "assistant")}
                >
                  See the chats
                </a>
              ) : (
                <small>{note}</small>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
