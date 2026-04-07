"use client"

import { DevEmailPreview } from "@/components/dev/dev-email-preview"
import { Button } from "@ewatrade/ui"
import {
  ArrowRight01Icon,
  CashierIcon,
  CheckmarkCircle01Icon,
  DashboardCircleIcon,
  Store04Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useState } from "react"

const PLATFORM_DOMAIN =
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com"

type StepSuccessProps = {
  tenantSlug: string
  businessName: string
  devEmailHtml?: string
}

function ConfettiDot({ style }: { style: React.CSSProperties }) {
  return (
    <div
      className="pointer-events-none absolute size-2 rounded-full"
      style={style}
    />
  )
}

const CONFETTI_PIECES = [
  { top: "10%", left: "5%", bg: "oklch(0.488 0.243 264.376)", delay: "0ms" },
  { top: "20%", left: "15%", bg: "oklch(0.7 0.2 140)", delay: "80ms" },
  { top: "8%", left: "80%", bg: "oklch(0.8 0.18 60)", delay: "40ms" },
  { top: "30%", left: "90%", bg: "oklch(0.488 0.243 264.376)", delay: "120ms" },
  { top: "5%", left: "50%", bg: "oklch(0.7 0.2 0)", delay: "60ms" },
  { top: "15%", left: "70%", bg: "oklch(0.7 0.2 140)", delay: "100ms" },
]

export function StepSuccess({
  tenantSlug,
  businessName,
  devEmailHtml,
}: StepSuccessProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(t)
  }, [])

  const surfaces = [
    {
      icon: Store04Icon,
      label: "Storefront",
      description: "Your public merchant store",
      href: `https://${tenantSlug}.${PLATFORM_DOMAIN}`,
      domain: `${tenantSlug}.${PLATFORM_DOMAIN}`,
      color: "text-primary",
      bg: "bg-primary/8",
      hoverBorder: "hover:border-primary/40",
    },
    {
      icon: CashierIcon,
      label: "POS",
      description: "Cashier & in-store checkout",
      href: `https://${tenantSlug}-pos.${PLATFORM_DOMAIN}`,
      domain: `${tenantSlug}-pos.${PLATFORM_DOMAIN}`,
      color: "text-amber-700",
      bg: "bg-amber-500/8",
      hoverBorder: "hover:border-amber-400/50",
    },
    {
      icon: DashboardCircleIcon,
      label: "Dashboard",
      description: "Operations & settings",
      href: `https://${tenantSlug}-dashboard.${PLATFORM_DOMAIN}`,
      domain: `${tenantSlug}-dashboard.${PLATFORM_DOMAIN}`,
      color: "text-emerald-700",
      bg: "bg-emerald-500/8",
      hoverBorder: "hover:border-emerald-400/50",
    },
  ]

  const dashboardUrl = `https://${tenantSlug}-dashboard.${PLATFORM_DOMAIN}`

  return (
    <div
      className={`transition-all duration-500 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
    >
      {/* Celebration header */}
      <div className="relative mb-8 text-center">
        {CONFETTI_PIECES.map((c) => (
          <ConfettiDot
            key={`${c.top}-${c.left}`}
            style={{ top: c.top, left: c.left, background: c.bg, opacity: 0.6 }}
          />
        ))}

        <div className="mb-4 inline-flex size-16 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-600">
          <HugeiconsIcon
            icon={CheckmarkCircle01Icon}
            strokeWidth={1.5}
            className="size-8"
          />
        </div>

        <h2
          className="text-2xl font-semibold text-foreground sm:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Your workspace is ready.
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          <span className="font-semibold text-foreground">{businessName}</span>{" "}
          is set up on ewatrade. Here are your workspace URLs.
        </p>
      </div>

      {/* Workspace URL cards */}
      <div className="mb-6 space-y-2">
        {surfaces.map((s) => (
          <a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`group flex items-center gap-4 rounded-2xl border border-border/60 bg-background/80 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted/20 hover:shadow-sm ${s.hoverBorder}`}
          >
            <div
              className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${s.bg} ${s.color}`}
            >
              <HugeiconsIcon
                icon={s.icon}
                strokeWidth={2}
                className="size-4.5"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                {s.label}
              </p>
              <p className="truncate font-mono text-xs text-foreground">
                {s.domain}
              </p>
              <p className="text-xs text-muted-foreground">{s.description}</p>
            </div>
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              strokeWidth={2}
              className={`size-4 shrink-0 text-muted-foreground/40 transition-transform duration-200 group-hover:translate-x-0.5 ${s.color} opacity-0 group-hover:opacity-100`}
            />
          </a>
        ))}
      </div>

      {/* Check email notice */}
      <div className="mb-6 rounded-2xl border border-border/50 bg-muted/30 px-4 py-3">
        <p className="text-sm text-muted-foreground">
          We sent a confirmation email to verify your address. Check your inbox
          and follow the link to activate your account.
        </p>
      </div>

      {/* Dev email preview */}
      {devEmailHtml && (
        <DevEmailPreview
          html={devEmailHtml}
          subject={`Welcome to ewatrade — verify your ${businessName} workspace`}
        />
      )}

      {/* CTA */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button
          size="lg"
          className="gap-2 rounded-full px-8"
          render={<a href={dashboardUrl} />}
        >
          Go to dashboard
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={2}
            className="size-4"
          />
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="rounded-full px-6"
          render={<a href="/" />}
        >
          Back to home
        </Button>
      </div>
    </div>
  )
}
