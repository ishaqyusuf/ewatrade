"use client"

import { FieldGroup, Input } from "@ewatrade/ui"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { z } from "zod"

import { FormFeedback } from "@/components/forms/form-feedback"
import { createSupplierFixture } from "@/components/qa/fixture-recipes"
import { QaDashboardQuickFill } from "@/components/qa/qa-quick-fill"
import { useFinanceCommand } from "@/hooks/use-finance-command"
import { useFinanceParams } from "@/hooks/use-finance-params"
import { useZodForm } from "@/hooks/use-zod-form"
import { useTRPC } from "@/trpc/client"

import { useFinanceForm } from "./form-context"
import { FinanceField, FinanceFormFooter } from "./form-fields"
import type { FinanceBook } from "./types"
import { useCompleteFinanceForm } from "./use-complete-finance-form"

const schema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z0-9][A-Z0-9_-]{0,39}$/,
      "Use up to 40 letters, numbers, - or _, with no spaces.",
    ),
  name: z
    .string()
    .trim()
    .min(1, "Enter the Supplier's name.")
    .max(160, "Use 160 characters or fewer."),
})

type Values = z.infer<typeof schema>

/** The next SUP-0000 code after the highest one in use. */
function nextSupplierCode(codes: string[]) {
  const numbers = codes
    .map((code) => /^SUP-(\d+)$/.exec(code)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number)
  return `SUP-${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(4, "0")}`
}

/** Add a Supplier in its own sheet. No money moves, so it saves without a review. */
export function FinanceSupplierForm({ book }: { book: FinanceBook }) {
  const trpc = useTRPC()
  const mutation = useMutation(trpc.finance.createSupplier.mutationOptions())
  const [saved, setSaved] = useState("")
  const command = useFinanceCommand(
    useCompleteFinanceForm(saved ? `Supplier “${saved}” added.` : undefined),
    book.id,
    "createSupplier",
  )
  const { close } = useFinanceParams()
  const suppliers = useQuery(
    trpc.finance.suppliers.queryOptions({ bookId: book.id, limit: 50 }),
  )
  const codes = (suppliers.data?.data ?? []).map((supplier) => supplier.code)
  const form = useZodForm<Values>(schema, {
    defaultValues: { code: "", name: "" },
  })
  useEffect(() => {
    if (suppliers.data && !form.getValues("code"))
      form.setValue("code", nextSupplierCode(codes))
  }, [suppliers.data, codes, form])
  const quickFillSnapshot = useRef<Values | null>(null)
  const [canUndoQuickFill, setCanUndoQuickFill] = useState(false)
  const { setLocked } = useFinanceForm()
  useEffect(() => {
    setLocked(command.pending)
    return () => setLocked(false)
  }, [command.pending, setLocked])

  function submit(values: Values) {
    const payload = {
      bookId: book.id,
      code: values.code.trim().toUpperCase(),
      name: values.name.trim(),
    }
    if (!command.uncertain) {
      const taken = suppliers.data?.data.find(
        (supplier) => supplier.code === payload.code,
      )
      if (taken) {
        form.setError("code", {
          message: `${payload.code} is already used by ${taken.name}.`,
        })
        return
      }
    }
    setSaved(payload.name)
    void command.run({
      payload,
      write: (clientCommandId) =>
        mutation.mutateAsync({ ...payload, clientCommandId }),
    })
  }

  return (
    <form onSubmit={form.handleSubmit(submit)}>
      <FieldGroup className="min-w-0 grid gap-5">
        <p className="text-sm text-muted-foreground">
          Someone you buy from. Adding them doesn&apos;t record any money.
        </p>
        <QaDashboardQuickFill
          canUndo={canUndoQuickFill}
          formId="dashboard.finance.supplier"
          isDirty={form.formState.isDirty}
          onFill={(context, sequence) => {
            quickFillSnapshot.current = form.getValues()
            const fixture = createSupplierFixture(context, sequence)
            form.reset(
              { ...form.getValues(), code: fixture.code, name: fixture.name },
              { keepDefaultValues: true },
            )
            setCanUndoQuickFill(true)
          }}
          onUndo={() => {
            if (!quickFillSnapshot.current) return
            form.reset(quickFillSnapshot.current, { keepDefaultValues: true })
            quickFillSnapshot.current = null
            setCanUndoQuickFill(false)
          }}
        />
        <FinanceField label="Name" error={form.formState.errors.name?.message}>
          <Input
            autoComplete="organization"
            maxLength={160}
            placeholder="Business or person's name"
            disabled={!command.ready || command.pending}
            {...form.register("name")}
          />
        </FinanceField>
        <FinanceField
          label="Code"
          description="We suggest the next number. Letters, numbers, - and _ only."
          error={form.formState.errors.code?.message}
        >
          <Input
            autoComplete="off"
            maxLength={40}
            disabled={!command.ready || command.pending}
            {...form.register("code")}
          />
        </FinanceField>
        {command.uncertain && !command.pending ? (
          <FormFeedback appearance="dashboard">
            We couldn't confirm this was saved. Try again: it won't be added
            twice.
          </FormFeedback>
        ) : command.error ? (
          <FormFeedback appearance="dashboard">
            We couldn't add this Supplier. {command.error}
          </FormFeedback>
        ) : null}
        <FinanceFormFooter
          onCancel={() => void close()}
          submitLabel={command.uncertain ? "Try again" : "Add supplier"}
          isSubmitting={command.pending}
          disabled={!command.ready || command.pending}
        />
      </FieldGroup>
    </form>
  )
}
