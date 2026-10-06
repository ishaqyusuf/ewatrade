import { useColorScheme } from "@/hooks/use-color"
import { StatusBar } from "expo-status-bar"
import { View } from "react-native"
import { BrandLogo } from "../../brand"

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
      <BrandLogo reverse={colorScheme === "dark"} width={240} />
    </View>
  )
}
