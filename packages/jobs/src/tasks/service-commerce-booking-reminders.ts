import { task } from "@trigger.dev/sdk/v3"

import {
  type ServiceCommerceBookingRemindersPayload,
  serviceCommerceBookingRemindersHandler,
} from "../handlers/service-commerce-booking-reminders"

export const serviceCommerceBookingReminders = task({
  id: "service-commerce.booking-reminders",
  maxDuration: 120,
  queue: { concurrencyLimit: 5 },
  retry: { maxAttempts: 3 },
  run: async (input: ServiceCommerceBookingRemindersPayload) => {
    await serviceCommerceBookingRemindersHandler(input)
  },
})
