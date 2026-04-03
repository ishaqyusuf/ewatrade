"use client"

import type { NotificationRecord } from "@ewatrade/notifications"
import { cn } from "@ewatrade/utils"

const accentClasses = {
  error: "border-rose-200/80 bg-rose-50 text-rose-950",
  info: "border-sky-200/80 bg-sky-50 text-sky-950",
  success: "border-emerald-200/80 bg-emerald-50 text-emerald-950",
  warning: "border-amber-200/80 bg-amber-50 text-amber-950"
} as const

export function NotificationsViewport({
  notifications,
  onDismiss
}: {
  notifications: NotificationRecord[]
  onDismiss: (notificationId: string) => void
}) {
  if (notifications.length === 0) {
    return null
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-end p-4 sm:p-6">
      <div className="flex w-full max-w-sm flex-col gap-3">
        {notifications.map((notification) => (
          <div
            aria-live="polite"
            className={cn(
              "pointer-events-auto rounded-3xl border p-4 shadow-xl shadow-black/10 backdrop-blur",
              accentClasses[notification.variant]
            )}
            key={notification.id}
            role="status"
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{notification.title}</p>
                {notification.description ? (
                  <p className="mt-1 text-sm leading-6 opacity-90">
                    {notification.description}
                  </p>
                ) : null}
                <button
                  className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] opacity-80"
                  onClick={() => onDismiss(notification.id)}
                  type="button"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
