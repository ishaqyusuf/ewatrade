import {
  initializeCustomerConversationStore,
  setPendingCustomerTransfer,
} from "@/lib/customer-conversation-store"
import { resolveCustomerDeepLink } from "@/lib/customer-deep-link"

export async function redirectSystemPath({
  path,
}: {
  initial: boolean
  path: string
}) {
  const resolved = resolveCustomerDeepLink(path)
  if (resolved.pendingTransfer) {
    await initializeCustomerConversationStore()
    setPendingCustomerTransfer(resolved.pendingTransfer)
  }
  return resolved.path
}
