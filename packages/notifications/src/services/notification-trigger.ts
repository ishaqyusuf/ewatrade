import {
  buildNotificationEvent,
  createNotificationChannelTriggers,
  normalizeRecipients,
  type EwatradeNotificationType,
  type NotificationRecipients,
  type NotificationTriggerInput
} from "../payload-utils"

type NotificationServiceContext = {
  userId?: string | null
}

type WithoutAuthor<TType extends EwatradeNotificationType> = Omit<
  NotificationTriggerInput<TType>,
  "author"
> & {
  author?: NotificationTriggerInput<TType>["author"]
}

type SendFn = <TType extends EwatradeNotificationType>(
  type: TType,
  input: NotificationTriggerInput<TType>
) => unknown | Promise<unknown>

export class NotificationService {
  private recipients: NotificationRecipients = null
  public readonly channel: ReturnType<typeof createNotificationChannelTriggers>

  constructor(
    private readonly sendFn: SendFn,
    private readonly ctx: NotificationServiceContext = {}
  ) {
    this.channel = createNotificationChannelTriggers({
      getStoredRecipients: () => this.recipients,
      send: (type, input) => this.emit(type, input as never)
    })
  }

  private async emit<TType extends EwatradeNotificationType>(
    type: TType,
    input: WithoutAuthor<TType>
  ) {
    const event = buildNotificationEvent(type, input, this.ctx.userId)

    return this.sendFn(type, {
      author: event.author,
      channels: event.channels,
      payload: event.payload,
      recipients: event.recipients
    } as NotificationTriggerInput<TType>)
  }

  async send<TType extends EwatradeNotificationType>(
    type: TType,
    input: WithoutAuthor<TType>
  ) {
    return this.emit(type, input)
  }

  setRecipients(recipients: NotificationRecipients) {
    this.recipients = normalizeRecipients(recipients)
    return this
  }
}
