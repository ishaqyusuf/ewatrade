import { useColorScheme, useColors } from "@/hooks/use-color"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
import {
  BUSINESS_TYPE_GROUPS,
  findBusinessType,
} from "@ewatrade/utils/business-types"
import { getCatalogIllustrationSvg } from "@ewatrade/utils/catalog-illustration-artwork"
import { View } from "react-native"
import { SvgXml } from "react-native-svg"
export function BusinessTypeAvatar({
  typeKey,
  size = 44,
}: { typeKey: string; size?: number }) {
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const type = findBusinessType(typeKey)
  const group = BUSINESS_TYPE_GROUPS.find((g) => g.key === type?.group)
  const xml = getCatalogIllustrationSvg(
    type?.illustrationId ?? "ill-generic-product",
    {
      ink: colors.foreground,
      fill: colors.card,
      accent: colors.primary,
      highlight: colors.accent,
    },
  )
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: group ? palette[group.tone] : colors.muted,
      }}
    >
      {xml ? <SvgXml xml={xml} width={size - 8} height={size - 8} /> : null}
    </View>
  )
}
