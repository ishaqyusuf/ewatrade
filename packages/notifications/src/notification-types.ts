import type { z } from "zod"

import type { NotificationContactKind } from "./contacts"
import type {
  NotificationChannel,
  NotificationDispatch,
  NotificationInput,
  NotificationVariant
} from "./core-types"
import { marketingEarlyAccessRequested, marketingWaitlistJoined } from "./types"

type BuiltNotificationInput = Omit<NotificationInput, "action">

export type NotificationTypeDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny> = {
  defaultChannels?: NotificationChannel[]
  defaultRecipients?: NotificationContactKind[]
  description?: string
  schema: TSchema
  title?: string
  variant?: NotificationVariant
}

export type NotificationTypeRegistry = Record<string, NotificationTypeDefinition>

export function defineNotificationType<TSchema extends z.ZodTypeAny>(
  definition: NotificationTypeDefinition<TSchema>
) {
  return definition
}

export function defineNotificationTypes<TRegistry extends NotificationTypeRegistry>(
  registry: TRegistry
) {
  return registry
}

export function createNotificationFromType<
  TRegistry extends NotificationTypeRegistry,
  TType extends keyof TRegistry & string
>(
  registry: TRegistry,
  notificationType: TType,
  payload: z.infer<TRegistry[TType]["schema"]>,
  input?: Omit<
    NotificationInput,
    "description" | "notificationType" | "title" | "variant"
  > & {
    description?: string
    title?: string
    variant?: NotificationVariant
  }
): BuiltNotificationInput {
  const definition = registry[notificationType]

  if (!definition) {
    throw new Error(`Unknown notification type: ${notificationType}`)
  }

  definition.schema.parse(payload)

  return {
    ...input,
    channels: input?.channels ?? definition.defaultChannels ?? ["in_app"],
    description: input?.description ?? definition.description,
    notificationType,
    title: input?.title ?? definition.title ?? "Notification",
    variant: input?.variant ?? definition.variant ?? "info"
  }
}

export function createNotificationDispatchFromType<
  TRegistry extends NotificationTypeRegistry,
  TType extends keyof TRegistry & string
>(
  registry: TRegistry,
  notificationType: TType,
  payload: z.infer<TRegistry[TType]["schema"]>,
  input?: Omit<
    NotificationDispatch,
    | "channels"
    | "description"
    | "notificationType"
    | "payload"
    | "recipients"
    | "title"
    | "variant"
  > & {
    channels?: NotificationChannel[]
    description?: string
    recipients?: NotificationDispatch["recipients"]
    title?: string
    variant?: NotificationVariant
  }
): NotificationDispatch {
  const definition = registry[notificationType]

  if (!definition) {
    throw new Error(`Unknown notification type: ${notificationType}`)
  }

  definition.schema.parse(payload)

  return {
    ...input,
    channels: input?.channels ?? definition.defaultChannels ?? ["in_app"],
    description: input?.description ?? definition.description,
    notificationType,
    payload,
    recipients: input?.recipients ?? [],
    title: input?.title ?? definition.title ?? "Notification",
    variant: input?.variant ?? definition.variant ?? "info"
  }
}

export const ewatradeNotificationTypes = defineNotificationTypes({
  marketing_early_access_requested: marketingEarlyAccessRequested,
  marketing_waitlist_joined: marketingWaitlistJoined
})
