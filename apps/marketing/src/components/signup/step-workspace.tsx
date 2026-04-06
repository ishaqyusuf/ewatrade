"use client"

import { DevFormFillButton } from "@/components/dev/dev-form-fill-button"
import { useDevFormFill } from "@/hooks/use-dev-form-fill"
import { workspaceFill } from "@/lib/dev-fill-definitions"
import { type WorkspaceValues, workspaceSchema } from "@/lib/signup-schemas"
import { Button } from "@ewatrade/ui"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Alert01Icon,
  CashierIcon,
  CheckmarkCircle01Icon,
  DashboardCircleIcon,
  Loading03Icon,
  Store04Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useCallback, useEffect, useState } from "react"
import { useForm } from "react-hook-form"

const PLATFORM_DOMAIN =
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com"

const baseInputClasses =
  "w-full rounded-2xl border border-border/70 bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10 disabled:opacity-50"

type SlugAvailability = "idle" | "checking" | "available" | "taken" | "invalid"

type StepWorkspaceProps = {
  defaultValues?: Partial<WorkspaceValues>
  onNext: (data: WorkspaceValues) => void
  onBack: () => void
}

function SubdomainPreview({ slug }: { slug: string }) {
  const isValid = slug.length >= 3

  const surfaces = [
    {
      icon: Store04Icon,
      label: "Storefront",
      domain: `${slug || "yourname"}.${PLATFORM_DOMAIN}`,
      color: "text-primary",
      bg: "bg-primary/8",
    },
    {
      icon: CashierIcon,
      label: "POS",
      domain: `${slug || "yourname"}-pos.${PLATFORM_DOMAIN}`,
      color: "text-amber-700",
      bg: "bg-amber-500/8",
    },
    {
      icon: DashboardCircleIcon,
      label: "Dashboard",
      domain: `${slug || "yourname"}-dashboard.${PLATFORM_DOMAIN}`,
      color: "text-emerald-700",
      bg: "bg-emerald-500/8",
    },
  ]

  return (
    <div
      className={`overflow-hidden rounded-2xl border transition-all duration-300 ${
        isValid
          ? "border-primary/20 bg-primary/3"
          : "border-border/50 bg-muted/30"
      }`}
    >
      <div className="border-b border-border/40 px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Your workspace URLs
        </p>
      </div>
      <div className="divide-y divide-border/30">
        {surfaces.map((s) => (
          <div key={s.label} className="flex items-center gap-3 px-4 py-3">
            <div
              className={`flex size-7 shrink-0 items-center justify-center rounded-xl ${s.bg} ${s.color}`}
            >
              <HugeiconsIcon
                icon={s.icon}
                strokeWidth={2}
                className="size-3.5"
              />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-muted-foreground">
                {s.label}
              </p>
              <p
                className={`truncate font-mono text-xs ${isValid ? "text-foreground" : "text-muted-foreground/50"}`}
              >
                {s.domain}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function StepWorkspace({
  defaultValues,
  onNext,
  onBack,
}: StepWorkspaceProps) {
  const form = useForm<WorkspaceValues>({
    resolver: zodResolver(workspaceSchema),
    defaultValues: defaultValues ?? { subdomain: "", customDomain: "" },
    mode: "onChange",
  })

  const { fill } = useDevFormFill(workspaceFill, form)
  const subdomain = form.watch("subdomain") ?? ""
  const [slugStatus, setSlugStatus] = useState<SlugAvailability>("idle")

  const checkSlug = useCallback(async (slug: string) => {
    if (slug.length < 3) {
      setSlugStatus("idle")
      return
    }

    const schemaCheck = workspaceSchema.shape.subdomain.safeParse(slug)
    if (!schemaCheck.success) {
      setSlugStatus("invalid")
      return
    }

    setSlugStatus("checking")
    try {
      const res = await fetch(
        `/api/auth/check-slug?slug=${encodeURIComponent(slug)}`,
      )
      const data = (await res.json()) as { available: boolean }
      setSlugStatus(data.available ? "available" : "taken")
    } catch {
      setSlugStatus("idle")
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      void checkSlug(subdomain)
    }, 500)
    return () => clearTimeout(timer)
  }, [subdomain, checkSlug])

  const slugStatusEl = (() => {
    switch (slugStatus) {
      case "checking":
        return (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <HugeiconsIcon
              icon={Loading03Icon}
              strokeWidth={2}
              className="size-3 animate-spin"
            />
            Checking…
          </span>
        )
      case "available":
        return (
          <span className="flex items-center gap-1 text-xs text-emerald-600">
            <HugeiconsIcon
              icon={CheckmarkCircle01Icon}
              strokeWidth={2}
              className="size-3"
            />
            Available
          </span>
        )
      case "taken":
        return (
          <span className="flex items-center gap-1 text-xs text-destructive">
            <HugeiconsIcon
              icon={Alert01Icon}
              strokeWidth={2}
              className="size-3"
            />
            Already taken
          </span>
        )
      case "invalid":
        return null
      default:
        return null
    }
  })()

  return (
    <div>
      <div className="mb-8 text-center">
        <h2
          className="text-2xl font-semibold text-foreground sm:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Claim your workspace
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Your subdomain becomes the root of your storefront, POS, and
          dashboard.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onNext)} className="space-y-5">
        {/* Subdomain input */}
        <label className="block space-y-2 text-sm font-medium text-foreground">
          <span>Choose your subdomain</span>
          <div className="flex overflow-hidden rounded-2xl border border-border/70 bg-background focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10">
            <input
              {...form.register("subdomain")}
              type="text"
              placeholder="yourname"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
            />
            <div className="flex shrink-0 items-center border-l border-border/50 bg-muted/40 px-3 py-3">
              <span className="text-xs text-muted-foreground">
                .{PLATFORM_DOMAIN}
              </span>
            </div>
          </div>

          {/* Availability indicator */}
          <div className="flex items-center justify-between pl-1">
            {form.formState.errors.subdomain ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.subdomain.message}
              </p>
            ) : (
              <div>{slugStatusEl}</div>
            )}
            <span className="text-xs text-muted-foreground/60">
              {subdomain.length}/32
            </span>
          </div>
        </label>

        {/* Live preview */}
        <SubdomainPreview slug={subdomain} />

        {/* Custom domain */}
        <label className="block space-y-2 text-sm font-medium text-foreground">
          <div className="flex items-center gap-2">
            <span>Custom domain</span>
            <span className="rounded-full border border-border/50 bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              optional
            </span>
          </div>
          <input
            {...form.register("customDomain")}
            type="text"
            placeholder="mystore.com"
            className={baseInputClasses}
          />
          {form.formState.errors.customDomain ? (
            <p className="text-xs text-destructive">
              {form.formState.errors.customDomain.message}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Connecting a custom domain is also available from your dashboard
              after signup.
            </p>
          )}
        </label>

        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="rounded-full"
            onClick={onBack}
          >
            Back
          </Button>
          <Button
            type="submit"
            size="lg"
            className="rounded-full px-8"
            disabled={slugStatus === "checking" || slugStatus === "taken"}
          >
            Continue
          </Button>
        </div>
      </form>

      <DevFormFillButton onFill={fill} label="Fill step 2" />
    </div>
  )
}
