import { requireOptionalNativeModule } from "expo-modules-core"
import { Platform } from "react-native"
import {
  type NativePlayAgeProvider,
  createPlayAgeReader,
  requestPlayAgeObservation,
} from "./play-age-observation"

/** Explicit-call adapter only. No product entrypoint, import-time call or storage. */
export function createNativePlayAgeReader(contextRevision: () => number) {
  return createPlayAgeReader({
    contextRevision,
    observe: async (isCurrent) => {
      if (Platform.OS !== "android") return { kind: "unsupported" }
      const native =
        requireOptionalNativeModule<NativePlayAgeProvider>("PlayAgeSignals")
      if (
        !native ||
        typeof native.requestAccess !== "function" ||
        typeof native.readShared !== "function"
      )
        return { kind: "unsupported" }
      // Native RELEASE_ENABLED is false. OTA/env cannot enable the real SDK.
      return requestPlayAgeObservation(native, isCurrent)
    },
  })
}
