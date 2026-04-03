import type { NotificationStore } from "./store"
import type {
  NotificationInput,
  NotificationRecord,
  NotificationState
} from "./types"

const DEFAULT_DURATION_MS = 5_000

let notificationCount = 0

function createNotificationId() {
  notificationCount += 1
  return `notification-${notificationCount}`
}

function createNotificationRecord(input: NotificationInput): NotificationRecord {
  return {
    action: input.action,
    channels: input.channels ?? ["in_app"],
    createdAt: new Date().toISOString(),
    description: input.description,
    durationMs: input.durationMs ?? DEFAULT_DURATION_MS,
    id: input.id ?? createNotificationId(),
    notificationType: input.notificationType,
    recipients: input.recipients ?? [],
    status: "active",
    title: input.title,
    variant: input.variant ?? "info"
  }
}

export function createMemoryNotificationStore(
  initialState: NotificationState = { notifications: [] }
): NotificationStore {
  let state = initialState
  const listeners = new Set<() => void>()

  function emit() {
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    clear() {
      state = { notifications: [] }
      emit()
    },
    dismiss(notificationId) {
      state = {
        notifications: state.notifications.map((notification) =>
          notification.id === notificationId
            ? {
                ...notification,
                status: "dismissed"
              }
            : notification
        )
      }
      emit()
    },
    getState() {
      return state
    },
    publish(input) {
      const notification = createNotificationRecord(input)

      state = {
        notifications: [notification, ...state.notifications]
      }

      emit()

      return notification.id
    },
    remove(notificationId) {
      state = {
        notifications: state.notifications.filter(
          (notification) => notification.id !== notificationId
        )
      }
      emit()
    },
    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    }
  }
}
