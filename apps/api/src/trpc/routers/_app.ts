import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"
import { createTRPCRouter } from "../init"
import { authRouter } from "./auth"
import { catalogRouter } from "./catalog"
import { customersRouter } from "./customers"
import { domainsRouter } from "./domains"
import { inventoryRouter } from "./inventory"
import { offlineRouter } from "./offline"
import { ordersRouter } from "./orders"
import { retailOpsRouter } from "./retail-ops"
import { searchRouter } from "./search"
import { serviceAccessRouter } from "./service-access"
import { serviceCommunicationsRouter } from "./service-communications"
import { serviceReportingRouter } from "./service-reporting"
import { servicesRouter } from "./services"
import { tenantRouter } from "./tenant"

export const appRouter = createTRPCRouter({
  auth: authRouter,
  catalog: catalogRouter,
  customers: customersRouter,
  inventory: inventoryRouter,
  domains: domainsRouter,
  orders: ordersRouter,
  offline: offlineRouter,
  serviceAccess: serviceAccessRouter,
  serviceCommunications: serviceCommunicationsRouter,
  services: servicesRouter,
  serviceReporting: serviceReportingRouter,
  retailOps: retailOpsRouter,
  search: searchRouter,
  tenant: tenantRouter,
})

export type AppRouter = typeof appRouter
export type RouterInputs = inferRouterInputs<AppRouter>
export type RouterOutputs = inferRouterOutputs<AppRouter>
