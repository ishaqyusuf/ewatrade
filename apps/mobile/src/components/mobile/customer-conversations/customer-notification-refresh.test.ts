import { describe, expect, mock, test } from "bun:test"

import { refreshCustomerNotificationSettingsWhenExpanded } from "./customer-notification-refresh"

describe("refreshCustomerNotificationSettingsWhenExpanded", () => {
  test("does not fetch settings after the panel has been collapsed", async () => {
    const refetch = mock(async () => undefined)

    await refreshCustomerNotificationSettingsWhenExpanded({
      expanded: false,
      refetch,
    })

    expect(refetch).not.toHaveBeenCalled()
  })

  test("refreshes visible settings after a successful mutation", async () => {
    const refetch = mock(async () => undefined)

    await refreshCustomerNotificationSettingsWhenExpanded({
      expanded: true,
      refetch,
    })

    expect(refetch).toHaveBeenCalledTimes(1)
  })
})
