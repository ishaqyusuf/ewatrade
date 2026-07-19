import { mergeRouters } from "../init"
import { retailOpsStaffRouter } from "./retail-ops-staff"
import { retailOpsSubscriptionsRouter } from "./retail-ops-subscriptions"

// Staff and subscription administration remain grouped here while operational
// Catalog, Orders, Inventory, offline, and Service APIs use dedicated routers.
export const retailOpsRouter = mergeRouters(
  retailOpsStaffRouter,
  retailOpsSubscriptionsRouter,
)
