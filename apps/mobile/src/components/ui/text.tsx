import { useColorScheme, useColors } from "@/hooks/use-color"
import { cn } from "@/lib/utils"
import { camel } from "@ewatrade/utils"
import * as Slot from "@rn-primitives/slot"
import { type VariantProps, cva } from "class-variance-authority"
import * as React from "react"
import {
  Platform,
  Text as RNText,
  type Role,
  type StyleProp,
  type TextStyle,
} from "react-native"

const textVariants = cva(
  cn(
    "text-base text-foreground",
    Platform.select({
      web: "select-text",
    }),
  ),
  {
    variants: {
      color: {
        default: "text-foreground",
        secondary: "text-muted-foreground",
      },
      variant: {
        default: "",
        h1: cn(
          "text-center text-4xl font-extrabold tracking-tight",
          Platform.select({ web: "scroll-m-20 text-balance" }),
        ),
        h2: cn(
          "border-b border-border pb-2 text-3xl font-semibold tracking-tight",
          Platform.select({ web: "scroll-m-20 first:mt-0" }),
        ),
        h3: cn(
          "text-2xl font-semibold tracking-tight",
          Platform.select({ web: "scroll-m-20" }),
        ),
        h4: cn(
          "text-xl font-semibold tracking-tight",
          Platform.select({ web: "scroll-m-20" }),
        ),
        p: "mt-3 leading-7 sm:mt-6",
        blockquote: "mt-4 border-l-2 pl-3 italic sm:mt-6 sm:pl-6",
        code: cn(
          "relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold",
        ),
        lead: "text-xl text-muted-foreground",
        large: "text-lg font-semibold",
        small: "text-sm font-medium leading-none",
        muted: "text-sm text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
      color: "default",
    },
  },
)

type TextVariantProps = VariantProps<typeof textVariants>

type TextVariant = NonNullable<TextVariantProps["variant"]>

const ROLE: Partial<Record<TextVariant, Role>> = {
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  blockquote: Platform.select({ web: "blockquote" as Role }),
  code: Platform.select({ web: "code" as Role }),
}

const ARIA_LEVEL: Partial<Record<TextVariant, string>> = {
  h1: "1",
  h2: "2",
  h3: "3",
  h4: "4",
}

const TextClassContext = React.createContext<string | undefined>(undefined)

const textSizeAndLayoutTokens = new Set([
  "2xl",
  "3xl",
  "4xl",
  "5xl",
  "6xl",
  "7xl",
  "8xl",
  "9xl",
  "base",
  "balance",
  "center",
  "justify",
  "left",
  "lg",
  "nowrap",
  "pretty",
  "right",
  "sm",
  "start",
  "end",
  "wrap",
  "xl",
  "xs",
])

const fixedTextColors: Record<string, string> = {
  "amber-500": "rgb(245, 158, 11)",
  "amber-600": "rgb(217, 119, 6)",
  "amber-700": "rgb(180, 83, 9)",
  black: "rgb(0, 0, 0)",
  "blue-700": "rgb(29, 78, 216)",
  "blue-800": "rgb(30, 64, 175)",
  "emerald-600": "rgb(5, 150, 105)",
  "emerald-700": "rgb(4, 120, 87)",
  "gray-100": "rgb(243, 244, 246)",
  "gray-400": "rgb(156, 163, 175)",
  "gray-500": "rgb(107, 114, 128)",
  "gray-800": "rgb(31, 41, 55)",
  "green-900": "rgb(20, 83, 45)",
  "red-700": "rgb(185, 28, 28)",
  "red-900": "rgb(127, 29, 29)",
  white: "rgb(255, 255, 255)",
}

function getFixedTextColor({
  colorScheme,
  colorToken,
  colors,
}: {
  colorScheme: "dark" | "light"
  colorToken: string
  colors: ReturnType<typeof useColors>
}) {
  if (colorScheme === "dark") {
    if (colorToken.startsWith("amber-")) return colors.warn

    if (colorToken.startsWith("emerald-") || colorToken.startsWith("green-")) {
      return colors.success
    }

    if (colorToken.startsWith("red-")) return "rgb(248, 113, 113)"
    if (colorToken === "black") return colors.foreground
  }

  return fixedTextColors[colorToken]
}

function withOpacity(color: string, opacity?: number) {
  if (opacity === undefined) return color

  const match = color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/)

  if (!match) return color

  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${opacity})`
}

function getTokenOpacity(token: string) {
  const [, opacityToken] = token.split("/")
  const parsedOpacity = opacityToken ? Number(opacityToken) : undefined

  if (parsedOpacity === undefined || Number.isNaN(parsedOpacity)) {
    return undefined
  }

  return parsedOpacity > 1 ? parsedOpacity / 100 : parsedOpacity
}

function getTextColorFromClassName({
  className,
  colors,
  colorScheme,
}: {
  className?: string
  colors: ReturnType<typeof useColors>
  colorScheme: "dark" | "light"
}) {
  const tokens = className?.split(/\s+/).filter(Boolean) ?? []

  for (const token of [...tokens].reverse()) {
    if (token.includes(":")) {
      const [prefix, value] = token.split(":")

      if (prefix !== "dark" || colorScheme !== "dark") continue
      if (!value?.startsWith("text-")) continue

      const colorToken = value.slice("text-".length).split("/")[0]
      const color = getFixedTextColor({
        colorScheme,
        colorToken,
        colors,
      })

      if (color) return withOpacity(color, getTokenOpacity(value))
      continue
    }

    if (!token.startsWith("text-")) continue

    const textToken = token.slice("text-".length)
    const colorToken = textToken.split("/")[0]

    if (!colorToken || textSizeAndLayoutTokens.has(colorToken)) continue
    const fixedColor = getFixedTextColor({
      colorScheme,
      colorToken,
      colors,
    })

    if (fixedColor) {
      return withOpacity(fixedColor, getTokenOpacity(textToken))
    }

    const themeColor = colors[camel(colorToken.split("-").join(" "))]

    if (themeColor) return withOpacity(themeColor, getTokenOpacity(textToken))
  }

  return undefined
}

function Text({
  className,
  asChild = false,
  variant = "default",
  color,
  style,
  ref,
  ...props
}: React.ComponentProps<typeof RNText> &
  TextVariantProps &
  React.RefAttributes<RNText> & {
    asChild?: boolean
  }) {
  const textClass = React.useContext(TextClassContext)
  const colors = useColors()
  const { colorScheme } = useColorScheme()
  const resolvedClassName = cn(
    textVariants({ variant, color }),
    textClass,
    className,
  )
  const resolvedColor = getTextColorFromClassName({
    className: resolvedClassName,
    colors,
    colorScheme,
  })
  const colorStyle: StyleProp<TextStyle> = resolvedColor
    ? { color: resolvedColor }
    : undefined
  const resolvedStyle = colorStyle || style ? [colorStyle, style] : undefined

  const textProps = {
    "aria-level": variant ? ARIA_LEVEL[variant] : undefined,
    className: resolvedClassName,
    role: variant ? ROLE[variant] : undefined,
    ...(resolvedStyle ? { style: resolvedStyle } : {}),
    ...props,
  }

  if (asChild) {
    return <Slot.Text {...textProps} />
  }

  return <RNText ref={ref} {...textProps} />
}

export { Text, TextClassContext }
