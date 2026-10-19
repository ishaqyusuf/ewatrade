import type { OfflineReplayBatch } from "@/store/offlineCommandStore"

/**
 * Narrow a captured replay batch to the commands this sync should send.
 * Everything else (scope, device, envelopes) stays exactly as captured, so
 * results can only ever be applied against this batch.
 */
export function replayableBatch(
  batch: OfflineReplayBatch | null,
  include: (clientCommandId: string) => boolean = () => true,
): OfflineReplayBatch | null {
  if (!batch) return null
  const commands = batch.commands.filter((command) =>
    include(command.clientCommandId),
  )
  if (!commands.length) return null
  // Unfiltered: hand back the exact issued batch (stores may check identity).
  return commands.length === batch.commands.length
    ? batch
    : { ...batch, commands }
}

/** Replay input bound to the batch's own device and original Store. */
export function replayInput(batch: OfflineReplayBatch) {
  return {
    commands: batch.commands.map(
      ({
        clientCommandId,
        createdAtClient,
        dependencyClientIds,
        eventVersion,
        payload,
      }) => ({
        clientCommandId,
        createdAtClient,
        dependencyClientIds,
        eventVersion,
        payload,
      }),
    ),
    deviceId: batch.deviceId,
    storeId: batch.scope.storeId,
  }
}

type DevicePlatform = "android" | "ios" | "unknown" | "web"

/** Device registration for exactly this actor/business/Store partition. */
export function registerInput(
  batch: OfflineReplayBatch,
  device: { appVersion?: string; os: string },
) {
  const platform: DevicePlatform =
    device.os === "ios" || device.os === "android" || device.os === "web"
      ? device.os
      : "unknown"
  return {
    appVersion: device.appVersion,
    deviceId: batch.deviceId,
    deviceName: `${device.os} device`,
    platform,
    storeId: batch.scope.storeId,
  }
}
