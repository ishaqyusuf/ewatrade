import { describe, expect, test } from "bun:test"

import {
  type CustomerConversationTransferSignal,
  createCustomerConversationTransferSignal,
} from "./customer-conversation-transfer-signal"

describe("Customer conversation transfer signal", () => {
  test("notifies a mounted same-Store route for every pending-transfer change", () => {
    const signal: CustomerConversationTransferSignal =
      createCustomerConversationTransferSignal()
    const revisions: number[] = []
    const unsubscribe = signal.subscribe(() => revisions.push(signal.read()))

    signal.publish()
    signal.publish()
    unsubscribe()
    signal.publish()

    expect(revisions).toEqual([1, 2])
    expect(signal.read()).toBe(3)
  })
})
