import { getDashboardLoginUrl } from "@/lib/auth-navigation"
import {
  type MarketingCategory,
  marketingAttrs,
} from "@/lib/marketing-interactions"
import { ProductPreview } from "@ewatrade/onboarding/components/product-preview/product-preview"
import { WebSignupCta, WhatsAppCta } from "./cta"
export function Availability({ signupEnabled }: { signupEnabled: boolean }) {
  return (
    <section className="gg-sec" id="apps" aria-labelledby="dash-h">
      <div className="gg-wrap">
        <div className="gg-split-head">
          <h2 className="gg-h2" id="dash-h">
            The web for the back office. The phone for the counter. The chat for
            everywhere else.
          </h2>
          <p className="gg-lead">
            One business and one set of numbers, whichever screen is in your
            hand.
          </p>
        </div>
        <div className="b-avail w-avail">
          <article className="b-av b-av--web">
            <h3>Web dashboard</h3>
            <p>
              Sell, count stock, chase what’s owed and close the day. Reports,
              finance and staff on a bigger screen.
            </p>
            <ul className="b-av-list">
              <li>In any browser, on a computer or a phone</li>
              <li>Nothing to install, nothing to update</li>
              <li>Staff with roles, reps on “Only their own sales”</li>
            </ul>
            <WebSignupCta
              signupEnabled={signupEnabled}
              channel="availability"
            />
          </article>
          <article className="b-av b-av--app w-av-app">
            <div className="b-av-copy">
              <h3>Mobile app</h3>
              <p>
                Made for the counter. Sales save on the phone when there’s no
                signal and sync when it’s back. Same business, same numbers as
                the web.
              </p>
            </div>
            <div className="b-av-phone">
              <ProductPreview
                platform="mobile"
                view="offline"
                label="Offline sales waiting to sync, sample data"
              />
            </div>
          </article>
          <article className="b-av w-av-wa">
            <h3>WhatsApp assistant</h3>
            <p>
              Ask from the farm gate, the market or the bus. Answers come
              straight back; changes open a secure review in ẸwáTrade.
            </p>
            <div className="w-mini">
              <span className="is-me">How are sales today?</span>
              <span>₦184,500 from 23 orders.</span>
              <span className="is-me">Add smoked catfish to my catalog.</span>
              <span>
                What’s the selling price, and do you sell by the piece or pack?
              </span>
            </div>
            <a
              className="w-av-link"
              href="#assistant"
              {...marketingAttrs("navigation", "availability", "assistant")}
            >
              See the chats
            </a>
          </article>
        </div>
      </div>
    </section>
  )
}
const faqs: {
  question: string
  answer: string
  category: MarketingCategory
}[] = [
  {
    question: "What’s included on the Free plan?",
    answer:
      "One business, 10 catalog items and 50 orders a month, for one owner. The in-app assistant and merchant WhatsApp assistant are included, with a shared monthly AI allowance.",
    category: "free",
  },
  {
    question: "How does the monthly AI allowance work?",
    answer:
      "Every plan includes an allowance shared between the assistant in the app and on WhatsApp. When it’s used up, sales, stock, orders and everything else in ẸwáTrade keep working as normal.",
    category: "assistant",
  },
  {
    question: "How do I set up the WhatsApp assistant?",
    answer:
      "Tap Start on WhatsApp and say hello. Your assistant guides setup in the chat. If you already have an account, link your business WhatsApp number from ẸwáTrade. Account checks stay in place, and nothing is saved until you confirm.",
    category: "whatsapp",
  },
  {
    question: "Can the assistant change my records on its own?",
    answer:
      "It prepares a draft. A secure link opens that draft in ẸwáTrade, where you review and explicitly confirm before a change is saved.",
    category: "setup",
  },
  {
    question: "Is the assistant the same as messaging my customers?",
    answer:
      "Your assistant talks to you about your business. Sending messages to your customers is a separate feature on Growth and Pro.",
    category: "general",
  },
  {
    question: "What’s a simple sale?",
    answer:
      "Money you’ve received, with a description, like ‘6 bags of poultry manure’. It counts towards your sales but doesn’t change stock. To sell items from your catalog and move stock, record a normal order.",
    category: "money",
  },
  {
    question: "Can I upgrade, downgrade or cancel?",
    answer:
      "Talk to us about the plan that fits your business. We’ll confirm the terms before a paid plan is activated.",
    category: "pricing",
  },
  {
    question: "Is there a mobile app?",
    answer:
      "Yes. The mobile app brings your sales, stock and customer balances together on your phone. You can also use ẸwáTrade in any browser.",
    category: "mobile",
  },
  {
    question: "Can I sell services as well as products?",
    answer:
      "Yes. Products and services live in one catalog, so a laundry can sell ‘Shirt wash and iron’ and a bottle of starch in the same sale.",
    category: "product",
  },
  {
    question: "What’s the difference between paid and delivered?",
    answer:
      "They’re tracked separately. An order can be paid and still preparing, or delivered and still owing, so you always know what’s left to do and what’s left to collect.",
    category: "sales",
  },
  {
    question: "Does it work without internet?",
    answer:
      "The web dashboard and assistant need a connection. In the mobile app, sales save on the phone, show ‘Waiting to sync’ and sync when you’re back online. Offline works for recording sales.",
    category: "web",
  },
  {
    question: "Can my staff and sales reps use it?",
    answer:
      "Yes, on Starter, Growth and Pro. Add staff and give each one a role. Sales reps set to ‘Only their own sales’ see the orders they made.",
    category: "starter",
  },
]
export function Faq() {
  return (
    <section className="gg-sec" id="faq" aria-labelledby="faq-h">
      <div className="gg-wrap gg-faq">
        <div>
          <h2 className="gg-h2" id="faq-h">
            Questions, answered.
          </h2>
          <p className="gg-lead">
            Plans, the assistant, and how everyday selling works.
          </p>
        </div>
        <div className="gg-qs">
          {faqs.map((f) => (
            <details className="gg-qa" key={f.question}>
              <summary {...marketingAttrs("faq", "faq", f.category)}>
                {f.question}
                <i>+</i>
              </summary>
              <p>{f.answer}</p>
            </details>
          ))}
          <details className="gg-qa">
            <summary {...marketingAttrs("faq", "faq", "delete_account")}>
              How do I delete my account?<i>+</i>
            </summary>
            <p>
              See{" "}
              <a
                href="/delete-account"
                {...marketingAttrs("navigation", "faq", "delete_account")}
              >
                account deletion
              </a>{" "}
              for the steps to request deletion of your account and business
              data.
            </p>
          </details>
        </div>
      </div>
    </section>
  )
}
const footerGroups: {
  title: string
  links: [string, string, MarketingCategory][]
}[] = [
  {
    title: "Product",
    links: [
      ["Assistant", "#assistant", "assistant"],
      ["Features", "#features", "features"],
      ["Businesses", "#businesses", "businesses"],
      ["A day in the business", "#product", "product_day"],
      ["Pricing", "#pricing", "pricing"],
    ],
  },
  {
    title: "Company",
    links: [
      ["Contact", "/contact", "contact"],
      ["Support", "/support", "support"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Terms", "/terms", "terms"],
      ["Privacy", "/privacy", "privacy"],
      ["Billing policy", "/billing-policy", "billing_policy"],
      ["Delete account", "/delete-account", "delete_account"],
    ],
  },
]
export function Closing({ signupEnabled }: { signupEnabled: boolean }) {
  return (
    <>
      <section className="gg-final" aria-labelledby="final-h">
        <img
          className="gg-wm"
          src="/brand/ewatrade-mark-precision-rise-v1-reverse.svg"
          alt=""
        />
        <div className="gg-wrap">
          <h2 id="final-h">Your business. Your next chapter.</h2>
          <p>
            Start in WhatsApp and let your assistant guide setup, or create your
            store in any browser. The Free plan is yours to keep.
          </p>
          <div className="gg-ctas">
            <WebSignupCta signupEnabled={signupEnabled} channel="closing" />
            <WhatsAppCta channel="closing" />
            <a
              className="gg-textlink"
              href={getDashboardLoginUrl()}
              {...marketingAttrs("login", "closing")}
            >
              Sign in
            </a>
          </div>
          <p className="w-final-note">
            Account checks stay in place, and every change still comes back to
            you to review and confirm.
          </p>
        </div>
      </section>
      <footer className="gg-footer">
        <div className="gg-wrap">
          <div className="gg-foot-grid">
            <div className="gg-foot-brand">
              <img
                className="ew-logo"
                src="/brand/ewatrade-logo-precision-rise-v1-reverse.svg"
                alt="ẸwáTrade"
                width={141}
                height={30}
              />
              <p>Come. Trade. Together.</p>
            </div>
            {footerGroups.map((group) => (
              <nav key={group.title} aria-label={group.title}>
                <h3>{group.title}</h3>
                <ul>
                  {group.links.map(([label, href, category]) => (
                    <li key={href}>
                      <a
                        href={href}
                        {...marketingAttrs(
                          category === "contact" ? "contact" : "navigation",
                          "footer",
                          category,
                        )}
                      >
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <p className="gg-foot-base">
            © 2026 EwaTrade. Sample businesses, figures and conversations on
            this page are illustrations.
          </p>
        </div>
      </footer>
    </>
  )
}
