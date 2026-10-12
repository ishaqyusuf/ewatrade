import { ClassicSaleCheckout } from "@/components/mobile/appearances/classic/create-sale-checkout"
import type { SaleStepViewProps } from "./create-sale-presentation"

export function CreateSaleReview(props: SaleStepViewProps) {
  return <ClassicSaleCheckout {...props} />
}
