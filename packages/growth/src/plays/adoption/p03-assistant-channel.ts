import type { LifecyclePlay } from "../../contract"
import { ADOPTION_CTA, daysSince, isActivatedOrLater } from "./shared"

export const ASSISTANT_CHANNEL_MIN_DAYS = 5

/** P03: activated, but no WhatsApp or Telegram link 5 days in. */
export const assistantChannelPlay: LifecyclePlay = {
  id: "P03_assistant_channel",
  family: "adoption",
  consent: "productTips",
  channels: ["email", "in_app"],
  realtime: false,
  eligible: ({ now, snapshot }) => {
    if (!isActivatedOrLater(snapshot.stage)) return null
    if (snapshot.whatsappLinked || snapshot.telegramLinked) return null
    if (daysSince(snapshot.businessCreatedAt, now) < ASSISTANT_CHANNEL_MIN_DAYS)
      return null
    return {
      periodKey: "once",
      templateKey: "lifecycle-assistant-channel",
      inAppKey: "assistant_channel",
      data: { ordersTotal: snapshot.ordersTotal },
      ctaPath: ADOPTION_CTA.assistantChannel,
    }
  },
  success: {
    windowDays: 14,
    achieved: (_sentOn, current) =>
      current.whatsappLinked || current.telegramLinked,
  },
}
