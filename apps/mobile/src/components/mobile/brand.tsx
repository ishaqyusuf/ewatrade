import { Image } from "react-native"
import Svg, { Path } from "react-native-svg"

export function BrandMark({
  color,
  size = 28,
}: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessible={false}>
      <Path fill={color} d="M17 41 29 20H82L64 38H41L36 47H13Z" />
      <Path
        fill={color}
        d="M10 97 17 73 44 48H73L92 29 84 21 112 13 104 41 97 34 80 66H52L22 96Z"
      />
      <Path fill={color} d="M42 82H99L86 102H22Z" />
    </Svg>
  )
}

export function BrandLogo({
  reverse = false,
  width = 180,
}: { reverse?: boolean; width?: number }) {
  return (
    <Image
      accessibilityLabel="ẸwáTrade"
      accessibilityIgnoresInvertColors
      resizeMode="contain"
      source={
        reverse
          ? require("../../../assets/brand/precision-rise-logo-reverse.png")
          : require("../../../assets/brand/precision-rise-logo.png")
      }
      style={{ width, height: (width * 120) / 548 }}
    />
  )
}

export function BrandWordmark({
  reverse = false,
  width = 145,
}: { reverse?: boolean; width?: number }) {
  return (
    <Image
      accessibilityLabel="ẸwáTrade"
      accessibilityIgnoresInvertColors
      resizeMode="contain"
      source={
        reverse
          ? require("../../../assets/brand/precision-rise-wordmark-reverse.png")
          : require("../../../assets/brand/precision-rise-wordmark.png")
      }
      style={{ width, height: (width * 98.723) / 409.905 }}
    />
  )
}
