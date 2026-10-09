"use client"

import { getDashboardSignupUrl } from "@ewatrade/onboarding/lib/signup-navigation"

import { getDashboardLoginUrl } from "@/lib/auth-navigation"
import { useEffect, useRef, useState } from "react"
import type { MarketingExperienceProps } from "../marketing-experience-contract"
import { Pricing } from "../sections/pricing"
import { StoreInAMinute } from "../sections/store-in-a-minute"
import "./shop-v3.css"

// Signup is direct (early access and the waitlist were retired on
// 7 October 2026). While signup is switched off, CTAs point to contact.
function primaryCta(signupEnabled: boolean) {
  return signupEnabled
    ? { href: getDashboardSignupUrl(), label: "Create your store" }
    : { href: "/contact", label: "Talk to us" }
}

type Product = {
  name: string
  detail: string
  kind: "Product" | "Service"
  price: number
  art: "basket" | "mug" | "service"
}
const products: Product[] = [
  {
    name: "Woven basket",
    detail: "Natural · Medium",
    kind: "Product",
    price: 12500,
    art: "basket",
  },
  {
    name: "Ceramic mug",
    detail: "Sage · 350 ml",
    kind: "Product",
    price: 8000,
    art: "mug",
  },
  {
    name: "Gift preparation",
    detail: "Wrap & finish",
    kind: "Service",
    price: 2500,
    art: "service",
  },
]
const money = (value: number) => `₦${value.toLocaleString("en-NG")}`
const chapters = [
  {
    label: "01 / THE CATALOGUE",
    title: "Start with what you sell.",
    body: "Bring products and service offers into one catalogue. Keep the price, options and store availability clear before an order begins.",
    proof: "Products and services, clearly identified",
  },
  {
    label: "02 / THE ORDER",
    title: "Keep every detail connected.",
    body: "Bring the customer, agreed items and prices into the order. Keep a clear commercial record that your team can refer back to.",
    proof: "Customer, items and agreed prices together",
  },
  {
    label: "03 / THE NEXT STEP",
    title: "Know what’s paid. And what’s next.",
    body: "A recorded payment doesn’t mean an order is delivered. Track fulfilment and service work separately, with a clear next action for the team.",
    proof: "Payment and fulfilment remain distinct",
  },
]
const questions = [
  [
    "Can I sell products and services?",
    "Yes. Products and services share the catalogue and commercial order experience, while retaining their differences. Product stock and service work are tracked as separate operational concerns.",
  ],
  [
    "Does “paid” mean the order is delivered?",
    "No. Payment and fulfilment are separate states. An order can be paid while it is still being prepared. Service completion is also tracked separately from payment.",
  ],
  [
    "Can different stores work together?",
    "EwaTrade supports store-specific availability, teams and operations within a business workspace. Access and responsibilities depend on the user’s role and store context.",
  ],
  [
    "How can I get started?",
    "Create your store, tell the setup assistant what you sell, and start trading. The Free plan is free forever, and Starter, Growth and Pro are free during launch.",
  ],
]
function Arrow() {
  return <span aria-hidden="true">↗</span>
}
function Brand() {
  return (
    <img
      className="shop-brand"
      src="/brand/ewatrade-logo-precision-rise-v1.svg"
      alt="ẸwáTrade"
      width="548"
      height="120"
    />
  )
}
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="shop-eyebrow">
      <span aria-hidden="true" />
      {children}
    </p>
  )
}
function Art({ kind }: { kind: Product["art"] }) {
  if (kind === "service")
    return (
      <div className="shop-service-art" aria-hidden="true">
        <span>✳</span>
        <em>
          Made a little
          <br />
          more personal.
        </em>
      </div>
    )
  return kind === "basket" ? (
    <svg
      className="shop-art"
      viewBox="0 0 200 195"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="100" cy="171" rx="63" ry="9" fill="#725336" opacity=".12" />
      <path
        d="M36 60h128l-15 106c-22 12-77 12-98 0Z"
        fill="#d2ad72"
        stroke="#b18a54"
        strokeWidth="2"
      />
      <path d="M36 60h128l-4 11H40Z" fill="#e4c38d" />
      <path d="M70 62V44c0-41 60-41 60 0v18" stroke="#9f7544" strokeWidth="8" />
      <path d="M70 62V44c0-37 56-37 56 0v18" stroke="#e5c48f" strokeWidth="3" />
      <path
        d="M40 79h120M42 91h116M44 103h112M45 115h109M47 127h105M49 139h101M51 151h97M53 162h94M50 72l14 96M66 72l9 100M83 72l4 102M100 72v104M117 72l-4 102M134 72l-9 100M150 72l-14 97"
        stroke="#987445"
        strokeWidth="1"
        opacity=".65"
      />
      <path d="M55 82h4l10 69h-4Z" fill="#f4d9aa" opacity=".7" />
    </svg>
  ) : (
    <svg
      className="shop-art"
      viewBox="0 0 200 195"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="94" cy="171" rx="58" ry="9" fill="#4b6252" opacity=".12" />
      <path d="M133 70c55-5 52 62 1 58" stroke="#a4b7a3" strokeWidth="14" />
      <path d="M138 77c33 0 30 42-2 43" stroke="#d4dfc9" strokeWidth="4" />
      <path d="M49 52h88l8 99c1 28-105 28-104 0Z" fill="#becdb4" />
      <ellipse cx="93" cy="53" rx="44" ry="13" fill="#92a88b" />
      <ellipse cx="93" cy="52" rx="36" ry="8" fill="#61795a" />
      <path
        d="M62 75 57 147"
        stroke="#e2e9d9"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path d="M73 150c19 6 36 7 53-1" stroke="#97ae8b" strokeWidth="2" />
    </svg>
  )
}
function Receipt({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={compact ? "shop-receipt shop-receipt-compact" : "shop-receipt"}
    >
      <div className="shop-receipt-head">
        <span>ASTER &amp; ROW</span>
        <span>IKEJA / LAGOS</span>
      </div>
      <h3>
        An order.
        <br />
        All the details.
      </h3>
      <div className="shop-receipt-meta">
        <span>#1048</span>
        <span>Amara Okeke</span>
      </div>
      <div className="shop-receipt-line">
        <span>Woven basket × 1</span>
        <b>₦12,500</b>
      </div>
      <div className="shop-receipt-line">
        <span>Ceramic mug × 1</span>
        <b>₦8,000</b>
      </div>
      <div className="shop-receipt-total">
        <span>Total</span>
        <b>₦20,500</b>
      </div>
      <div className="shop-receipt-states">
        <span>
          Payment<b>Paid</b>
        </span>
        <span>
          Fulfilment<b>Preparing</b>
        </span>
      </div>
      <div className="shop-barcode" aria-hidden="true" />
      <p>Sample order · Two separate states</p>
    </div>
  )
}
function Header({ signupEnabled }: MarketingExperienceProps) {
  const [open, setOpen] = useState(false)
  return (
    <header className="shop-header shop-wrap">
      <a href="/" aria-label="EwaTrade home">
        <Brand />
      </a>
      <nav
        aria-label="Main navigation"
        id="shop-nav"
        className={open ? "is-open" : ""}
      >
        <a href="#story">How it connects</a>
        <a href="#explore">Explore the product</a>
        <a href="#pricing">Pricing</a>
        <a href="#questions">Questions</a>
        <a href="/contact">Contact</a>
        <a className="shop-mobile-cta" href={primaryCta(signupEnabled).href}>
          {primaryCta(signupEnabled).label} <Arrow />
        </a>
      </nav>
      <div className="shop-header-actions">
        <a className="shop-sign-in" href={getDashboardLoginUrl()}>
          Sign in
        </a>
        <a className="shop-header-cta" href={primaryCta(signupEnabled).href}>
          {primaryCta(signupEnabled).label} <Arrow />
        </a>
        <button
          type="button"
          className="shop-menu"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-controls="shop-nav"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "×" : "☰"}
        </button>
      </div>
    </header>
  )
}
function Hero({ signupEnabled }: MarketingExperienceProps) {
  const [stage, setStage] = useState(2)
  const [paused, setPaused] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [run, setRun] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => {
      setReduced(media.matches)
      if (media.matches) setStage(2)
    }
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])
  useEffect(() => {
    if (reduced || paused) return
    if (run === 0) {
      setStage(0)
      setRun(1)
      return
    }
    if (stage < 2) timer.current = setTimeout(() => setStage(stage + 1), 1800)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [stage, paused, reduced, run])
  const caption = [
    "A product, ready to sell.",
    "Products become order lines.",
    "Payment and fulfilment stay separate.",
  ][stage]
  return (
    <>
      <section className="shop-hero shop-wrap">
        <div className="shop-hero-copy">
          <Eyebrow>For the business you’re building</Eyebrow>
          <h1>
            Come. Trade.
            <br />
            <em>Together.</em>
          </h1>
          <p>
            The products you sell. The orders you take. The work that follows.
            One connected place to keep your business moving.
          </p>
          <div className="shop-hero-actions">
            <a className="shop-button" href={primaryCta(signupEnabled).href}>
              {primaryCta(signupEnabled).label} <Arrow />
            </a>
            <a href="#story">
              See how it connects <Arrow />
            </a>
          </div>
          <small>For retail, service and growing teams</small>
          <div className="shop-hero-foot">
            <span>FROM FIRST REQUEST</span>
            <span>TO A CLEAR NEXT STEP ↗</span>
          </div>
        </div>
        <div className="shop-stage" data-state={stage}>
          <div className="shop-stage-top">
            <span>A LITTLE LOOK INSIDE</span>
            <span>ASTER &amp; ROW</span>
          </div>
          <div className="shop-roundel">
            Goods.
            <br />
            Orders.
            <br />
            And more.
          </div>
          <div className="shop-basket">
            <Art kind="basket" />
            <div className="shop-shelf-label">
              <span>
                Woven basket<small>Natural / Medium</small>
              </span>
              <b>₦12,500</b>
            </div>
          </div>
          <div className="shop-mug">
            <Art kind="mug" />
          </div>
          <div className="shop-catalog-tag">✓&nbsp; In your catalogue</div>
          <div className="shop-order-tag">♧&nbsp; Added to order #1048</div>
          <div className="shop-hero-receipt">
            <Receipt />
          </div>
          <div className="shop-stage-floor" />
          <div className="shop-scene-bottom">
            <span>{caption}</span>
            <div>
              <button
                type="button"
                onClick={() => {
                  setPaused(false)
                  setStage(0)
                  setRun((n) => n + 1)
                }}
                aria-label="Replay opening animation"
              >
                ↻ Replay
              </button>
              <button
                type="button"
                onClick={() => setPaused(!paused)}
                aria-pressed={paused}
              >
                {paused ? "▶ Resume" : "Ⅱ Pause"}
              </button>
            </div>
          </div>
        </div>
      </section>
      <div className="shop-trade-strip shop-wrap">
        <span>ONE WORKSPACE, EVERYDAY CONNECTIONS</span>
        <p>
          Catalogue <i>↗</i> Orders <i>↗</i> Stock <i>↗</i> Service work{" "}
          <i>↗</i> Customers
        </p>
      </div>
    </>
  )
}
function StoryPane({ index }: { index: number }) {
  if (index === 0)
    return (
      <div className="shop-pane shop-catalogue">
        <div className="shop-pane-head">
          <span>YOUR CATALOGUE</span>
          <h3>A place for everything you sell.</h3>
        </div>
        <div className="shop-catalogue-grid">
          {products.map((product) => (
            <div key={product.name}>
              <div className="shop-catalogue-art">
                <Art kind={product.art} />
              </div>
              <small>{product.kind}</small>
              <h4>{product.name}</h4>
              <p>{product.detail}</p>
              <b>{money(product.price)}</b>
            </div>
          ))}
        </div>
        <p className="shop-pane-note">
          Products carry stock information. Services carry work.
        </p>
      </div>
    )
  if (index === 1)
    return (
      <div className="shop-pane shop-order-pane">
        <div className="shop-pane-head">
          <span>COMMERCIAL ORDER / #1048</span>
          <h3>Every detail in one place.</h3>
        </div>
        <div className="shop-order-customer">
          <b>AO</b>
          <span>
            Amara Okeke<small>Aster &amp; Row · Ikeja store</small>
          </span>
          <em>In progress</em>
        </div>
        {products.slice(0, 2).map((product) => (
          <div className="shop-order-item" key={product.name}>
            <div>
              <Art kind={product.art} />
            </div>
            <span>
              {product.name}
              <small>{product.detail} · Qty 1</small>
            </span>
            <b>{money(product.price)}</b>
          </div>
        ))}
        <div className="shop-order-total">
          <span>Order total</span>
          <b>₦20,500</b>
        </div>
        <div className="shop-order-states">
          <span>
            Payment<b>Paid</b>
          </span>
          <span>
            Fulfilment<b>Preparing</b>
          </span>
        </div>
      </div>
    )
  return (
    <div className="shop-pane shop-next-pane">
      <div className="shop-pane-head">
        <span>ORDER #1048 / AMARA OKEKE</span>
        <h3>Two states. A clearer picture.</h3>
      </div>
      <div className="shop-next-states">
        <div>
          <small>PAYMENT</small>
          <b>Paid</b>
          <span>₦20,500 recorded</span>
          <p>Payment record is complete.</p>
        </div>
        <div>
          <small>FULFILMENT</small>
          <b>Preparing</b>
          <span>2 products · Ikeja store</span>
          <p>The order is not yet delivered.</p>
        </div>
      </div>
      <div className="shop-next-task">
        <b>TO</b>
        <span>
          Prepare the order<small>Assigned to Tobi · Next action</small>
        </span>
        <Arrow />
      </div>
      <p className="shop-pane-note">
        Illustrative records · Service work is tracked separately
      </p>
    </div>
  )
}
function Story() {
  const [active, setActive] = useState(0)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting)
            setActive(Number((entry.target as HTMLElement).dataset.chapter))
      },
      { rootMargin: "-35% 0px -45% 0px" },
    )
    for (const node of document.querySelectorAll("[data-chapter]")) {
      observer.observe(node)
    }
    return () => observer.disconnect()
  }, [])
  return (
    <section className="shop-story" id="story">
      <div className="shop-wrap shop-section-heading">
        <Eyebrow>From the shelf to the next step</Eyebrow>
        <h2>
          An order is more
          <br />
          than a sale.
        </h2>
        <p>
          Follow the same business through the catalogue,
          <br />
          the order and the work still to do.
        </p>
      </div>
      <div className="shop-wrap shop-story-grid">
        <div className="shop-story-sticky">
          <div className="shop-story-window">
            <div className="shop-window-bar">
              <Brand />
              <span>
                Aster &amp; Row /{" "}
                {active === 0
                  ? "Catalogue"
                  : active === 1
                    ? "Order #1048"
                    : "Operations"}
              </span>
            </div>
            <StoryPane index={active} />
            <div className="shop-window-footer">
              •&nbsp; Illustrative product view{" "}
              <span>One business. Connected records.</span>
            </div>
          </div>
          <div
            className="shop-chapter-controls"
            aria-label="Choose a story chapter"
          >
            {["Catalogue", "Order", "Next step"].map((label, index) => (
              <button
                type="button"
                key={label}
                aria-pressed={active === index}
                onClick={() => {
                  setActive(index)
                  document
                    .getElementById(`shop-chapter-${index}`)
                    ?.scrollIntoView({
                      behavior: window.matchMedia(
                        "(prefers-reduced-motion: reduce)",
                      ).matches
                        ? "instant"
                        : "smooth",
                      block: "center",
                    })
                }}
              >
                <span>0{index + 1}</span>
                {label}
                <i />
              </button>
            ))}
          </div>
        </div>
        <div className="shop-chapters">
          {chapters.map((chapter, index) => (
            <article
              key={chapter.label}
              data-chapter={index}
              id={`shop-chapter-${index}`}
            >
              <Eyebrow>{chapter.label}</Eyebrow>
              <h2>{chapter.title}</h2>
              <p>{chapter.body}</p>
              <span className="shop-proof">✓&nbsp; {chapter.proof}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
function Explorer() {
  const [selected, setSelected] = useState([0, 1])
  const selectedProducts = selected
    .map((index) => products[index])
    .filter((product): product is Product => Boolean(product))
  const total = selectedProducts.reduce(
    (sum, product) => sum + product.price,
    0,
  )
  return (
    <section className="shop-explorer shop-wrap" id="explore">
      <div className="shop-section-heading">
        <Eyebrow>Room for the way you do business</Eyebrow>
        <h2>
          A basket. A mug.
          <br />
          <em>A little extra service.</em>
        </h2>
        <p>
          Products and services belong in the same catalogue.
          <br />
          Try adding them to this sample order.
        </p>
      </div>
      <div className="shop-demo">
        <div className="shop-products">
          {products.map((product, index) => (
            <article key={product.name} className="shop-product">
              <div className="shop-product-art">
                <Art kind={product.art} />
              </div>
              <small>{product.kind}</small>
              <h3>{product.name}</h3>
              <p>{money(product.price)}</p>
              <button
                type="button"
                aria-pressed={selected.includes(index)}
                onClick={() =>
                  setSelected((items) =>
                    items.includes(index)
                      ? items.filter((item) => item !== index)
                      : [...items, index].sort(),
                  )
                }
              >
                {selected.includes(index) ? "Remove" : "Add to order"}{" "}
                <span aria-hidden="true">
                  {selected.includes(index) ? "✓" : "+"}
                </span>
              </button>
            </article>
          ))}
        </div>
        <div className="shop-cart" aria-live="polite">
          <div className="shop-cart-head">
            <span>BUILD A SAMPLE ORDER</span>
            <b>{String(selected.length).padStart(2, "0")} lines</b>
          </div>
          <div className="shop-cart-lines">
            {selected.length ? (
              selectedProducts.map((product) => (
                <div key={product.name}>
                  <span>
                    {product.name}
                    <small>{product.kind} · Quantity 1</small>
                  </span>
                  <b>{money(product.price)}</b>
                </div>
              ))
            ) : (
              <p>Choose a product or service to start.</p>
            )}
          </div>
          <div className="shop-cart-total">
            <span>Sample total</span>
            <b>{money(total)}</b>
          </div>
          <p>
            Adding a service changes the order total.
            <br />
            It does not create product stock.
          </p>
          <small>Local illustration · No order is placed</small>
        </div>
      </div>
    </section>
  )
}
function BusinessAndFaq() {
  return (
    <>
      <section className="shop-business">
        <div className="shop-wrap">
          <div className="shop-business-heading">
            <Eyebrow>A workspace with room to grow</Eyebrow>
            <h2>
              For the business
              <br />
              you run every day.
            </h2>
            <p>
              Start with the work you need to organise.
              <br />
              Keep the connections as your business grows.
            </p>
          </div>
          <div className="shop-business-list">
            {[
              [
                "♧",
                "Retail businesses",
                "Catalogue, products and orders. Keep the stock and customer context close to the sale.",
              ],
              [
                "✳",
                "Service businesses",
                "Requests, agreed offers and service work. Keep the commercial record distinct from completing the job.",
              ],
              [
                "◎",
                "Multi-store teams",
                "Store-specific availability, staff and work, within one wider view of the business.",
              ],
            ].map(([icon, title, body]) => (
              <article key={title}>
                <span aria-hidden="true">{icon}</span>
                <h3>{title}</h3>
                <p>{body}</p>
                <Arrow />
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="shop-faq shop-wrap" id="questions">
        <div>
          <Eyebrow>A little more clarity</Eyebrow>
          <h2>
            Good questions.
            <br />
            Clear answers.
          </h2>
        </div>
        <div>
          {questions.map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  )
}
function Closing({ signupEnabled }: MarketingExperienceProps) {
  return (
    <section className="shop-closing shop-wrap">
      <Eyebrow>Your next chapter in business</Eyebrow>
      <h2>
        Make room for
        <br />
        <em>good trade.</em>
      </h2>
      <p>A connected place for the work behind every order.</p>
      <a className="shop-button" href={primaryCta(signupEnabled).href}>
        {primaryCta(signupEnabled).label} <Arrow />
      </a>
      <small>Free forever plan · no card needed</small>
      <div className="shop-closing-art">
        <Art kind="basket" />
      </div>
    </section>
  )
}
function Footer() {
  return (
    <footer className="shop-footer shop-wrap">
      <a href="/" aria-label="EwaTrade home">
        <Brand />
      </a>
      <nav aria-label="Footer navigation">
        <a href="#story">How it connects</a>
        <a href="#explore">Explore</a>
        <a href="#pricing">Pricing</a>
        <a href="/contact">Contact</a>
        <a href="/support">Support</a>
      </nav>
      <small>
        © {new Date().getFullYear()} EwaTrade · Illustrative product records
      </small>
    </footer>
  )
}
export function ShopV3Landing({ signupEnabled }: MarketingExperienceProps) {
  return (
    <div className="shop-v3">
      <a className="shop-skip" href="#main">
        Skip to content
      </a>
      <Header signupEnabled={signupEnabled} />
      <main id="main">
        <Hero signupEnabled={signupEnabled} />
        <StoreInAMinute signupEnabled={signupEnabled} />
        <Story />
        <Explorer />
        <BusinessAndFaq />
        <Pricing signupEnabled={signupEnabled} />
        <Closing signupEnabled={signupEnabled} />
      </main>
      <Footer />
    </div>
  )
}
