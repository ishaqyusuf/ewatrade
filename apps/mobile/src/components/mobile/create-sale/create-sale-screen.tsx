import { useMobileDesign } from "@/hooks/use-mobile-design"
import type { CreateSaleContentProps } from "./create-sale-model"
import { CreateSaleView } from "./create-sale-view"
import { useCreateSale } from "./use-create-sale"

export type { CreateSaleCompletion } from "./create-sale-model"

export function CreateSaleContent(props: CreateSaleContentProps) {
  const model = useCreateSale(props)
  const appearance = useMobileDesign("create-sale")
  return <CreateSaleView model={model} appearance={appearance} />
}
