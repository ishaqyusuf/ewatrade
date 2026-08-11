import { task } from "@trigger.dev/sdk/v3"

import {
  type ServiceCommerceCustomerNotificationDispatchPayload,
  serviceCommerceCustomerNotificationDispatchHandler,
} from "../handlers/service-commerce-customer-notification-dispatch"

export const serviceCommerceCustomerNotificationDispatch = task({
  id: "service-commerce.customer-notification-dispatch",
  maxDuration: 60,
  queue: { concurrencyLimit: 10 },
  retry: { maxAttempts: 3 },
  run: async (input: ServiceCommerceCustomerNotificationDispatchPayload) => {
    await serviceCommerceCustomerNotificationDispatchHandler(input)
  },
})
