import { mergeRouters } from "../../init"
import { serviceCommerceAccessRouter } from "./access"
import { serviceCommerceCatalogRouter } from "./catalog"
import { serviceCommerceInquiryRouter } from "./inquiries"
import { serviceCommercePolicyRouter } from "./policy"

export const serviceCommerceRouter = mergeRouters(
  serviceCommerceAccessRouter,
  serviceCommerceCatalogRouter,
  serviceCommerceInquiryRouter,
  serviceCommercePolicyRouter,
)
