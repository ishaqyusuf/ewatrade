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
  const tint = group ? palette[group.tone] : colors.muted
  const tintInk = group
    ? {
        mint: palette.mintForeground,
        amber: palette.amberForeground,
        sky: palette.skyForeground,
        lilac: palette.lilacForeground,
        rose: colorScheme === "dark" ? "#F7A3A3" : palette.roseForeground,
      }[group.tone]
    : colors.mutedForeground
  const xml = getCatalogIllustrationSvg(
    type?.illustrationId ?? "ill-generic-product",
    {
      ink: tintInk,
      fill: colors.card,
      accent: tintInk,
      highlight: tint,
    },
  )
  return (
    <View
      accessible={false}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tint,
      }}
    >
      {xml ? (
        <SvgXml xml={xml} width={size * 0.74} height={size * 0.74} />
      ) : null}
    </View>
  )
}
