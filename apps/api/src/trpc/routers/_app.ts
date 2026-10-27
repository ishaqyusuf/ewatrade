import { isQaAcceleratorClientMode } from "@ewatrade/utils/qa-accelerator"
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server"
import { createTRPCRouter } from "../init"
import { accountPrivacyRouter } from "./account-privacy"
import { activityRouter } from "./activity"
import { assistantRouter } from "./assistant"
import { authRouter } from "./auth"
import { businessBankingRouter } from "./business-banking"
import { businessNotificationsRouter } from "./business-notifications"
import { businessReportingRouter } from "./business-reporting"
import { catalogRouter } from "./catalog"
import { customerLedgerRouter } from "./customer-ledger"
import { customerMessagesRouter } from "./customer-messages"
import { customersRouter } from "./customers"
import { domainsRouter } from "./domains"
import { financeRouter } from "./finance"
import { inventoryRouter } from "./inventory"
import { locationRouter } from "./location"
import { offlineRouter } from "./offline"
import { ordersRouter } from "./orders"
import { prescriptionAccessRouter } from "./prescription-access"
import { prescriptionsRouter } from "./prescriptions"
import { productAssistantRouter } from "./product-assistant"
import { qaAccessRouter, qaPhoneAccessRouter } from "./qa-access"
import { qaMaintenanceRouter } from "./qa-maintenance"
import { qaToolsRouter } from "./qa-tools"
import { retailOpsRouter } from "./retail-ops"
import { searchRouter } from "./search"
import { serviceAccessRouter } from "./service-access"
import { serviceAssistantBookingsRouter } from "./service-assistant-bookings"
import { serviceAssistantIntakeRouter } from "./service-assistant-intake"
import { serviceAssistantRequestsRouter } from "./service-assistant-requests"
import { serviceAssistantWorkRouter } from "./service-assistant-work"
import { serviceCommerceRouter } from "./service-commerce"
import { serviceCommunicationsRouter } from "./service-communications"
import { serviceReportingRouter } from "./service-reporting"
import { servicesRouter } from "./services"
import { setupAssistantRouter } from "./setup-assistant"
import { storeSubscriptionsRouter } from "./store-subscriptions"
import { storefrontRouter } from "./storefront"
import { storesRouter } from "./stores"
import { tenantRouter } from "./tenant"

const qaAccessRegistration: { qaAccess: typeof qaAccessRouter } =
  isQaAcceleratorClientMode(process.env.APP_ENV ?? process.env.NODE_ENV)
    ? { qaAccess: qaAccessRouter }
    : { qaAccess: qaPhoneAccessRouter as typeof qaAccessRouter }

export const appRouter = createTRPCRouter({
  assistantChannels: assistantChannelsRouter,
  activity: activityRouter,
  businessNotifications: businessNotificationsRouter,
  businessReporting: businessReportingRouter,
  businessBanking: businessBankingRouter,
  auth: authRouter,
  storeSubscriptions: storeSubscriptionsRouter,
  accountPrivacy: accountPrivacyRouter,
  catalog: catalogRouter,
  customers: customersRouter,
  customerMessages: customerMessagesRouter,
  inventory: inventoryRouter,
  location: locationRouter,
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
  serviceAssistantBookings: serviceAssistantBookingsRouter,
  serviceAssistantIntake: serviceAssistantIntakeRouter,
  serviceAssistantRequests: serviceAssistantRequestsRouter,
  serviceAssistantWork: serviceAssistantWorkRouter,
  serviceReporting: serviceReportingRouter,
  retailOps: retailOpsRouter,
  search: searchRouter,
  setupAssistant: setupAssistantRouter,
  productAssistant: productAssistantRouter,
  assistant: assistantRouter,
  tenant: tenantRouter,
  stores: storesRouter,
  storefront: storefrontRouter,
})

export type AppRouter = typeof appRouter
export type RouterInputs = inferRouterInputs<AppRouter>
export type RouterOutputs = inferRouterOutputs<AppRouter>
import { assistantChannelsRouter } from "./assistant-channels"
