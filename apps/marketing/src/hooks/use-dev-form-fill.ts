"use client"

import type {
  FieldValues,
  Path,
  PathValue,
  UseFormReturn,
} from "react-hook-form"

/**
 * Hook that provides a `fill()` function for quickly populating a react-hook-form
 * in development mode. Does nothing in production.
 */
export function useDevFormFill<T extends FieldValues>(
  definition: Partial<T>,
  form: UseFormReturn<T>,
) {
  const isDev = process.env.NODE_ENV === "development"

  function fill() {
    if (!isDev) return
    for (const [key, value] of Object.entries(definition)) {
      form.setValue(key as Path<T>, value as PathValue<T, Path<T>>, {
        shouldValidate: false,
        shouldDirty: true,
      })
    }
  }

  return { fill, isDev }
}
