import type { NotificationAuthor } from "./types"

export function resolveNotificationAuthor(input: {
  author?: NotificationAuthor
  authUserId?: string | null
}): NotificationAuthor {
  if (input.author) {
    return input.author
  }

  if (input.authUserId) {
    return {
      id: input.authUserId
    }
  }

  return {
    id: "system"
  }
}
