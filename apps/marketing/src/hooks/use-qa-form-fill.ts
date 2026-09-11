"use client"

import { useOptionalQaWebAccelerator } from "@/components/qa/qa-web-accelerator"
import { createQaFixtureContext } from "@ewatrade/utils/qa-fixtures"
import { useCallback, useRef, useState } from "react"
import type {
  FieldValues,
  Path,
  PathValue,
  UseFormReturn,
} from "react-hook-form"

export function useQaFormFill<T extends FieldValues>(
  recipe: (
    context: ReturnType<typeof createQaFixtureContext>,
    sequence: number,
  ) => Partial<T>,
  form: UseFormReturn<T>,
) {
  const qa = useOptionalQaWebAccelerator()
  const [canUndo, setCanUndo] = useState(false)
  const snapshot = useRef<T | null>(null)
  const sequence = useRef(0)

  const fill = useCallback(() => {
    if (!qa?.authorization || qa.status !== "authorized") return
    if (
      form.formState.isDirty &&
      !window.confirm("Replace your current draft with QA fixture values?")
    ) {
      return
    }
    snapshot.current = form.getValues()
    sequence.current += 1
    const context = createQaFixtureContext({
      currencyCode: "NGN",
      domain: qa.authorization.qaDomain,
      invocationId: crypto.randomUUID(),
      seed: `${qa.authorization.testerIdentity}:${sequence.current}`,
      storeId: "signup",
      tenantId: "signup",
      timezone: "Africa/Lagos",
    })
    for (const [key, value] of Object.entries(
      recipe(context, sequence.current),
    )) {
      form.setValue(key as Path<T>, value as PathValue<T, Path<T>>, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      })
    }
    setCanUndo(true)
  }, [form, qa, recipe])

  const undo = useCallback(() => {
    if (!snapshot.current) return
    form.reset(snapshot.current, { keepDirty: true, keepTouched: true })
    snapshot.current = null
    setCanUndo(false)
  }, [form])

  return {
    canUndo,
    fill,
    isAvailable: qa?.status === "authorized",
    qaDomain: qa?.authorization?.qaDomain ?? null,
    undo,
  }
}
