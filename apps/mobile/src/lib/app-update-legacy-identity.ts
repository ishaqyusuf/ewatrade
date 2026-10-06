import { type TurboModule, TurboModuleRegistry } from "react-native"

interface NativeReleaseReader extends TurboModule {
  fetchNativeRelease(): Promise<{ id: string; build: string }>
}

/**
 * Older Preview binaries already bundle RNSentry but may lack AppUpdate.
 * This method reads Android PackageInfo locally; it neither initializes the
 * telemetry SDK nor sends an event. Do not substitute OTA manifest metadata:
 * the installed package/version must remain authoritative after an OTA.
 */
export async function readLegacyAppIdentity() {
  const native = TurboModuleRegistry.get<NativeReleaseReader>("RNSentry")
  if (!native?.fetchNativeRelease) return null
  const release = await native.fetchNativeRelease()
  return { applicationId: release.id, buildNumber: release.build }
}
