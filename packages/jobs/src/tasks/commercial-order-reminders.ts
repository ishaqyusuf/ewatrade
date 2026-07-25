import { schedules } from "@trigger.dev/sdk/v3"

import { commercialOrderRemindersHandler } from "../handlers/commercial-order-reminders"

export const commercialOrderReminders = schedules.task({
  cron: "0 * * * *",
  id: "orders.fulfillment-reminders",
  maxDuration: 300,
  queue: { concurrencyLimit: 1 },
  run: async () => commercialOrderRemindersHandler(),
})
