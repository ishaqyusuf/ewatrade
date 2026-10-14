import type { z } from "zod"
import type {
  BusinessActivityDetail,
  BusinessActivityFilterOptions,
  BusinessActivityListInput,
  BusinessActivityPage,
  BusinessEventCatalogItem,
  BusinessNotificationPage,
  BusinessNotificationPolicyView,
  BusinessNotificationPreferenceView,
  BusinessNotificationSubscriptionView,
} from "./contracts"
import type {
  BusinessNotificationListInput,
  BusinessNotificationMarkAllInput,
  BusinessNotificationPolicyInput,
  BusinessNotificationPreferenceInput,
  BusinessNotificationReceiptInput,
  BusinessNotificationSubscriptionInput,
  BusinessNotificationSubscriptionsInput,
  businessActivityFiltersInput,
  businessActivityGetInput,
} from "./inputs"

type Procedure<Input, Output> = { input: Input; output: Output }

/** Planned procedure contract, not evidence that the routers are activated. */
export type BusinessActivityProcedureContract = {
  listPage: Procedure<BusinessActivityListInput, BusinessActivityPage>
  get: Procedure<
    z.input<typeof businessActivityGetInput>,
    BusinessActivityDetail
  >
  filters: Procedure<
    z.input<typeof businessActivityFiltersInput>,
    BusinessActivityFilterOptions
  >
}

export type BusinessNotificationsProcedureContract = {
  listMine: Procedure<BusinessNotificationListInput, BusinessNotificationPage>
  unreadCount: Procedure<void, { count: number; asOf: string }>
  markRead: Procedure<BusinessNotificationReceiptInput, { updated: number }>
  archive: Procedure<BusinessNotificationReceiptInput, { updated: number }>
  markAllRead: Procedure<BusinessNotificationMarkAllInput, { updated: number }>
  myPreferences: Procedure<
    void,
    {
      items: BusinessNotificationPreferenceView[]
      catalog: BusinessEventCatalogItem[]
    }
  >
  updateMyPreferences: Procedure<
    BusinessNotificationPreferenceInput,
    BusinessNotificationPreferenceView
  >
  policy: Procedure<
    void,
    {
      items: BusinessNotificationPolicyView[]
      catalog: BusinessEventCatalogItem[]
    }
  >
  updatePolicy: Procedure<
    BusinessNotificationPolicyInput,
    BusinessNotificationPolicyView
  >
  subscriptions: Procedure<
    BusinessNotificationSubscriptionsInput,
    { items: BusinessNotificationSubscriptionView[]; nextCursor: string | null }
  >
  updateSubscription: Procedure<
    BusinessNotificationSubscriptionInput,
    BusinessNotificationSubscriptionView
  >
}
