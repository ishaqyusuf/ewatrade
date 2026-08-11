import {
  Analytics01Icon,
  ArrowRight01Icon,
  CheckListIcon,
  CheckmarkCircle01Icon,
  Package01Icon,
  Store04Icon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { LeadCaptureForm } from "@/components/lead-capture-form"
import type { MarketingExperienceProps } from "../marketing-experience-contract"
import styles from "./operator-v2.module.css"

const operatingAreas = [
  "Catalog",
  "Orders",
  "Inventory",
  "Customers",
  "Service work",
  "Stores",
  "Team",
]

const repeatedOperatingAreas = ["primary", "echo"].flatMap((cycle) =>
  operatingAreas.map((area) => ({ area, id: `${cycle}-${area}` })),
)

const movementBars = [
  { height: 38, id: "09:00" },
  { height: 64, id: "09:30" },
  { height: 46, id: "10:00" },
  { height: 82, id: "10:30" },
  { height: 58, id: "11:00" },
  { height: 96, id: "11:30" },
  { height: 72, id: "12:00" },
  { height: 52, id: "12:30" },
  { height: 88, id: "13:00" },
  { height: 68, id: "13:30" },
  { height: 91, id: "14:00" },
  { height: 74, id: "14:30" },
]

const systemModules = [
  {
    number: "01",
    eyebrow: "One catalog",
    title: "Sell products and services without splitting the business.",
    body: "Keep products, service offers, prices, units, availability, and store visibility in one catalog your team can actually maintain.",
    accent: "bg-[#ff6f3d]",
    preview: "catalog",
  },
  {
    number: "02",
    eyebrow: "One commercial thread",
    title: "Move from request to quote to order with the context intact.",
    body: "Customer requests, selectable offers, quote versions, approvals, and commercial orders stay connected instead of disappearing into chat history.",
    accent: "bg-[#c9ff63]",
    preview: "request",
  },
  {
    number: "03",
    eyebrow: "One operating picture",
    title: "Know what changed after every sale.",
    body: "See exact stock movement, customer activity, fulfilment state, and store-level work from the same operational record.",
    accent: "bg-[#8ac7ff]",
    preview: "operations",
  },
] as const

const workflow = [
  {
    label: "Capture",
    detail: "Web, QR, staff-assisted, or connected customer channels",
  },
  {
    label: "Shape",
    detail: "Products, services, options, pricing, and availability",
  },
  {
    label: "Sell",
    detail: "Quote versions, approvals, orders, and customer decisions",
  },
  {
    label: "Fulfil",
    detail: "Stock, service work, scheduling, and store ownership",
  },
  {
    label: "Understand",
    detail: "Customer history, order state, and operational signals",
  },
]

const businessTypes = [
  {
    icon: Store04Icon,
    name: "Retail",
    body: "Catalog, stock, customers, and orders across the counter and online.",
  },
  {
    icon: CheckListIcon,
    name: "Service teams",
    body: "Requests, offers, quotes, bookings, fulfilment, and customer updates.",
  },
  {
    icon: Package01Icon,
    name: "Pharmacy",
    body: "A focused pharmacy layer on top of the same catalog and commerce core.",
  },
  {
    icon: Analytics01Icon,
    name: "Multi-store",
    body: "Store-specific teams and stock with one tenant-wide operating view.",
  },
]

function Brand() {
  return (
    <span className="inline-flex items-center gap-2.5 font-semibold tracking-[-0.04em]">
      <span
        aria-hidden="true"
        className="relative block h-5 w-6 before:absolute before:left-0 before:top-0 before:h-2 before:w-5 before:-skew-x-[28deg] before:bg-[#ff6f3d] after:absolute after:bottom-0 after:right-0 after:h-2 after:w-5 after:-skew-x-[28deg] after:bg-current"
      />
      <span>ewatrade</span>
    </span>
  )
}

function PrimaryCta({ signupEnabled }: { signupEnabled: boolean }) {
  return (
    <a
      href={signupEnabled ? "/signup" : "#early-access"}
      className="group inline-flex min-h-12 items-center justify-center gap-3 bg-[#ff6f3d] px-5 text-sm font-semibold text-[#10251d] transition hover:bg-[#ff845d] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff6f3d]"
    >
      {signupEnabled ? "Create your workspace" : "Request early access"}
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        className="size-4 transition-transform group-hover:translate-x-1"
        strokeWidth={2}
      />
    </a>
  )
}

function CommerceBoard() {
  return (
    <div
      className={`${styles.board} relative overflow-hidden bg-[#f8f8f3] text-[#10251d]`}
    >
      <div className="flex items-center justify-between border-b border-[#17382b]/15 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <span className="size-2 bg-[#36a669]" />
          Aster &amp; Row / Ikeja
        </div>
        <div className="flex gap-1.5" aria-label="Workspace view controls">
          <span className="size-2.5 rounded-full bg-[#d8d8ce]" />
          <span className="size-2.5 rounded-full bg-[#d8d8ce]" />
          <span className="size-2.5 rounded-full bg-[#ff6f3d]" />
        </div>
      </div>

      <div className="grid min-h-[31rem] lg:grid-cols-[0.68fr_1.32fr]">
        <aside className="hidden border-r border-[#17382b]/15 p-4 lg:block">
          <p className="mb-4 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[#51665d]">
            Today
          </p>
          {[
            ["Overview", "6 open"],
            ["Orders", "18"],
            ["Requests", "4"],
            ["Inventory", "3 low"],
            ["Customers", ""],
          ].map(([label, value], index) => (
            <div
              key={label}
              className={`mb-1 flex items-center justify-between px-3 py-2.5 text-xs ${
                index === 1 ? "bg-[#10251d] text-white" : "text-[#51665d]"
              }`}
            >
              <span>{label}</span>
              <span className={index === 1 ? "text-[#c9ff63]" : ""}>
                {value}
              </span>
            </div>
          ))}
          <div className="mt-8 border-t border-[#17382b]/15 pt-4">
            <p className="text-[0.65rem] uppercase tracking-[0.16em] text-[#7a8b83]">
              Stores online
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-[-0.05em]">03</p>
          </div>
        </aside>

        <div className="p-4 sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[#60766c]">
                Commercial order
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.05em]">
                Order #1847
              </h2>
            </div>
            <span className="bg-[#dff3e5] px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[#14623b]">
              Preparing
            </span>
          </div>

          <div className="mt-6 grid gap-px bg-[#17382b]/15 sm:grid-cols-3">
            {[
              ["Customer", "Amara Okeke"],
              ["Channel", "WhatsApp"],
              ["Total", "₦48,500"],
            ].map(([label, value]) => (
              <div key={label} className="bg-[#f8f8f3] p-3.5">
                <p className="text-[0.62rem] uppercase tracking-[0.14em] text-[#708178]">
                  {label}
                </p>
                <p className="mt-1 text-xs font-semibold">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-7">
            <div className="flex items-center justify-between text-[0.65rem] font-semibold uppercase tracking-[0.13em] text-[#60766c]">
              <span>Operating thread</span>
              <span>14:32</span>
            </div>
            <div className="relative mt-4 space-y-4 before:absolute before:bottom-4 before:left-[0.72rem] before:top-4 before:w-px before:bg-[#17382b]/20">
              {[
                [
                  "Request captured",
                  "Amara asked for 12 units and gift wrapping",
                  "12:08",
                  "done",
                ],
                [
                  "Quote accepted",
                  "Quote v2 accepted from customer link",
                  "12:41",
                  "done",
                ],
                [
                  "Stock reserved",
                  "12 × Woven desk set · Ikeja store",
                  "12:42",
                  "done",
                ],
                [
                  "Prepare order",
                  "Assigned to Tobi · due today",
                  "14:32",
                  "active",
                ],
              ].map(([title, detail, time, state]) => (
                <div
                  key={title}
                  className="relative grid grid-cols-[1.5rem_1fr_auto] gap-3"
                >
                  <span
                    className={`relative z-10 mt-0.5 flex size-6 items-center justify-center rounded-full border ${
                      state === "active"
                        ? `${styles.activeDot} border-[#ff6f3d] bg-[#ff6f3d]`
                        : "border-[#9eb3a9] bg-[#f8f8f3]"
                    }`}
                  >
                    {state === "done" ? (
                      <HugeiconsIcon
                        icon={CheckmarkCircle01Icon}
                        className="size-3.5"
                      />
                    ) : null}
                  </span>
                  <div>
                    <p className="text-xs font-semibold">{title}</p>
                    <p className="mt-1 text-[0.68rem] leading-5 text-[#60766c]">
                      {detail}
                    </p>
                  </div>
                  <span className="text-[0.62rem] text-[#7a8b83]">{time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModulePreview({
  preview,
}: { preview: (typeof systemModules)[number]["preview"] }) {
  if (preview === "catalog") {
    return (
      <div className="grid gap-px bg-[#15382a]/15 sm:grid-cols-2">
        {[
          ["Woven desk set", "Product", "₦4,500", "48 in stock"],
          ["Home styling visit", "Service", "From ₦35,000", "4 slots"],
          ["Linen storage pair", "Product", "₦18,500", "12 in stock"],
          ["Gift preparation", "Service add-on", "₦2,500", "Available"],
        ].map(([name, type, price, state], index) => (
          <div key={name} className="bg-[#edf5e9] p-5">
            <div
              className={`mb-8 size-9 ${index % 2 === 0 ? "bg-[#ff6f3d]" : "bg-[#10251d]"}`}
            />
            <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[#587066]">
              {type}
            </p>
            <p className="mt-2 text-sm font-semibold">{name}</p>
            <div className="mt-4 flex justify-between text-[0.68rem] text-[#587066]">
              <span>{price}</span>
              <span>{state}</span>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (preview === "request") {
    return (
      <div className="bg-[#10251d] p-5 text-white sm:p-7">
        <div className="flex items-center justify-between border-b border-white/15 pb-4">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center bg-[#c9ff63] text-[#10251d]">
              <HugeiconsIcon icon={WhatsappIcon} className="size-4" />
            </span>
            <div>
              <p className="text-xs font-semibold">New customer request</p>
              <p className="mt-1 text-[0.65rem] text-white/55">
                WhatsApp · 8 minutes ago
              </p>
            </div>
          </div>
          <span className="text-[0.65rem] text-[#c9ff63]">Open</span>
        </div>
        <blockquote className="my-7 max-w-md text-lg leading-8 tracking-[-0.025em] text-white/85">
          “Can you supply 12 desk sets and wrap four as gifts before Friday?”
        </blockquote>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ["Quote v1", "₦51,000", "Revised"],
            ["Quote v2", "₦48,500", "Accepted"],
            ["Order", "#1847", "Created"],
          ].map(([label, value, state]) => (
            <div key={label} className="border border-white/15 p-3">
              <p className="text-[0.6rem] uppercase tracking-[0.12em] text-white/45">
                {label}
              </p>
              <p className="mt-2 text-sm font-semibold">{value}</p>
              <p className="mt-4 text-[0.62rem] text-[#c9ff63]">{state}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#dfefff] p-5 sm:p-7">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[#466270]">
            Today across 3 stores
          </p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.06em]">
            36 movements
          </p>
        </div>
        <span className="bg-white/70 px-3 py-1.5 text-[0.62rem] font-semibold">
          Synced
        </span>
      </div>
      <div className="mt-8 flex h-28 items-end gap-2 border-b border-[#10251d]/20">
        {movementBars.map(({ height, id }, index) => (
          <span
            key={id}
            className={`flex-1 ${index === 5 || index === 10 ? "bg-[#ff6f3d]" : "bg-[#10251d]"}`}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3 text-[0.64rem] text-[#466270]">
        <span>Orders · 18</span>
        <span>Reservations · 11</span>
        <span>Adjustments · 7</span>
      </div>
    </div>
  )
}

export function OperatorV2Landing({ signupEnabled }: MarketingExperienceProps) {
  return (
    <main
      className={`${styles.page} min-h-screen overflow-hidden bg-[#f3f2eb] text-[#10251d]`}
    >
      <nav className="relative z-50 border-b border-[#17382b]/15 bg-[#f3f2eb]/90 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-[90rem] items-center justify-between px-5 sm:px-8 lg:px-12">
          <a href="/" aria-label="EwaTrade home" className="text-xl">
            <Brand />
          </a>
          <div className="hidden items-center gap-7 text-xs font-semibold text-[#51665d] md:flex">
            <a href="#system" className="transition hover:text-[#10251d]">
              Platform
            </a>
            <a href="#workflow" className="transition hover:text-[#10251d]">
              How it works
            </a>
            <a href="#businesses" className="transition hover:text-[#10251d]">
              For your business
            </a>
          </div>
          <a
            href={signupEnabled ? "/signup" : "#early-access"}
            className="inline-flex min-h-10 items-center border border-[#10251d] px-4 text-xs font-semibold transition hover:bg-[#10251d] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff6f3d]"
          >
            {signupEnabled ? "Get started" : "Get early access"}
          </a>
        </div>
      </nav>

      <section className="relative border-b border-[#17382b]/15">
        <div className={styles.heroGrid} aria-hidden="true" />
        <div className="relative mx-auto grid max-w-[90rem] gap-14 px-5 pb-16 pt-16 sm:px-8 sm:pb-24 sm:pt-24 lg:grid-cols-[0.82fr_1.18fr] lg:items-end lg:px-12 lg:pb-28 lg:pt-28">
          <div className="relative z-10">
            <div className="mb-7 inline-flex items-center gap-2 border border-[#17382b]/20 bg-[#f3f2eb] px-3 py-2 text-[0.65rem] font-semibold uppercase tracking-[0.17em]">
              <span className="size-2 bg-[#ff6f3d]" />
              The operating layer behind the shop
            </div>
            <h1 className="max-w-3xl text-[clamp(3.25rem,7.6vw,7.7rem)] font-semibold leading-[0.84] tracking-[-0.075em]">
              Every sale changes something.
              <span className="block text-[#ff6f3d]">Know exactly what.</span>
            </h1>
            <p className="mt-8 max-w-xl text-base leading-7 text-[#51665d] sm:text-lg sm:leading-8">
              EwaTrade keeps your catalog, customers, orders, inventory, and
              service work on one commercial thread—across every store and every
              team.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <PrimaryCta signupEnabled={signupEnabled} />
              <a
                href="#system"
                className="inline-flex min-h-12 items-center justify-center px-5 text-sm font-semibold underline decoration-[#ff6f3d] decoration-2 underline-offset-4 transition hover:text-[#ff6f3d] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff6f3d]"
              >
                See the system in motion
              </a>
            </div>
          </div>
          <div className="relative lg:translate-y-12">
            <div
              className={`${styles.orangeBlock} absolute -right-24 -top-20 h-52 w-64 bg-[#ff6f3d]`}
              aria-hidden="true"
            />
            <CommerceBoard />
            <div className="absolute -bottom-5 -left-4 hidden bg-[#c9ff63] px-4 py-3 text-xs font-semibold shadow-[6px_6px_0_#10251d] sm:block">
              One order. One source of truth.
            </div>
          </div>
        </div>
      </section>

      <section
        className="border-b border-[#17382b]/15 bg-[#10251d] py-4 text-white"
        aria-label="EwaTrade operating areas"
      >
        <div className={styles.marquee}>
          <div className={styles.marqueeTrack}>
            {repeatedOperatingAreas.map(({ area, id }) => (
              <span
                key={id}
                className="flex shrink-0 items-center gap-5 text-xs font-semibold uppercase tracking-[0.18em]"
              >
                {area}
                <span className="size-1.5 bg-[#ff6f3d]" />
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-[#17382b]/15 px-5 py-20 sm:px-8 sm:py-28 lg:px-12">
        <div className="mx-auto grid max-w-[90rem] gap-12 lg:grid-cols-[0.64fr_1.36fr]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#60766c]">
            The real problem
          </p>
          <div>
            <p className="max-w-5xl text-[clamp(2.2rem,5vw,5.2rem)] font-semibold leading-[0.96] tracking-[-0.065em]">
              Your customer sees one business. Your operation should too.
            </p>
            <div className="mt-12 grid gap-px bg-[#17382b]/15 sm:grid-cols-3">
              {[
                ["Chat says", "The customer accepted the new price."],
                ["Stock says", "Those 12 units are still available."],
                ["The spreadsheet says", "Someone will reconcile it later."],
              ].map(([label, copy], index) => (
                <article key={label} className="bg-[#f3f2eb] p-6 sm:min-h-48">
                  <span
                    className={`mb-8 block size-3 ${index === 2 ? "bg-[#ff6f3d]" : "bg-[#10251d]"}`}
                  />
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[#60766c]">
                    {label}
                  </p>
                  <p className="mt-3 text-lg font-semibold leading-7 tracking-[-0.03em]">
                    {copy}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="system"
        className="scroll-mt-16 bg-[#edf5e9] px-5 py-20 sm:px-8 sm:py-28 lg:px-12"
      >
        <div className="mx-auto max-w-[90rem]">
          <div className="mb-16 grid gap-8 lg:grid-cols-2 lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#60766c]">
                One connected system
              </p>
              <h2 className="mt-5 max-w-3xl text-[clamp(2.8rem,6vw,6.5rem)] font-semibold leading-[0.88] tracking-[-0.07em]">
                Run the work, not the gaps.
              </h2>
            </div>
            <p className="max-w-xl text-base leading-7 text-[#51665d] lg:justify-self-end">
              Every module shares the same tenant, store, customer, catalog, and
              commercial records. Your team can move quickly without rebuilding
              the story in each tool.
            </p>
          </div>

          <div className="space-y-24 sm:space-y-32">
            {systemModules.map((module, index) => (
              <article
                key={module.number}
                className="grid gap-10 border-t border-[#17382b]/25 pt-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16"
              >
                <div className={index % 2 === 1 ? "lg:order-2" : ""}>
                  <div className="flex items-center gap-4">
                    <span
                      className={`flex size-10 items-center justify-center ${module.accent} text-xs font-bold`}
                    >
                      {module.number}
                    </span>
                    <p className="text-xs font-semibold uppercase tracking-[0.17em] text-[#51665d]">
                      {module.eyebrow}
                    </p>
                  </div>
                  <h3 className="mt-7 max-w-xl text-3xl font-semibold leading-[1.04] tracking-[-0.055em] sm:text-5xl">
                    {module.title}
                  </h3>
                  <p className="mt-6 max-w-lg text-base leading-7 text-[#51665d]">
                    {module.body}
                  </p>
                </div>
                <div
                  className={`border border-[#17382b]/20 shadow-[12px_12px_0_rgba(16,37,29,0.12)] ${index % 2 === 1 ? "lg:order-1" : ""}`}
                >
                  <ModulePreview preview={module.preview} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="workflow"
        className="scroll-mt-16 border-y border-[#17382b]/15 bg-[#f3f2eb] px-5 py-20 sm:px-8 sm:py-28 lg:px-12"
      >
        <div className="mx-auto max-w-[90rem]">
          <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
            <div className="lg:sticky lg:top-24 lg:self-start">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#60766c]">
                The operating rhythm
              </p>
              <h2 className="mt-5 text-5xl font-semibold leading-[0.9] tracking-[-0.07em] sm:text-7xl">
                Five moves.
                <br />
                One record.
              </h2>
              <p className="mt-6 max-w-sm text-base leading-7 text-[#51665d]">
                Start wherever the customer starts. EwaTrade carries the context
                forward.
              </p>
            </div>
            <ol className="border-t border-[#17382b]/25">
              {workflow.map((step, index) => (
                <li
                  key={step.label}
                  className="group grid gap-4 border-b border-[#17382b]/25 py-7 sm:grid-cols-[4rem_0.7fr_1.3fr] sm:items-center"
                >
                  <span className="text-xs font-semibold text-[#ff6f3d]">
                    0{index + 1}
                  </span>
                  <span className="text-2xl font-semibold tracking-[-0.04em] transition group-hover:translate-x-2">
                    {step.label}
                  </span>
                  <span className="text-sm leading-6 text-[#60766c]">
                    {step.detail}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section
        id="businesses"
        className="scroll-mt-16 bg-[#10251d] px-5 py-20 text-white sm:px-8 sm:py-28 lg:px-12"
      >
        <div className="mx-auto max-w-[90rem]">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c9ff63]">
                Built around the business
              </p>
              <h2 className="mt-5 max-w-4xl text-[clamp(2.7rem,5.5vw,6rem)] font-semibold leading-[0.9] tracking-[-0.07em]">
                Different work.
                <br />
                The same strong core.
              </h2>
            </div>
            <p className="max-w-xl text-base leading-7 text-white/60 lg:justify-self-end">
              EwaTrade adds focused workflows where a business needs them
              without turning the platform into four disconnected products.
            </p>
          </div>
          <div className="mt-14 grid border-l border-t border-white/15 sm:grid-cols-2 lg:grid-cols-4">
            {businessTypes.map((business) => (
              <article
                key={business.name}
                className="min-h-64 border-b border-r border-white/15 p-6 transition hover:bg-white/[0.04]"
              >
                <HugeiconsIcon
                  icon={business.icon}
                  className="size-7 text-[#ff6f3d]"
                  strokeWidth={1.7}
                />
                <h3 className="mt-12 text-xl font-semibold tracking-[-0.04em]">
                  {business.name}
                </h3>
                <p className="mt-4 text-sm leading-6 text-white/55">
                  {business.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#8ac7ff] px-5 py-20 sm:px-8 sm:py-24 lg:px-12">
        <div className="mx-auto grid max-w-[90rem] gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#244755]">
              Work keeps moving
            </p>
            <h2 className="mt-5 max-w-4xl text-[clamp(2.7rem,5.5vw,6rem)] font-semibold leading-[0.9] tracking-[-0.07em]">
              A weak connection should not erase a strong sale.
            </h2>
            <p className="mt-7 max-w-2xl text-base leading-7 text-[#244755]">
              Supported order work can continue offline, then replay against
              server-owned inventory and approval rules when the connection
              returns.
            </p>
          </div>
          <div className="border border-[#10251d]/30 bg-[#dfefff] p-6 shadow-[12px_12px_0_#10251d]">
            <div className="flex items-center justify-between border-b border-[#10251d]/15 pb-5">
              <span className="text-xs font-semibold uppercase tracking-[0.15em]">
                Sync queue
              </span>
              <span
                className={`${styles.syncPulse} flex items-center gap-2 text-xs font-semibold`}
              >
                <span className="size-2 rounded-full bg-[#36a669]" />
                Connected
              </span>
            </div>
            <div className="space-y-3 pt-5">
              {[
                ["Order #1845", "Synced"],
                ["Order #1846", "Synced"],
                ["Order #1847", "Replaying"],
              ].map(([order, state], index) => (
                <div
                  key={order}
                  className="flex items-center justify-between bg-white/55 px-4 py-3 text-xs"
                >
                  <span className="font-semibold">{order}</span>
                  <span
                    className={
                      index === 2 ? "text-[#d94d1f]" : "text-[#24724a]"
                    }
                  >
                    {state}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {signupEnabled ? (
        <section
          id="early-access"
          className="bg-[#f3f2eb] px-5 py-20 sm:px-8 sm:py-28 lg:px-12"
        >
          <div className="mx-auto max-w-[90rem] border-t border-[#17382b]/25 pt-10">
            <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
              <h2 className="max-w-4xl text-[clamp(3rem,7vw,7rem)] font-semibold leading-[0.86] tracking-[-0.075em]">
                Put the whole business on one thread.
              </h2>
              <div className="lg:pb-2">
                <p className="mb-7 max-w-md text-base leading-7 text-[#51665d]">
                  Create your workspace and shape EwaTrade around your stores,
                  catalog, team, and customers.
                </p>
                <PrimaryCta signupEnabled />
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section
          id="early-access"
          className="scroll-mt-16 bg-[#f3f2eb] px-5 py-20 sm:px-8 sm:py-28 lg:px-12"
        >
          <div className="mx-auto max-w-[90rem]">
            <div className="mb-14 grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#60766c]">
                  Early access
                </p>
                <h2 className="mt-5 max-w-4xl text-[clamp(3rem,6vw,6.5rem)] font-semibold leading-[0.88] tracking-[-0.07em]">
                  Show us how your business really runs.
                </h2>
              </div>
              <p className="max-w-lg text-base leading-7 text-[#51665d] lg:justify-self-end">
                We are onboarding teams whose catalog, customer, inventory, or
                service work has outgrown disconnected tools.
              </p>
            </div>
            <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
              <div className={styles.formShell}>
                <LeadCaptureForm
                  type="early-access"
                  title="Request early access"
                  description="Tell us about your stores, team, and the work you want to bring onto one operating thread."
                  submitLabel="Request early access"
                />
              </div>
              <div id="waitlist" className={`${styles.formShell} scroll-mt-16`}>
                <LeadCaptureForm
                  type="waitlist"
                  title="Keep me in the loop"
                  description="Not ready to talk yet? Join the waitlist for wider access updates."
                  submitLabel="Join the waitlist"
                />
              </div>
            </div>
          </div>
        </section>
      )}

      <footer className="border-t border-[#17382b]/15 bg-[#f3f2eb] px-5 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[90rem] flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <a href="/" aria-label="EwaTrade home" className="text-xl">
              <Brand />
            </a>
            <p className="mt-3 max-w-sm text-sm leading-6 text-[#60766c]">
              The operating layer for merchant commerce and service work.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold text-[#51665d]">
            <a href="#system" className="hover:text-[#10251d]">
              Platform
            </a>
            <a href="#workflow" className="hover:text-[#10251d]">
              Workflow
            </a>
            <a href="#businesses" className="hover:text-[#10251d]">
              Businesses
            </a>
            <span>© {new Date().getFullYear()} EwaTrade</span>
          </div>
        </div>
      </footer>
    </main>
  )
}
