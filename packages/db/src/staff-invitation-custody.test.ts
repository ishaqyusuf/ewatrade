import { describe, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import {
  assertStaffInvitationCustodyConfigured,
  openStaffInvitationPayload,
  sealStaffInvitationPayload,
  staffInvitationPayloadHash,
  type StaffInvitationDeliveryPayload,
} from "./staff-invitation-custody"

const config = {
  STAFF_INVITATION_ENCRYPTION_KEY_ID: "test-v1",
  STAFF_INVITATION_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
}
const payload: StaffInvitationDeliveryPayload = {
  version: 1,
  appUrl: "https://dashboard.example.test/",
  inviteUrl:
    "https://dashboard.example.test/staff-onboarding?inviteToken=private-test-token",
  businessName: "Business",
  invitedByName: "Owner",
  inviteeEmail: "amina@example.test",
  inviteeName: "Amina",
  membershipId: "member",
  staffAccessRevision: 7,
  role: "CASHIER",
}
const binding = {
  tenantId: "tenant",
  membershipId: "member",
  invitationId: "invite",
  notificationId: "notification",
  payloadHash: staffInvitationPayloadHash(payload),
}

describe("staff invitation encrypted custody", () => {
  test("random authenticated envelopes recover the exact frozen payload without plaintext", () => {
    const one = sealStaffInvitationPayload(payload, binding, config),
      two = sealStaffInvitationPayload(payload, binding, config)
    expect(one.envelope).not.toBe(two.envelope)
    expect(one.envelope).not.toContain("private-test-token")
    expect(one.envelope).not.toContain("amina")
    expect(
      openStaffInvitationPayload(one.envelope, one.keyId, binding, config),
    ).toEqual(payload)
  })
  test("rejects changed Tenant, member, invitation, notification, payload digest or key identifier", () => {
    const sealed = sealStaffInvitationPayload(payload, binding, config)
    for (const field of [
      "tenantId",
      "membershipId",
      "invitationId",
      "notificationId",
      "payloadHash",
    ] as const) {
      expect(() =>
        openStaffInvitationPayload(
          sealed.envelope,
          sealed.keyId,
          {
            ...binding,
            [field]: field === "payloadHash" ? "0".repeat(64) : "foreign",
          },
          config,
        ),
      ).toThrow("payload is unavailable")
    }
    expect(() =>
      openStaffInvitationPayload(sealed.envelope, "unknown", binding, config),
    ).toThrow("payload is unavailable")
  })
  test("rejects tampered IV, authentication tag, ciphertext, malformed encoding and oversized envelope", () => {
    const sealed = sealStaffInvitationPayload(payload, binding, config)
    for (const index of [1, 2, 3]) {
      const parts = sealed.envelope.split(".")
      const bytes = Buffer.from(parts[index]!, "base64url")
      bytes[0] = bytes[0]! ^ 1
      parts[index] = bytes.toString("base64url")
      expect(() =>
        openStaffInvitationPayload(
          parts.join("."),
          sealed.keyId,
          binding,
          config,
        ),
      ).toThrow("payload is unavailable")
    }
    for (const envelope of [
      "v2.a.b.c",
      sealed.envelope + "=",
      "x".repeat(32_769),
    ])
      expect(() =>
        openStaffInvitationPayload(envelope, sealed.keyId, binding, config),
      ).toThrow("payload is unavailable")
  })
  test("active key rotation reads retired ciphertext only through a bounded explicit keyring", () => {
    const sealed = sealStaffInvitationPayload(payload, binding, config)
    const rotated = {
      STAFF_INVITATION_ENCRYPTION_KEY_ID: "test-v2",
      STAFF_INVITATION_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      STAFF_INVITATION_DECRYPTION_KEYS: JSON.stringify({
        [config.STAFF_INVITATION_ENCRYPTION_KEY_ID]:
          config.STAFF_INVITATION_ENCRYPTION_KEY,
      }),
    }
    expect(
      openStaffInvitationPayload(
        sealed.envelope,
        sealed.keyId,
        binding,
        rotated,
      ),
    ).toEqual(payload)
    expect(sealStaffInvitationPayload(payload, binding, rotated).keyId).toBe(
      "test-v2",
    )
    expect(() =>
      openStaffInvitationPayload(sealed.envelope, sealed.keyId, binding, {
        ...rotated,
        STAFF_INVITATION_DECRYPTION_KEYS: undefined,
      }),
    ).toThrow("payload is unavailable")
  })
  test("missing or invalid configuration and unsupported payloads fail before saving", () => {
    for (const value of [
      {},
      { ...config, STAFF_INVITATION_ENCRYPTION_KEY: "bad" },
      { ...config, STAFF_INVITATION_DECRYPTION_KEYS: "[]" },
      {
        ...config,
        STAFF_INVITATION_DECRYPTION_KEYS: JSON.stringify({
          "test-v1": config.STAFF_INVITATION_ENCRYPTION_KEY,
        }),
      },
    ])
      expect(() => assertStaffInvitationCustodyConfigured(value)).toThrow()
    expect(() =>
      sealStaffInvitationPayload(
        payload,
        { ...binding, payloadHash: "0".repeat(64) },
        config,
      ),
    ).toThrow("does not match")
    expect(() =>
      staffInvitationPayloadHash({
        ...payload,
        role: "OWNER",
      } as unknown as StaffInvitationDeliveryPayload),
    ).toThrow()
    expect(() =>
      staffInvitationPayloadHash({
        ...payload,
        password: "forged",
      } as unknown as StaffInvitationDeliveryPayload),
    ).toThrow()
  })
})
