import { ArrowRight01Icon, DeliveryTruck01Icon, Store04Icon, WhatsappIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@ewatrade/ui"

const valuePillars = [
  {
    title: "Sell everywhere",
    body: "Launch branded storefronts, manage catalog across multiple stores, and keep pricing, stock, and orders in one operating layer."
  },
  {
    title: "Coordinate delivery",
    body: "Turn order flow into dispatch-ready fulfillment with bidding, provider coordination, and merchant-friendly delivery visibility."
  },
  {
    title: "Run the floor",
    body: "Support cashier, POS, and assisted self-checkout experiences without splitting your operation across disconnected systems."
  }
]

const platformSurfaces = [
  {
    eyebrow: "Storefront",
    title: "Merchant-branded commerce experiences",
    body: "Custom storefront domains, multi-store catalog publishing, and section-based website building for modern retail teams."
  },
  {
    eyebrow: "Dashboard",
    title: "Daily operations in one control plane",
    body: "Orders, inventory, delivery activity, and merchant configuration live together so teams can act without context switching."
  },
  {
    eyebrow: "POS",
    title: "In-store transactions without extra complexity",
    body: "Cashier workflows, barcode scanning, receipts, and self-service support connect directly to the same product and order model."
  }
]

const workflowSteps = [
  "Create a merchant storefront and publish catalog-ready sections.",
  "Capture orders from branded customer-facing surfaces.",
  "Route fulfillment into delivery coordination or in-store completion.",
  "Keep merchant teams, cashiers, and dispatch providers aligned in one platform."
]

const stats = [
  { label: "Core surfaces", value: "4" },
  { label: "Merchant focus", value: "Multi-store" },
  { label: "Operational model", value: "Commerce + logistics" },
  { label: "Messaging layer", value: "WhatsApp-ready" }
]

const audienceChips = [
  "Merchants",
  "Dispatch providers",
  "Store cashiers",
  "End customers"
]

export default function HomePage() {
  return (
    <main className="overflow-hidden">
      <section className="relative px-6 pb-10 pt-6 sm:px-10 lg:px-16 lg:pb-14">
        <div className="absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(circle_at_top_left,rgba(213,95,28,0.18),transparent_35%),radial-gradient(circle_at_top_right,rgba(16,94,84,0.18),transparent_30%),linear-gradient(180deg,rgba(255,247,236,0.96),rgba(255,255,255,0))]" />
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-wrap gap-3 text-xs uppercase tracking-[0.24em] text-muted-foreground">
            {audienceChips.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-border/70 bg-background/85 px-3 py-1"
              >
                {chip}
              </span>
            ))}
          </div>

          <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
            <div className="space-y-8">
              <div className="inline-flex items-center rounded-full border border-border/70 bg-background/90 px-4 py-2 text-sm text-muted-foreground shadow-sm">
                Commerce, logistics, POS, and messaging in one merchant platform
              </div>

              <div className="space-y-5">
                <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
                  ewatrade
                </p>
                <h1
                  className="max-w-5xl text-5xl leading-[0.92] sm:text-6xl lg:text-7xl"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Built for African merchants who need to sell, fulfil, and operate from one system.
                </h1>
                <p className="max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
                  ewatrade combines branded storefronts, merchant operations, dispatch coordination,
                  POS workflows, and customer communication into a single multi-tenant platform.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button size="lg" className="gap-2">
                  Request early access
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4" />
                </Button>
                <Button size="lg" variant="outline">
                  Explore the product surfaces
                </Button>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-[2rem] border border-border/70 bg-background/92 p-6 shadow-[0_24px_70px_rgba(39,28,14,0.08)] backdrop-blur">
                <div className="mb-6 flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <HugeiconsIcon icon={Store04Icon} strokeWidth={2} className="size-5" />
                  </span>
                  <div>
                    <p className="font-medium text-foreground">Merchant operating system</p>
                    <p className="text-sm text-muted-foreground">
                      Storefront, inventory, orders, delivery, and POS connected by one data model.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {stats.map((stat) => (
                    <div
                      key={stat.label}
                      className="rounded-2xl border border-border/70 bg-muted/40 px-4 py-4"
                    >
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        {stat.label}
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-foreground">{stat.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[1.75rem] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,247,236,0.86))] p-5">
                  <div className="mb-3 flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <HugeiconsIcon icon={DeliveryTruck01Icon} strokeWidth={2} className="size-5" />
                  </div>
                  <p className="font-medium text-foreground">Dispatch-ready by design</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Coordinate providers, service zones, and delivery handoffs without leaving the commerce workflow.
                  </p>
                </div>
                <div className="rounded-[1.75rem] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(240,249,247,0.92))] p-5">
                  <div className="mb-3 flex size-10 items-center justify-center rounded-2xl bg-emerald-600/10 text-emerald-700">
                    <HugeiconsIcon icon={WhatsappIcon} strokeWidth={2} className="size-5" />
                  </div>
                  <p className="font-medium text-foreground">Messaging in the loop</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Support WhatsApp-assisted commerce and customer communication as part of the same platform experience.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-12 sm:px-10 lg:px-16 lg:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 max-w-2xl space-y-3">
            <p className="text-sm uppercase tracking-[0.28em] text-muted-foreground">
              Why it matters
            </p>
            <h2
              className="text-3xl leading-tight sm:text-4xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Most merchant teams do not need more tools. They need one operating rhythm.
            </h2>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            {valuePillars.map((pillar) => (
              <article
                key={pillar.title}
                className="rounded-[1.75rem] border border-border/70 bg-background/90 p-6 shadow-sm"
              >
                <p className="text-lg font-medium text-foreground">{pillar.title}</p>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">{pillar.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-12 sm:px-10 lg:px-16 lg:py-16">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(247,242,236,0.86))] p-8 shadow-[0_22px_80px_rgba(40,30,15,0.06)] md:p-10">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-3">
              <p className="text-sm uppercase tracking-[0.28em] text-muted-foreground">
                Platform surfaces
              </p>
              <h2
                className="text-3xl leading-tight sm:text-4xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                One platform, separated into the surfaces each team actually needs.
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {platformSurfaces.map((surface) => (
                <article
                  key={surface.title}
                  className="rounded-[1.5rem] border border-border/70 bg-background/90 p-5"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {surface.eyebrow}
                  </p>
                  <p className="mt-3 text-lg font-medium text-foreground">{surface.title}</p>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{surface.body}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-12 sm:px-10 lg:px-16 lg:py-16">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="space-y-3">
            <p className="text-sm uppercase tracking-[0.28em] text-muted-foreground">
              Workflow
            </p>
            <h2
              className="text-3xl leading-tight sm:text-4xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              From discovery to delivery, the merchant team stays on one operational thread.
            </h2>
            <p className="max-w-xl text-base leading-7 text-muted-foreground">
              ewatrade is designed so customer-facing commerce, internal merchant operations, and
              delivery coordination reinforce one another instead of being stitched together later.
            </p>
          </div>

          <div className="grid gap-4">
            {workflowSteps.map((step, index) => (
              <div
                key={step}
                className="flex gap-4 rounded-[1.5rem] border border-border/70 bg-background/90 p-5"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-sm font-semibold text-primary">
                  0{index + 1}
                </div>
                <p className="pt-1 text-sm leading-7 text-foreground">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-16 pt-12 sm:px-10 lg:px-16 lg:pb-24 lg:pt-16">
        <div className="mx-auto max-w-7xl rounded-[2.25rem] border border-border/70 bg-foreground px-8 py-10 text-background shadow-[0_28px_90px_rgba(24,20,16,0.18)] md:px-10 md:py-12">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="space-y-4">
              <p className="text-sm uppercase tracking-[0.28em] text-background/70">
                Early access
              </p>
              <h2
                className="max-w-3xl text-3xl leading-tight text-balance sm:text-4xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Build a merchant operation that can launch fast, sell confidently, and fulfil with control.
              </h2>
              <p className="max-w-2xl text-base leading-7 text-background/75">
                Start with the public ewatrade story today, then grow into storefront, POS, dashboard,
                and fulfillment surfaces on the same platform foundation.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Button size="lg" variant="secondary">
                Join the waitlist
              </Button>
              <Button size="lg" variant="outline" className="border-background/20 bg-transparent text-background hover:bg-background/10 hover:text-background">
                Talk to the team
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
