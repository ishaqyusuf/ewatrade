import { describe, expect, test } from "bun:test"

import {
  issueStoreConversationAttachmentUploadAuthorization,
  verifyStoreConversationAttachmentUploadAuthorization,
} from "./conversation-attachment-upload-authorization"

const input = {
  channel: "web" as const,
  conversationId: "conversation-1",
  credentialToken: "credential-token-1",
  now: new Date("2026-08-14T10:00:00.000Z"),
  publicToken: "p".repeat(32),
  target: { kind: "new_commerce_inquiry" as const },
}

describe("Store Conversation attachment upload authorization", () => {
  test("round-trips bounded participant and target facts", () => {
    const issued = issueStoreConversationAttachmentUploadAuthorization(input)
    const verified = verifyStoreConversationAttachmentUploadAuthorization({
      channel: "web",
      credentialToken: input.credentialToken,
      now: new Date("2026-08-14T10:00:30.000Z"),
      token: issued.token,
    })

    expect(issued.expiresAt).toEqual(new Date("2026-08-14T10:01:00.000Z"))
    expect(verified).toMatchObject({
      channel: "web",
      conversationId: input.conversationId,
      publicToken: input.publicToken,
      target: input.target,
      version: 1,
    })
    expect(JSON.stringify(verified)).not.toContain(input.credentialToken)
  })

  test("rejects expiry, credential, installation, channel, and signature mismatch", () => {
    const issued = issueStoreConversationAttachmentUploadAuthorization({
      ...input,
      channel: "mobile",
      installationToken: "installation-1",
    })
    for (const candidate of [
      {
        channel: "mobile" as const,
        credentialToken: "different",
        installationToken: "installation-1",
        now: input.now,
        token: issued.token,
      },
      {
        channel: "mobile" as const,
        credentialToken: input.credentialToken,
        installationToken: "different",
        now: input.now,
        token: issued.token,
      },
      {
        channel: "web" as const,
        credentialToken: input.credentialToken,
        installationToken: "installation-1",
        now: input.now,
        token: issued.token,
      },
      {
        channel: "mobile" as const,
        credentialToken: input.credentialToken,
        installationToken: "installation-1",
        now: new Date("2026-08-14T10:01:00.000Z"),
        token: issued.token,
      },
      {
        channel: "mobile" as const,
        credentialToken: input.credentialToken,
        installationToken: "installation-1",
        now: input.now,
        token: `${issued.token}changed`,
      },
    ]) {
      expect(() =>
        verifyStoreConversationAttachmentUploadAuthorization(candidate),
      ).toThrow()
    }
  })
})
