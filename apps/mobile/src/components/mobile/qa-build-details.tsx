import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { qaRuntimeIdentity } from "@/lib/qa-runtime-identity"
import { requireOptionalNativeModule } from "expo"
import * as Updates from "expo-updates"

// The installed native module supplies build identity. Unknown stays unknown.
const application = requireOptionalNativeModule<{
  nativeBuildVersion?: string
}>("ExpoApplication")

export function QaBuildDetails() {
  const development = typeof __DEV__ !== "undefined" && __DEV__
  return (
    <View className="gap-4 px-5 pb-5">
      <View className="gap-1 border-b border-border pb-4">
        <Text className="text-[14px] [-rn-line-height:20] text-muted-foreground">
          Runtime
        </Text>
        <Text
          testID="qa-runtime-identity"
          className="text-[16px] [-rn-line-height:22] text-foreground"
        >
          {qaRuntimeIdentity({
            development,
            enabled: Updates.isEnabled,
            embedded: Updates.isEmbeddedLaunch,
            emergency: Updates.isEmergencyLaunch,
            updateId: Updates.updateId,
            build: application?.nativeBuildVersion ?? null,
          })}
        </Text>
      </View>
      <View className="flex-row justify-between gap-4">
        <Text className="text-[14px] [-rn-line-height:20] text-muted-foreground">
          Installed build
        </Text>
        <Text className="text-[16px] [-rn-line-height:22] text-foreground">
          {application?.nativeBuildVersion ?? "Unknown"}
        </Text>
      </View>
    </View>
  )
}
