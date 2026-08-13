type SentryLikeEvent = {
  breadcrumbs?: Array<{ data?: Record<string, unknown>; message?: string }>
  request?: { headers?: Record<string, unknown>; url?: string }
}

type SentryLikeBreadcrumb = {
  data?: Record<string, unknown>
  message?: string
}

function redactTransfer(value: unknown) {
  if (typeof value !== "string") return value
  return value.replace(/([#&?]transfer=)[A-Za-z0-9_-]{1,512}/g, "$1[Filtered]")
}

export function redactCustomerCapabilitiesFromCrashEvent<
  Event extends SentryLikeEvent,
>(event: Event): Event {
  if (event.request?.url)
    event.request.url = redactTransfer(event.request.url) as string
  for (const key of Object.keys(event.request?.headers ?? {})) {
    if (key.toLowerCase().startsWith("x-store-conversation-")) {
      delete event.request?.headers?.[key]
    }
  }
  for (const breadcrumb of event.breadcrumbs ?? []) {
    redactCustomerCapabilitiesFromBreadcrumb(breadcrumb)
  }
  return event
}

export function redactCustomerCapabilitiesFromBreadcrumb<
  Breadcrumb extends SentryLikeBreadcrumb,
>(breadcrumb: Breadcrumb): Breadcrumb {
  if (breadcrumb.message) {
    breadcrumb.message = redactTransfer(breadcrumb.message) as string
  }
  for (const [key, value] of Object.entries(breadcrumb.data ?? {})) {
    if (breadcrumb.data) breadcrumb.data[key] = redactTransfer(value)
  }
  return breadcrumb
}
