import { type TRPCContext, createTRPCRouter } from "../trpc/init"
import { businessBankingRouter } from "../trpc/routers/business-banking"
import { catalogRouter } from "../trpc/routers/catalog"
import { customerLedgerRouter } from "../trpc/routers/customer-ledger"
import { customersRouter } from "../trpc/routers/customers"
import { financeRouter } from "../trpc/routers/finance"
import { inventoryRouter } from "../trpc/routers/inventory"
import { ordersRouter } from "../trpc/routers/orders"
import { retailOpsRouter } from "../trpc/routers/retail-ops"
import { searchRouter } from "../trpc/routers/search"
import { serviceAssistantRequestsRouter } from "../trpc/routers/service-assistant-requests"
import { serviceAssistantWorkRouter } from "../trpc/routers/service-assistant-work"
import { serviceCommunicationsRouter } from "../trpc/routers/service-communications"
import { servicesRouter } from "../trpc/routers/services"
import { storefrontRouter } from "../trpc/routers/storefront"
import { tenantRouter } from "../trpc/routers/tenant"

// As with createBusinessReportingCaller, keep canonical paths for all permission middleware.
const assistantDomainRouter = createTRPCRouter({
  businessBanking: businessBankingRouter,
  catalog: catalogRouter,
  customerLedger: customerLedgerRouter,
  customers: customersRouter,
  finance: financeRouter,
  inventory: inventoryRouter,
  orders: ordersRouter,
  retailOps: retailOpsRouter,
  search: searchRouter,
  serviceAssistantWork: serviceAssistantWorkRouter,
  serviceAssistantRequests: serviceAssistantRequestsRouter,
  serviceCommunications: serviceCommunicationsRouter,
  services: servicesRouter,
  tenant: tenantRouter,
  storefront: storefrontRouter,
})

export function createGeneralDomainCaller(ctx: TRPCContext) {
  return assistantDomainRouter.createCaller(ctx)
}
