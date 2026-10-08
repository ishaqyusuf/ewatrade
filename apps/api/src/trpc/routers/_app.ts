import { isQaAcceleratorClientMode } from "@ewatrade/utils/qa-accelerator"
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"
import { createTRPCRouter } from "../init"
import { accountPrivacyRouter } from "./account-privacy"
import { authRouter } from "./auth"
import { catalogRouter } from "./catalog"
import { customerLedgerRouter } from "./customer-ledger"
import { customersRouter } from "./customers"
import { domainsRouter } from "./domains"
import { financeRouter } from "./finance"
import { inventoryRouter } from "./inventory"
import { offlineRouter } from "./offline"
import { ordersRouter } from "./orders"
import { prescriptionAccessRouter } from "./prescription-access"
import { prescriptionsRouter } from "./prescriptions"
import { qaAccessRouter } from "./qa-access"
import { qaMaintenanceRouter } from "./qa-maintenance"
import { qaToolsRouter } from "./qa-tools"
import { retailOpsRouter } from "./retail-ops"
import { searchRouter } from "./search"
import { serviceAccessRouter } from "./service-access"
import { serviceCommerceRouter } from "./service-commerce"
import { serviceCommunicationsRouter } from "./service-communications"
import { serviceReportingRouter } from "./service-reporting"
import { servicesRouter } from "./services"
import { setupAssistantRouter } from "./setup-assistant"
import { storeSubscriptionsRouter } from "./store-subscriptions"
import { storesRouter } from "./stores"
import { tenantRouter } from "./tenant"

const qaAccessRegistration: { qaAccess: typeof qaAccessRouter } =
  isQaAcceleratorClientMode(process.env.APP_ENV ?? process.env.NODE_ENV)
    ? { qaAccess: qaAccessRouter }
    : ({} as { qaAccess: typeof qaAccessRouter })

export const appRouter = createTRPCRouter({
  auth: authRouter,
  storeSubscriptions: storeSubscriptionsRouter,
  accountPrivacy: accountPrivacyRouter,
  catalog: catalogRouter,
  customers: customersRouter,
  inventory: inventoryRouter,
  finance: financeRouter,
  customerLedger: customerLedgerRouter,
  domains: domainsRouter,
  orders: ordersRouter,
  prescriptions: prescriptionsRouter,
  prescriptionAccess: prescriptionAccessRouter,
  offline: offlineRouter,
  qaMaintenance: qaMaintenanceRouter,
  qaTools: qaToolsRouter,
  ...qaAccessRegistration,
  serviceAccess: serviceAccessRouter,
  serviceCommerce: serviceCommerceRouter,
  serviceCommunications: serviceCommunicationsRouter,
  services: servicesRouter,
  serviceReporting: serviceReportingRouter,
  retailOps: retailOpsRouter,
  search: searchRouter,
  setupAssistant: setupAssistantRouter,
  tenant: tenantRouter,
  stores: storesRouter,
})

export type AppRouter = typeof appRouter
export type RouterInputs = inferRouterInputs<AppRouter>
export type RouterOutputs = inferRouterOutputs<AppRouter>
