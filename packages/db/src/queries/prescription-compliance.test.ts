import { describe, expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"

import {
  assertPrescriptionBreakGlassWindow,
  assertPrescriptionOperationalOrBreakGlassAccess,
  prescriptionRetentionCutoffs,
} from "./prescription-compliance"

describe("Prescription compliance controls", () => {
  test("requires a future break-glass expiry no more than one hour away", () => {
    const now = new Date("2026-08-09T10:00:00.000Z")
    expect(() =>
      assertPrescriptionBreakGlassWindow({
        expiresAt: new Date("2026-08-09T10:30:00.000Z"),
        now,
      }),
    ).not.toThrow()
    expect(() => assertPrescriptionBreakGlassWindow({ now })).toThrow(
      "must have an expiry",
    )
    expect(() =>
      assertPrescriptionBreakGlassWindow({
        expiresAt: new Date("2026-08-09T11:00:00.001Z"),
        now,
      }),
    ).toThrow("within 60 minutes")
  })

  test("applies independent audit and commercial retention boundaries", () => {
    const now = new Date("2026-08-09T00:00:00.000Z")
    const cutoffs = prescriptionRetentionCutoffs(
      {
        addressDays: 30,
        auditEvidenceDays: 365,
        commercialRecordDays: 2555,
        messageDays: 90,
        rawMediaDays: 30,
        secureTokenDays: 30,
        transcriptDays: 90,
      },
      now,
    )
    expect(cutoffs.auditBefore).toEqual(
      new Date(now.getTime() - 365 * 86_400_000),
    )
    expect(cutoffs.commercialBefore).toEqual(
      new Date(now.getTime() - 2555 * 86_400_000),
    )
  })

  test("uses only the actor's active tenant/store break-glass grant and audits use", async () => {
    const writes: unknown[] = []
    const db = {
      prescriptionIncidentControl: {
        findFirst: async (input: unknown) => {
          expect(input).toMatchObject({
            where: {
              activatedByUserId: "manager-1",
              status: "ACTIVE",
              storeId: "store-1",
              tenantId: "tenant-1",
              type: "BREAK_GLASS",
            },
          })
          return {
            expiresAt: new Date("2026-08-09T11:00:00.000Z"),
            id: "control-1",
          }
        },
      },
      prescriptionSensitiveAccessEvent: {
        createMany: async (input: unknown) => {
          writes.push(input)
          return { count: 1 }
        },
      },
      prescriptionStoreRole: { findFirst: async () => null },
    } as unknown as PrismaClient

    await expect(
      assertPrescriptionOperationalOrBreakGlassAccess(db, {
        actorUserId: "manager-1",
        reason: "emergency review",
        requestId: "request-1",
        storeId: "store-1",
        tenantId: "tenant-1",
      }),
    ).resolves.toEqual({
      breakGlassControlId: "control-1",
      roleId: null,
    })
    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatchObject({
      data: [
        {
          accessType: "break_glass_used",
          actorUserId: "manager-1",
          incidentControlId: "control-1",
          requestId: "request-1",
          storeId: "store-1",
          tenantId: "tenant-1",
        },
      ],
    })
  })
})
