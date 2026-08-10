import { mergeRouters } from "../../init"
import { serviceCommerceAccessRouter } from "./access"
import { serviceCommerceInquiryRouter } from "./inquiries"
import { serviceCommercePolicyRouter } from "./policy"

export const serviceCommerceRouter = mergeRouters(
  serviceCommerceAccessRouter,
  serviceCommerceInquiryRouter,
  serviceCommercePolicyRouter,
)
