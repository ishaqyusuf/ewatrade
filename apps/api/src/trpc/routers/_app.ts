import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"
import { createTRPCRouter } from "../init"
import { authRouter } from "./auth"
import { catalogRouter } from "./catalog"
import { inventoryRouter } from "./inventory"
import { ordersRouter } from "./orders"
import { offlineRouter } from "./offline"
import { serviceAccessRouter } from "./service-access"
import { serviceCommunicationsRouter } from "./service-communications"
import { servicesRouter } from "./services"
import { serviceReportingRouter } from "./service-reporting"
import { retailOpsRouter } from "./retail-ops"
import { tenantRouter } from "./tenant"

export const appRouter = createTRPCRouter({
  auth: authRouter,
  catalog: catalogRouter,
  inventory: inventoryRouter,
  orders: ordersRouter,
  offline: offlineRouter,
  serviceAccess: serviceAccessRouter,
  serviceCommunications: serviceCommunicationsRouter,
  services: servicesRouter,
  serviceReporting: serviceReportingRouter,
  retailOps: retailOpsRouter,
  tenant: tenantRouter,
})

export type AppRouter = typeof appRouter
export type RouterInputs = inferRouterInputs<AppRouter>
export type RouterOutputs = inferRouterOutputs<AppRouter>
