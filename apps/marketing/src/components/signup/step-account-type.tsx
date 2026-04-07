"use client"

import { DevFormFillButton } from "@/components/dev/dev-form-fill-button"
import { useDevFormFill } from "@/hooks/use-dev-form-fill"
import { useZodForm } from "@/hooks/use-zod-form"
import { accountTypeFill } from "@/lib/dev-fill-definitions"
import {
  type AccountTypeValues,
  type TenantMode,
  accountTypeSchema,
} from "@/lib/signup-schemas"
import { Button } from "@ewatrade/ui"
import {
  CheckmarkCircle01Icon,
  DeliveryTruck01Icon,
  Store04Icon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

const MODES: {
  value: TenantMode
  icon: typeof Store04Icon
  title: string
  description: string
  color: string
  bg: string
  border: string
  selectedBorder: string
  selectedBg: string
}[] = [
  {
    value: "STORE",
    icon: Store04Icon,
    title: "Storefront",
    description:
      "Sell online with a branded storefront, product catalog, and customer-facing checkout.",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-border/60",
    selectedBorder: "border-primary",
    selectedBg: "bg-primary/5",
  },
  {
    value: "DISPATCH",
    icon: DeliveryTruck01Icon,
    title: "Dispatch",
    description:
      "Coordinate deliveries, accept bid requests from merchants, and manage your fleet.",
    color: "text-amber-700",
    bg: "bg-amber-500/10",
    border: "border-border/60",
    selectedBorder: "border-amber-500",
    selectedBg: "bg-amber-50/80",
  },
  {
    value: "MERCHANT",
    icon: UserMultiple02Icon,
    title: "Full merchant suite",
    description:
      "Manage orders, inventory, staff, POS, and delivery operations from one dashboard.",
    color: "text-emerald-700",
    bg: "bg-emerald-500/10",
    border: "border-border/60",
    selectedBorder: "border-emerald-500",
    selectedBg: "bg-emerald-50/80",
  },
]

type StepAccountTypeProps = {
  defaultValues?: Partial<AccountTypeValues>
  onNext: (data: AccountTypeValues) => void
}

export function StepAccountType({
  defaultValues,
  onNext,
}: StepAccountTypeProps) {
  const form = useZodForm<AccountTypeValues>(accountTypeSchema, {
    defaultValues: defaultValues ?? { modes: [] },
  })

  const { fill } = useDevFormFill(accountTypeFill, form)
  const selectedModes = form.watch("modes") ?? []

  function toggleMode(mode: TenantMode) {
    const current = form.getValues("modes") ?? []
    const next = current.includes(mode)
      ? current.filter((m) => m !== mode)
      : [...current, mode]
    form.setValue("modes", next, { shouldValidate: true })
  }

  return (
    <div>
      <div className="mb-8 text-center">
        <h2
          className="text-2xl font-semibold text-foreground sm:text-3xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          What does your business do?
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Choose one or more that describe how you want to use ewatrade. You can
          add more later.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onNext)} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {MODES.map((mode) => {
            const isSelected = selectedModes.includes(mode.value)
            return (
              <button
                key={mode.value}
                type="button"
                onClick={() => toggleMode(mode.value)}
                className={`group relative w-full rounded-[1.5rem] border-2 p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                  isSelected
                    ? `${mode.selectedBorder} ${mode.selectedBg} shadow-sm`
                    : `${mode.border} bg-background/80 hover:bg-muted/30`
                }`}
              >
                {isSelected && (
                  <div className={`absolute right-3 top-3 ${mode.color}`}>
                    <HugeiconsIcon
                      icon={CheckmarkCircle01Icon}
                      strokeWidth={2}
                      className="size-4"
                    />
                  </div>
                )}
                <div
                  className={`mb-3 inline-flex size-10 items-center justify-center rounded-2xl ${mode.bg} ${mode.color}`}
                >
                  <HugeiconsIcon
                    icon={mode.icon}
                    strokeWidth={2}
                    className="size-5"
                  />
                </div>
                <p className="text-sm font-semibold text-foreground">
                  {mode.title}
                </p>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                  {mode.description}
                </p>
              </button>
            )
          })}
        </div>

        {form.formState.errors.modes && (
          <p className="text-center text-sm text-destructive">
            {form.formState.errors.modes.message}
          </p>
        )}

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            size="lg"
            className="rounded-full px-8"
            disabled={selectedModes.length === 0}
          >
            Continue
          </Button>
        </div>
      </form>

      <DevFormFillButton onFill={fill} label="Fill step 1" />
    </div>
  )
}
