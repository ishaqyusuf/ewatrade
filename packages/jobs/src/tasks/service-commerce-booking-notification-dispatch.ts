import { task } from "@trigger.dev/sdk/v3"

import {
  type ServiceCommerceBookingNotificationDispatchPayload,
  serviceCommerceBookingNotificationDispatchHandler,
} from "../handlers/service-commerce-booking-notification-dispatch"

export const serviceCommerceBookingNotificationDispatch = task({
  id: "service-commerce.booking-notification-dispatch",
  maxDuration: 60,
  queue: { concurrencyLimit: 10 },
  retry: { maxAttempts: 3 },
  run: async (input: ServiceCommerceBookingNotificationDispatchPayload) => {
    await serviceCommerceBookingNotificationDispatchHandler(input, 1)
  },
})
