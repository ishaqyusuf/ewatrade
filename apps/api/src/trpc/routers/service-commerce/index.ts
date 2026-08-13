import { mergeRouters } from "../../init"
import { serviceCommerceAccessRouter } from "./access"
import { serviceCommerceActionsRouter } from "./actions"
import { serviceCommerceBookingsRouter } from "./bookings"
import { serviceCommerceCatalogRouter } from "./catalog"
import { serviceCommerceChannelsRouter } from "./channels"
import { serviceCommerceConversationsRouter } from "./conversations"
import { serviceCommerceCustomerConversationsRouter } from "./customer-conversations"
import { serviceCommerceFulfillmentRouter } from "./fulfillment"
import { serviceCommerceInquiryRouter } from "./inquiries"
import { serviceCommerceIntakeRouter } from "./intake"
import { serviceCommerceMediaRouter } from "./media"
import { serviceCommercePolicyRouter } from "./policy"
import { serviceCommerceReportingRouter } from "./reporting"

export const serviceCommerceRouter = mergeRouters(
  serviceCommerceAccessRouter,
  serviceCommerceActionsRouter,
  serviceCommerceBookingsRouter,
  serviceCommerceCatalogRouter,
  serviceCommerceChannelsRouter,
  serviceCommerceConversationsRouter,
  serviceCommerceCustomerConversationsRouter,
  serviceCommerceFulfillmentRouter,
  serviceCommerceInquiryRouter,
  serviceCommerceIntakeRouter,
  serviceCommerceMediaRouter,
  serviceCommercePolicyRouter,
  serviceCommerceReportingRouter,
)
