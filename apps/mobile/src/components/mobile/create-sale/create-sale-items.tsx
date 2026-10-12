import { ClassicSaleItems } from "@/components/mobile/appearances/classic/create-sale-items"
import type { SaleStepViewProps } from "./create-sale-presentation"

export function CreateSaleItems(props: SaleStepViewProps) {
  return <ClassicSaleItems {...props} />
}
