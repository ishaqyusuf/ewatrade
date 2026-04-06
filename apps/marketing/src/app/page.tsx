import {
  ArrowRight01Icon,
  DeliveryTruck01Icon,
  Store04Icon,
  WhatsappIcon
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@ewatrade/ui"

import { AnimateIn } from "@/components/animate-in"
import { LeadCaptureForm } from "@/components/lead-capture-form"

// ─── Data ────────────────────────────────────────────────────────────────────

const valuePillars = [
  {
    index: "01",
    title: "Sell everywhere",
    body: "Launch branded storefronts, manage catalog across multiple stores, and keep pricing, stock, and orders unified in one operating layer.",
    accent: "text-primary",
    bar: "bg-primary",
    glow: "shadow-primary/20"
  },
  {
    index: "02",
    title: "Coordinate delivery",
    body: "Turn order flow into dispatch-ready fulfillment with bidding, provider coordination, and merchant-friendly delivery visibility.",
    accent: "text-amber-700",
    bar: "bg-amber-500",
    glow: "shadow-amber-500/20"
  },
  {
    index: "03",
    title: "Run the floor",
    body: "Support cashier, POS, and assisted self-checkout experiences without splitting your operation across disconnected systems.",
    accent: "text-emerald-700",
    bar: "bg-emerald-500",
    glow: "shadow-emerald-500/20"
  }
]

const platformSurfaces = [
  {
    eyebrow: "Storefront",
    title: "Merchant-branded commerce experiences",
    body: "Custom domains, multi-store catalog publishing, and section-based website building for modern retail teams."
  },
  {
    eyebrow: "Dashboard",
    title: "One control plane for daily operations",
    body: "Orders, inventory, delivery activity, and merchant configuration together so teams act without context-switching."
  },
  {
    eyebrow: "POS",
    title: "In-store without the extra complexity",
    body: "Cashier workflows, barcode scanning, and receipts connected directly to the same product and order model."
  }
]

const workflowSteps = [
  {
    heading: "Create and publish",
    body: "Set up a merchant storefront and publish catalog-ready sections to your branded domain in minutes."
  },
  {
    heading: "Capture orders",
    body: "Receive orders from branded customer-facing surfaces — online, in-store POS, or via assisted checkout."
  },
  {
    heading: "Fulfil and dispatch",
    body: "Route fulfillment into delivery coordination with provider bidding, zone management, and handoff tracking."
  },
  {
    heading: "Stay aligned",
    body: "Keep merchant teams, cashiers, and dispatch providers synchronized in one platform with no manual bridging."
  }
]

const stats = [
  { value: "4", label: "Core surfaces" },
  { value: "Multi-store", label: "Merchant scope" },
  { value: "Commerce + logistics", label: "Operational model" },
  { value: "WhatsApp-ready", label: "Messaging layer" }
]

// ─── Shared animation style helper ───────────────────────────────────────────

function heroStyle(delay: number): React.CSSProperties {
  return { animationDelay: `${delay}ms`, animationFillMode: "both" }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 sm:px-10 lg:px-16">
          <div className="flex items-center gap-8">
            <span
              className="text-xl font-semibold tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              ewatrade
            </span>
            <div className="hidden items-center gap-6 text-sm text-muted-foreground lg:flex">
              <a href="#platform" className="transition-colors duration-200 hover:text-foreground">
                Platform
              </a>
              <a
                href="#how-it-works"
                className="transition-colors duration-200 hover:text-foreground"
              >
                How it works
              </a>
              <a
                href="#early-access"
                className="transition-colors duration-200 hover:text-foreground"
              >
                Get access
              </a>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" render={<a href="#waitlist" />}>
              Join waitlist
            </Button>
            <Button size="sm" className="rounded-full px-4" render={<a href="#early-access" />}>
              Request access
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 pb-24 pt-20 sm:px-10 lg:px-16 lg:pb-32 lg:pt-28">
        {/* Background blobs */}
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[52rem] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent),radial-gradient(ellipse_60%_40%_at_80%_10%,rgba(16,94,84,0.12),transparent),linear-gradient(180deg,rgba(255,247,236,0.7)_0%,transparent_100%)]" />

        <div className="mx-auto max-w-7xl">
          {/* Badge */}
          <div
            className="animate-in fade-in slide-in-from-top-3 mb-10 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/90 px-4 py-2 text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground shadow-sm duration-500"
            style={heroStyle(0)}
          >
            Commerce · Logistics · POS · Messaging
          </div>

          <div className="grid gap-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            {/* Left: Copy */}
            <div className="space-y-8">
              <div className="space-y-5">
                <p
                  className="animate-in fade-in text-xs font-semibold uppercase tracking-[0.35em] text-muted-foreground duration-500"
                  style={heroStyle(80)}
                >
                  ewatrade
                </p>
                <h1
                  className="animate-in fade-in slide-in-from-bottom-8 max-w-2xl text-[clamp(2.6rem,6vw,4.8rem)] leading-[0.9] tracking-tight text-foreground duration-700"
                  style={{ ...heroStyle(160), fontFamily: "var(--font-display)" }}
                >
                  The merchant operating system for African commerce.
                </h1>
                <p
                  className="animate-in fade-in slide-in-from-bottom-6 max-w-xl text-lg leading-8 text-muted-foreground duration-700"
                  style={heroStyle(320)}
                >
                  ewatrade connects branded storefronts, merchant operations, dispatch coordination,
                  POS workflows, and customer messaging into one multi-tenant platform.
                </p>
              </div>

              <div
                className="animate-in fade-in slide-in-from-bottom-4 flex flex-col gap-3 sm:flex-row duration-700"
                style={heroStyle(460)}
              >
                <Button
                  size="lg"
                  className="gap-2 rounded-full px-6 transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98]"
                  render={<a href="#early-access" />}
                >
                  Request early access
                  <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-full px-6 transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98]"
                  render={<a href="#waitlist" />}
                >
                  Join the waitlist
                </Button>
              </div>

              {/* Audience chips */}
              <div
                className="animate-in fade-in flex flex-wrap items-center gap-2 pt-1 duration-500"
                style={heroStyle(600)}
              >
                <span className="text-xs text-muted-foreground">Built for:</span>
                {["Merchants", "Dispatch providers", "Cashiers", "Customers"].map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full border border-border/60 bg-muted/60 px-3 py-1 text-xs text-foreground transition-colors duration-200 hover:border-border hover:bg-muted"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: Product preview */}
            <div
              className="animate-in fade-in slide-in-from-bottom-10 space-y-4 duration-700"
              style={heroStyle(240)}
            >
              <div className="overflow-hidden rounded-[2rem] border border-border/70 bg-background/95 p-7 shadow-[0_32px_100px_rgba(39,28,14,0.1)] backdrop-blur transition-shadow duration-300 hover:shadow-[0_40px_120px_rgba(39,28,14,0.13)]">
                <div className="mb-6 flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors duration-200 group-hover:bg-primary/15">
                    <HugeiconsIcon icon={Store04Icon} strokeWidth={2} className="size-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Merchant operating system
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Storefront · Orders · Delivery · POS
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {stats.map((stat, i) => (
                    <div
                      key={stat.label}
                      className="rounded-2xl bg-muted/50 px-4 py-4 transition-colors duration-200 hover:bg-muted/80"
                      style={{
                        animationDelay: `${360 + i * 80}ms`,
                        animationFillMode: "both"
                      }}
                    >
                      <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                        {stat.label}
                      </p>
                      <p className="mt-2 text-xl font-bold text-foreground">{stat.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="group rounded-[1.75rem] border border-border/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(255,242,220,0.92))] p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                  <div className="mb-3 flex size-9 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-700 transition-colors duration-200 group-hover:bg-amber-500/20">
                    <HugeiconsIcon icon={DeliveryTruck01Icon} strokeWidth={2} className="size-4" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">Dispatch-ready by design</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Coordinated delivery from order to handoff, no bridging required.
                  </p>
                </div>
                <div className="group rounded-[1.75rem] border border-border/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.97),rgba(220,249,240,0.92))] p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                  <div className="mb-3 flex size-9 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-700 transition-colors duration-200 group-hover:bg-emerald-500/20">
                    <HugeiconsIcon icon={WhatsappIcon} strokeWidth={2} className="size-4" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">WhatsApp-ready</p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    Commerce updates via messaging as part of the same platform experience.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Value pillars ─────────────────────────────────────────────────────── */}
      <section className="px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <AnimateIn className="mb-12 max-w-2xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Why it matters
            </p>
            <h2
              className="text-3xl leading-tight sm:text-[2.4rem]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Most merchant teams do not need more tools. They need one operating rhythm.
            </h2>
          </AnimateIn>

          <div className="grid gap-5 lg:grid-cols-3">
            {valuePillars.map((pillar, i) => (
              <AnimateIn key={pillar.title} delay={i * 100}>
                <article
                  className={`group relative h-full overflow-hidden rounded-[2rem] border border-border/70 bg-background/90 p-8 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl ${pillar.glow}`}
                >
                  {/* Animated top bar: grows in from left on hover */}
                  <div
                    className={`absolute inset-x-0 top-0 h-[2px] ${pillar.bar} origin-left scale-x-100 transition-transform duration-500`}
                  />
                  {/* Subtle background tint on hover */}
                  <div className="absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-gradient-to-b from-muted/40 to-transparent" />

                  <p className={`mb-5 text-xs font-bold tracking-[0.2em] ${pillar.accent}`}>
                    {pillar.index}
                  </p>
                  <p className="text-xl font-semibold text-foreground">{pillar.title}</p>
                  <p className="mt-4 text-sm leading-7 text-muted-foreground">{pillar.body}</p>
                </article>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Platform surfaces ─────────────────────────────────────────────────── */}
      <section id="platform" className="px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <AnimateIn>
            <div className="overflow-hidden rounded-[2.5rem] border border-border/70 bg-[linear-gradient(160deg,rgba(255,255,255,0.97),rgba(249,244,235,0.94))] shadow-[0_28px_90px_rgba(40,30,15,0.07)] transition-shadow duration-300 hover:shadow-[0_36px_110px_rgba(40,30,15,0.10)]">
              <div className="grid lg:grid-cols-[0.72fr_1.28fr]">
                {/* Label */}
                <div className="flex flex-col justify-center border-b border-border/50 p-10 lg:border-b-0 lg:border-r">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                    Platform surfaces
                  </p>
                  <h2
                    className="text-3xl leading-tight sm:text-4xl"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    One platform, separated into the surfaces each team actually needs.
                  </h2>
                  <p className="mt-5 text-sm leading-7 text-muted-foreground">
                    Merchants, cashiers, and operations teams each get the right surface, all sharing
                    one underlying data and order model.
                  </p>
                </div>

                {/* Surface cards */}
                <div className="grid divide-y divide-border/50 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                  {platformSurfaces.map((surface, i) => (
                    <div
                      key={surface.eyebrow}
                      className="group p-8 transition-colors duration-200 hover:bg-background/60"
                    >
                      <div className="mb-4 inline-flex h-6 items-center rounded-full bg-primary/10 px-3 text-xs font-semibold text-primary transition-colors duration-200 group-hover:bg-primary/18">
                        {surface.eyebrow}
                      </div>
                      <p className="text-base font-semibold leading-snug text-foreground">
                        {surface.title}
                      </p>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{surface.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-16 lg:grid-cols-2 lg:items-start">
            {/* Sticky heading */}
            <AnimateIn from="left" className="space-y-4 lg:sticky lg:top-24">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                Workflow
              </p>
              <h2
                className="text-3xl leading-tight sm:text-4xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                From discovery to delivery on one operational thread.
              </h2>
              <p className="text-base leading-7 text-muted-foreground">
                Customer-facing commerce, internal operations, and delivery coordination built to
                reinforce one another — not stitched together after the fact.
              </p>
            </AnimateIn>

            {/* Steps */}
            <div className="relative space-y-0">
              <div className="absolute bottom-6 left-[1.1875rem] top-6 w-px bg-border/60" />
              {workflowSteps.map((step, index) => (
                <AnimateIn key={step.heading} delay={index * 120} from="right">
                  <div className="group relative flex gap-6 pb-10 last:pb-0">
                    <div className="relative z-10 flex size-[2.375rem] shrink-0 items-center justify-center rounded-full border border-border/80 bg-background text-xs font-bold text-primary shadow-sm transition-all duration-200 group-hover:border-primary/40 group-hover:bg-primary/5 group-hover:shadow-md">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="space-y-1 pt-1.5">
                      <p className="text-sm font-semibold text-foreground transition-colors duration-200 group-hover:text-primary">
                        {step.heading}
                      </p>
                      <p className="text-sm leading-7 text-muted-foreground">{step.body}</p>
                    </div>
                  </div>
                </AnimateIn>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA / Lead capture ────────────────────────────────────────────────── */}
      <section className="px-6 py-20 sm:px-10 lg:px-16 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <AnimateIn className="mb-12 max-w-2xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Get involved
            </p>
            <h2
              className="text-3xl leading-tight sm:text-4xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Tell us how you want to launch, sell, or operate with ewatrade.
            </h2>
            <p className="mt-5 text-base leading-7 text-muted-foreground">
              Use early access if you are ready to talk through your merchant needs now. Use the
              waitlist to stay close as ewatrade opens up further.
            </p>
          </AnimateIn>

          <div className="grid gap-6 lg:grid-cols-2">
            <AnimateIn delay={0}>
              <div id="early-access">
                <LeadCaptureForm
                  type="early-access"
                  title="Request early access"
                  description="Share your merchant, operations, or fulfillment use case and we will reach out when the next onboarding window opens."
                  submitLabel="Request early access"
                />
              </div>
            </AnimateIn>
            <AnimateIn delay={120}>
              <div id="waitlist">
                <LeadCaptureForm
                  type="waitlist"
                  title="Join the waitlist"
                  description="Stay in the loop as ewatrade expands from early cohorts into broader merchant access."
                  submitLabel="Join the waitlist"
                />
              </div>
            </AnimateIn>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/60 px-6 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xs">
              <span
                className="text-lg font-semibold text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                ewatrade
              </span>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Multi-tenant commerce, logistics, and merchant operations for African markets.
              </p>
            </div>

            <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:items-end">
              <a href="#platform" className="transition-colors duration-200 hover:text-foreground">
                Platform
              </a>
              <a
                href="#how-it-works"
                className="transition-colors duration-200 hover:text-foreground"
              >
                How it works
              </a>
              <a
                href="#early-access"
                className="transition-colors duration-200 hover:text-foreground"
              >
                Request early access
              </a>
              <a href="#waitlist" className="transition-colors duration-200 hover:text-foreground">
                Join the waitlist
              </a>
            </div>
          </div>

          <div className="mt-10 border-t border-border/50 pt-8">
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} ewatrade. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
