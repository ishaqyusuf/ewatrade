"use client"

import {
  createMemoryNotificationStore,
  type NotificationInput,
  type NotificationRecord,
  type NotificationStore,
  type NotificationVariant
} from "@ewatrade/notifications"
import { createContext, type ReactNode, use, useEffect, useRef, useSyncExternalStore } from "react"

import { NotificationsViewport } from "./viewport"

type NotificationsContextValue = {
  clear: () => void
  dismiss: (notificationId: string) => void
  notifications: NotificationRecord[]
  notify: (input: NotificationInput) => string
  showError: (
    title: string,
    input?: Omit<NotificationInput, "title" | "variant" | "notificationType"> & {
      notificationType?: string
    }
  ) => string
  showInfo: (
    title: string,
    input?: Omit<NotificationInput, "title" | "variant" | "notificationType"> & {
      notificationType?: string
    }
  ) => string
  showSuccess: (
    title: string,
    input?: Omit<NotificationInput, "title" | "variant" | "notificationType"> & {
      notificationType?: string
    }
  ) => string
  showWarning: (
    title: string,
    input?: Omit<NotificationInput, "title" | "variant" | "notificationType"> & {
      notificationType?: string
    }
  ) => string
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

function useNotificationStore(store: NotificationStore) {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState)
}

export function NotificationsProvider({
  children,
  store
}: {
  children: ReactNode
  store?: NotificationStore
}) {
  const storeRef = useRef<NotificationStore>(store ?? createMemoryNotificationStore())
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const state = useNotificationStore(storeRef.current)

  useEffect(() => {
    for (const notification of state.notifications) {
      if (
        notification.status !== "active" ||
        notification.durationMs === undefined ||
        timersRef.current.has(notification.id)
      ) {
        continue
      }

      const timer = setTimeout(() => {
        storeRef.current.dismiss(notification.id)
      }, notification.durationMs)

      timersRef.current.set(notification.id, timer)
    }

    for (const notification of state.notifications) {
      if (notification.status !== "dismissed") {
        continue
      }

      const timer = timersRef.current.get(notification.id)

      if (timer) {
        clearTimeout(timer)
        timersRef.current.delete(notification.id)
      }
    }
  }, [state.notifications])

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer)
      }

      timersRef.current.clear()
    }
  }, [])

  function notifyWithVariant(
    variant: NotificationVariant,
    title: string,
    input?: Omit<NotificationInput, "title" | "variant" | "notificationType"> & {
      notificationType?: string
    }
  ) {
    return notify({
      ...input,
      notificationType: input?.notificationType ?? "app.notification",
      title,
      variant
    })
  }

  function notify(input: NotificationInput) {
    return storeRef.current.publish(input)
  }

  const value: NotificationsContextValue = {
    clear() {
      storeRef.current.clear()
    },
    dismiss(notificationId) {
      storeRef.current.dismiss(notificationId)
    },
    notifications: state.notifications.filter(
      (notification) => notification.status === "active"
    ),
    notify,
    showError(title, input) {
      return notifyWithVariant("error", title, input)
    },
    showInfo(title, input) {
      return notifyWithVariant("info", title, input)
    },
    showSuccess(title, input) {
      return notifyWithVariant("success", title, input)
    },
    showWarning(title, input) {
      return notifyWithVariant("warning", title, input)
    }
  }

  return (
    <NotificationsContext value={value}>
      {children}
      <NotificationsViewport notifications={value.notifications} onDismiss={value.dismiss} />
    </NotificationsContext>
  )
}

export function useNotifications() {
  const context = use(NotificationsContext)

  if (!context) {
    throw new Error("useNotifications must be used within NotificationsProvider.")
  }

  return context
}
