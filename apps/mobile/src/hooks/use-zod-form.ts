import { zodResolver } from "@hookform/resolvers/zod"
import {
  type FieldValues,
  type Resolver,
  type UseFormProps,
  useForm,
} from "react-hook-form"
import type { z } from "zod"

export const useZodForm = <TValues extends FieldValues>(
  schema: z.ZodType<TValues>,
  options?: Omit<UseFormProps<TValues>, "resolver">,
) => {
  return useForm<TValues>({
    resolver: zodResolver(schema as never) as unknown as Resolver<TValues>,
    ...options,
  })
}
