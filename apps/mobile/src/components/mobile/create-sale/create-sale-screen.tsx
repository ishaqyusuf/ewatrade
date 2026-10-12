import type { CreateSaleContentProps } from "./create-sale-model"
import { CreateSaleView } from "./create-sale-view"
import { useCreateSale } from "./use-create-sale"

export type { CreateSaleCompletion } from "./create-sale-model"

export function CreateSaleContent(props: CreateSaleContentProps) {
  const model = useCreateSale(props)
  return <CreateSaleView model={model} />
}
