import { Image, View } from "react-native"
import { StatusBar } from "expo-status-bar"
import { useColorScheme } from "@/hooks/use-color"
import { shouldShowInternalDesignSystemEntry } from "@/lib/app-variant"

export function ClassicStartupSplash() {
  const { colorScheme } = useColorScheme()
  return (
    <View
      accessibilityLabel="ẸwáTrade is opening"
      accessibilityRole="progressbar"
      className={
        colorScheme === "dark"
          ? "flex-1 items-center justify-center bg-black"
          : "flex-1 items-center justify-center bg-white"
      }
    >
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      <Image
        accessibilityIgnoresInvertColors
        className="size-[170px]"
        resizeMode="contain"
        source={
          shouldShowInternalDesignSystemEntry()
            ? require("../../../../../assets/icons/dev-splash-logo.png")
            : require("../../../../../assets/icons/splash-logo.png")
        }
      />
    </View>
  )
}
