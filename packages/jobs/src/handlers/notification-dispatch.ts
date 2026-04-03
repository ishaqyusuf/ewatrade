import {
  createMarketingEarlyAccessDispatch,
  createMarketingWaitlistDispatch,
  EmailService,
  planNotificationDeliveries,
  type MarketingEarlyAccessRequestedPayload,
  type MarketingWaitlistJoinedPayload
} from "@ewatrade/notifications"

export type NotificationDispatchPayload =
  | {
      type: "marketing_early_access_requested"
      payload: MarketingEarlyAccessRequestedPayload
    }
  | {
      type: "marketing_waitlist_joined"
      payload: MarketingWaitlistJoinedPayload
    }

export async function notificationDispatchHandler(
  input: NotificationDispatchPayload
) {
  const dispatch =
    input.type === "marketing_early_access_requested"
      ? createMarketingEarlyAccessDispatch(input.payload)
      : createMarketingWaitlistDispatch(input.payload)

  const deliveryPlan = planNotificationDeliveries(dispatch)
  const emailService = new EmailService()

  await emailService.sendBulk(deliveryPlan.dispatches)
}
