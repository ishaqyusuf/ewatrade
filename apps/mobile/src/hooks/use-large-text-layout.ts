import { shouldUseLargeTextLayout } from "@/lib/mobile-accessibility-layout"
import { useWindowDimensions } from "react-native"

export function useLargeTextLayout() {
  const { fontScale, width } = useWindowDimensions()

  return shouldUseLargeTextLayout({ fontScale, width })
}
