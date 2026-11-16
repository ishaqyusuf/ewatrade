import { describe, expect, test } from "bun:test"

import { ServiceCommerceMediaError } from "./service-commerce-media-assets"
import { unavailableAttachmentBlockers } from "./store-conversation-attachments"

const blocked = (blockers: string[]) =>
  Object.assign(
    new ServiceCommerceMediaError("INTAKE_BLOCKED", "Media intake is blocked."),
    { blockers },
  )

describe("Store chat attachment capability", () => {
  test("reports a Store without attachments as unavailable, not as an error", () => {
    expect(
      unavailableAttachmentBlockers(
        blocked(["attachments_disabled", "private_media_provider_unavailable"]),
      ),
    ).toEqual(["attachments_disabled", "private_media_provider_unavailable"])
    expect(
      unavailableAttachmentBlockers(
        new ServiceCommerceMediaError("NOT_READY", "Media is not active."),
      ),
    ).toEqual(["attachments_disabled"])
  })

  test("keeps file-level and unrelated refusals as errors", () => {
    expect(
      unavailableAttachmentBlockers(
        blocked(["attachments_disabled", "attachment_too_large"]),
      ),
    ).toBeNull()
    expect(
      unavailableAttachmentBlockers(
        new ServiceCommerceMediaError("CONFLICT", "Changed."),
      ),
    ).toBeNull()
    expect(unavailableAttachmentBlockers(new Error("other"))).toBeNull()
  })
})
