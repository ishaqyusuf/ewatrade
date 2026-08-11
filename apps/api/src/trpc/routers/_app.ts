import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"
import { createTRPCRouter } from "../init"
import { authRouter } from "./auth"
import { catalogRouter } from "./catalog"
import { customersRouter } from "./customers"
import { domainsRouter } from "./domains"
import { inventoryRouter } from "./inventory"
import { offlineRouter } from "./offline"
import { ordersRouter } from "./orders"
import { prescriptionAccessRouter } from "./prescription-access"
import { prescriptionsRouter } from "./prescriptions"
import { qaMaintenanceRouter } from "./qa-maintenance"
import { retailOpsRouter } from "./retail-ops"
import { searchRouter } from "./search"
import { serviceAccessRouter } from "./service-access"
import { serviceCommerceRouter } from "./service-commerce"
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
  prescriptions: prescriptionsRouter,
  prescriptionAccess: prescriptionAccessRouter,
  offline: offlineRouter,
  qaMaintenance: qaMaintenanceRouter,
  serviceAccess: serviceAccessRouter,
  serviceCommerce: serviceCommerceRouter,
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
