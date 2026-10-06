"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import {
  type FieldValues,
  type Resolver,
  type UseFormProps,
  useForm,
} from "react-hook-form"

export function useZodForm<TFieldValues extends FieldValues>(
  schema: object,
  options?: Omit<UseFormProps<TFieldValues>, "resolver">,
) {
  return useForm<TFieldValues>({
    resolver: zodResolver(schema as never) as Resolver<TFieldValues>,
    ...options,
  })
}
