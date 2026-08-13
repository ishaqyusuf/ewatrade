import { describe, expect, test } from "bun:test"

import {
  resolveCustomerDeepLink,
  resolveCustomerSystemPath,
} from "./customer-deep-link"

const PUBLIC_TOKEN = "public-token-123456789012345678901234"
const TRANSFER_TOKEN = "transfer-token-1234567890123456789012"

describe("resolveCustomerSystemPath", () => {
  test("opens an allowlisted Store path without adding credentials", () => {
    expect(
      resolveCustomerSystemPath(`https://chat.ewatrade.com/r/${PUBLIC_TOKEN}`),
    ).toBe(`/r/${PUBLIC_TOKEN}`)
  })

  test("moves an allowlisted fragment transfer into the internal route", () => {
    expect(
      resolveCustomerSystemPath(
        `ewatrade://r/${PUBLIC_TOKEN}#transfer=${TRANSFER_TOKEN}`,
      ),
    ).toBe(`/r/${PUBLIC_TOKEN}`)
    expect(
      resolveCustomerDeepLink(
        `ewatrade://r/${PUBLIC_TOKEN}#transfer=${TRANSFER_TOKEN}`,
      ).pendingTransfer,
    ).toEqual({ publicToken: PUBLIC_TOKEN, transferToken: TRANSFER_TOKEN })
  })

  test("redacts malformed and unrecognized links", () => {
    expect(resolveCustomerSystemPath("ewatrade://orders/private")).toBe("/")
    expect(
      resolveCustomerSystemPath(
        `ewatrade://r/${PUBLIC_TOKEN}#transfer=too-short`,
      ),
    ).toBe(`/r/${PUBLIC_TOKEN}`)
    expect(
      resolveCustomerSystemPath(
        `ewatrade://r/${PUBLIC_TOKEN}#transfer=${TRANSFER_TOKEN}&debug=true`,
      ),
    ).toBe(`/r/${PUBLIC_TOKEN}`)
    expect(resolveCustomerSystemPath("not a valid link")).toBe("/")
  })
})
