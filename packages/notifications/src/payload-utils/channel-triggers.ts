import { normalizeRecipients } from "./recipients"
import type {
  EwatradeNotificationType,
  NotificationRecipients,
  NotificationTriggerInput
} from "./types"

type SendFn = <TType extends EwatradeNotificationType>(
  type: TType,
  input: NotificationTriggerInput<TType>
) => unknown | Promise<unknown>

type ChannelTriggerFactoryOptions = {
  getStoredRecipients?: () => NotificationRecipients
  send: SendFn
}

function resolveRecipients(
  explicitRecipients: NotificationRecipients | undefined,
  storedRecipients: NotificationRecipients | undefined
) {
  if (explicitRecipients?.length) {
    return normalizeRecipients(explicitRecipients)
  }

  if (storedRecipients?.length) {
    return normalizeRecipients(storedRecipients)
  }

  return null
}

type TriggerInput<TType extends EwatradeNotificationType> = NotificationTriggerInput<TType>

export function createNotificationChannelTriggers(
  options: ChannelTriggerFactoryOptions
) {
  const getStoredRecipients = options.getStoredRecipients ?? (() => null)

  function send<TType extends EwatradeNotificationType>(
    type: TType,
    input: TriggerInput<TType>
  ) {
    const { recipients, ...rest } = input

    return options.send(type, {
      ...rest,
      recipients: resolveRecipients(recipients, getStoredRecipients())
    })
  }

  return {
    marketingEarlyAccessRequested(
      input: TriggerInput<"marketing_early_access_requested">
    ) {
      return send("marketing_early_access_requested", input)
    },
    marketingWaitlistJoined(input: TriggerInput<"marketing_waitlist_joined">) {
      return send("marketing_waitlist_joined", input)
    }
  }
}
