export type CustomerConversationTransferSignal = {
  publish: () => void
  read: () => number
  subscribe: (listener: () => void) => () => void
}

export function createCustomerConversationTransferSignal(): CustomerConversationTransferSignal {
  let revision = 0
  const listeners = new Set<() => void>()

  return {
    publish() {
      revision += 1
      for (const listener of listeners) listener()
    },
    read() {
      return revision
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

const pendingCustomerTransferSignal = createCustomerConversationTransferSignal()

export const getPendingCustomerTransferRevision =
  pendingCustomerTransferSignal.read
export const publishPendingCustomerTransferChange =
  pendingCustomerTransferSignal.publish
export const subscribePendingCustomerTransfer =
  pendingCustomerTransferSignal.subscribe
