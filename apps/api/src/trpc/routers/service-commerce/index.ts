import { mergeRouters } from "../../init"
import { serviceCommerceAccessRouter } from "./access"
import { serviceCommerceInquiryRouter } from "./inquiries"

export const serviceCommerceRouter = mergeRouters(
  serviceCommerceAccessRouter,
  serviceCommerceInquiryRouter,
)
