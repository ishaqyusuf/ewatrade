"use client"

import { QaQuickFillButton } from "@/components/qa/qa-quick-fill-button"
import { useQaFormFill } from "@/hooks/use-qa-form-fill"
import { useZodForm } from "@/hooks/use-zod-form"
import { workspaceFill } from "@/lib/qa-fill-definitions"
import { type WorkspaceValues, workspaceSchema } from "@/lib/signup-schemas"
import {
  Button,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@ewatrade/ui"
import { withQaWorkspaceSuffix } from "@ewatrade/utils"
import {
  Alert01Icon,
  CheckmarkCircle01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useCallback, useEffect, useState } from "react"
import { SignupAddresses, getSignupAddresses } from "./signup-addresses"

const PLATFORM_DOMAIN =
  process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ?? "ewatrade.com"
type SlugAvailability = "idle" | "checking" | "available" | "taken" | "invalid"

type StepWorkspaceProps = {
  isQa?: boolean
  ownerEmail?: string
  defaultValues?: Partial<WorkspaceValues>
  onNext: (data: WorkspaceValues) => void
}

export function StepWorkspace({
  defaultValues,
  onNext,
  isQa = false,
  ownerEmail,
}: StepWorkspaceProps) {
  const form = useZodForm<WorkspaceValues>(workspaceSchema, {
    defaultValues: defaultValues ?? { subdomain: "" },
    mode: "onChange",
  })

  const { canUndo, fill, isAvailable, qaDomain, undo } = useQaFormFill(
    workspaceFill,
    form,
  )
  const subdomain = form.watch("subdomain") ?? ""
  const effectiveSubdomain = withQaWorkspaceSuffix(subdomain, isQa)
  const [slugStatus, setSlugStatus] = useState<SlugAvailability>("idle")

  const checkSlug = useCallback(
    async (slug: string) => {
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
        const res = await fetch("/api/auth/check-slug", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slug, email: ownerEmail }),
        })
        const data = (await res.json()) as { available: boolean }
        setSlugStatus(!res.ok ? "idle" : data.available ? "available" : "taken")
      } catch {
        setSlugStatus("idle")
      }
    },
    [ownerEmail],
  )

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
      <div className="signup-heading">
        <h1>
          Choose your
          <br />
          storefront address.
        </h1>
        <p className="signup-intro">
          A simple address for your future public store. Your dashboard stays in
          one shared place.
        </p>
      </div>

      <form
        onSubmit={form.handleSubmit((data) =>
          onNext({ subdomain: withQaWorkspaceSuffix(data.subdomain, isQa) }),
        )}
      >
        <FieldGroup className="signup-fields">
          {/* Subdomain input */}
          <Field data-invalid={Boolean(form.formState.errors.subdomain)}>
            <FieldLabel htmlFor="signup-subdomain">
              Storefront address
            </FieldLabel>
            <InputGroup className="signup-address-input">
              <InputGroupInput
                id="signup-subdomain"
                aria-invalid={Boolean(form.formState.errors.subdomain)}
                {...form.register("subdomain")}
                type="text"
                placeholder="yourname"
                autoComplete="off"
                spellCheck={false}
                className="signup-input"
                maxLength={32}
              />
              <InputGroupAddon
                align="inline-end"
                className="signup-address-suffix"
              >
                <InputGroupText>
                  {isQa && !subdomain.endsWith("-qa") ? "-qa" : ""}
                  {PLATFORM_DOMAIN === "localhost" ||
                  PLATFORM_DOMAIN.endsWith(".localhost")
                    ? "-storefront"
                    : ""}
                  .{PLATFORM_DOMAIN}
                </InputGroupText>
              </InputGroupAddon>
            </InputGroup>

            {/* Availability indicator */}
            <div className="flex items-center justify-between pl-1">
              {form.formState.errors.subdomain ? (
                <FieldError>
                  {form.formState.errors.subdomain.message}
                </FieldError>
              ) : (
                <div>{slugStatusEl}</div>
              )}
              <span className="text-xs text-muted-foreground/60">
                {subdomain.length}/32
              </span>
            </div>
          </Field>

          <output className="signup-address-output">
            {
              getSignupAddresses(
                effectiveSubdomain || withQaWorkspaceSuffix("yourname", isQa),
              ).storefront
            }
          </output>
          {/* Live preview */}
          {isQa ? (
            <p className="text-xs text-muted-foreground">
              QA addresses automatically use -qa so ordinary business names stay
              available.
            </p>
          ) : null}
          <SignupAddresses slug={effectiveSubdomain} />

          <div className="signup-actions">
            <p className="signup-hint">Three short steps to your workspace.</p>
            <Button
              type="submit"
              size="lg"
              className="signup-primary"
              disabled={slugStatus === "checking" || slugStatus === "taken"}
            >
              Continue
            </Button>
          </div>
        </FieldGroup>
      </form>

      <QaQuickFillButton
        canUndo={canUndo}
        onFill={fill}
        onUndo={undo}
        qaDomain={qaDomain}
        visible={isAvailable}
      />
    </div>
  )
}
