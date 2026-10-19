import type { PrismaClient } from "../../generated/prisma/client"
import type { OfflineDevicePlatform } from "../../generated/prisma/enums"
import { CatalogError } from "./catalog-errors"
import { assertOfflineStaffActor } from "./offline-staff-access"
import { assertRetailOpsOfflineDeviceCanSync } from "./retail-ops-subscriptions"

/** A device registration belongs permanently to its original actor and Store. */
export async function registerOwnedOfflineDevice(
  db: PrismaClient,
  input: {
    actorUserId: string
    tenantId: string
    storeId: string
    deviceId: string
    deviceName?: string
    appVersion?: string
    platform: OfflineDevicePlatform
  },
) {
  return db.$transaction(
    async (tx) => {
      // Match staff-status/revocation ordering before taking Membership locks.
      await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${input.tenantId} AND "isActive" = true FOR SHARE`
      await assertOfflineStaffActor(tx, input)
      // The key lock also covers first registration, when no device row exists.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify([input.tenantId, input.deviceId])}, 0))`
      await tx.$queryRaw`SELECT "id" FROM "OfflineDevice" WHERE "tenantId" = ${input.tenantId} AND "deviceId" = ${input.deviceId} FOR UPDATE`
      await assertRetailOpsOfflineDeviceCanSync(tx, input)
      const store = await tx.store.findFirst({
        where: {
          id: input.storeId,
          tenantId: input.tenantId,
          status: "ACTIVE",
        },
        select: { id: true },
      })
      if (!store)
        throw new CatalogError(
          "INVALID_STOCK_OPERATION",
          "The original Store is unavailable for offline operations.",
        )
      const existing = await tx.offlineDevice.findUnique({
        where: {
          tenantId_deviceId: {
            deviceId: input.deviceId,
            tenantId: input.tenantId,
          },
        },
      })
      if (
        existing &&
        (existing.status !== "ACTIVE" ||
          existing.registeredByUserId !== input.actorUserId ||
          existing.storeId !== input.storeId)
      )
        throw new CatalogError(
          "INVALID_STOCK_OPERATION",
          "This offline device is unavailable for this account and Store. Keep existing records for management recovery.",
        )
      return tx.offlineDevice.upsert({
        create: {
          appVersion: input.appVersion,
          deviceId: input.deviceId,
          deviceName: input.deviceName,
          platform: input.platform,
          registeredByUserId: input.actorUserId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
        update: {
          appVersion: input.appVersion,
          deviceName: input.deviceName,
          lastSeenAt: new Date(),
          platform: input.platform,
        },
        where: {
          tenantId_deviceId: {
            deviceId: input.deviceId,
            tenantId: input.tenantId,
          },
        },
      })
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
