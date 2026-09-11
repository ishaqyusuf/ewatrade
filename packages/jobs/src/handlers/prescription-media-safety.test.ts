import { describe, expect, test } from "bun:test"

import { createDeterministicMediaSafetyProvider } from "@ewatrade/prescriptions"

import { runPrescriptionMediaSafety } from "./prescription-media-safety"

describe("prescription media-safety job", () => {
  test("reloads private media by request id and records deterministic outcomes", async () => {
    const recorded: unknown[] = []
    await runPrescriptionMediaSafety(
      { requestId: "request-1" },
      {
        assertProviderAllowed: async () => undefined,
        list: async () => [
          {
            id: "media-1",
            objectKey: "private/safe-page",
            storeId: "store-1",
            tenantId: "tenant-1",
          },
          {
            id: "media-2",
            objectKey: "private/quarantine-page",
            storeId: "store-1",
            tenantId: "tenant-1",
          },
        ],
        provider: createDeterministicMediaSafetyProvider(),
        record: async (input) => {
          recorded.push(input)
        },
      },
    )

    expect(recorded).toHaveLength(2)
    expect(recorded).toEqual([
      expect.objectContaining({ mediaId: "media-1", outcome: "safe" }),
      expect.objectContaining({
        mediaId: "media-2",
        outcome: "quarantined",
      }),
    ])
  })
})
