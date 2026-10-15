import type { IconKeys } from "@/components/ui/icon"
import {
  Analytics01Icon,
  House,
  LayoutDashboard,
  MoreHorizontal,
  ReceiptTextIcon,
  Warehouse,
  Wrench,
} from "@hugeicons/core-free-icons"
import Svg, { Circle, Path, Rect } from "react-native-svg"

type HugeiconData = typeof House

/**
 * Fill mode for the active dock tab (workshop 28, pick 02): the same
 * Hugeicon as the outline, with its body filled solid and its inner details
 * redrawn in the dock surface colour so they read as cut-outs. The free
 * Hugeicons set ships no solid style, so each tab icon names its body shapes.
 */
const FILLED_TAB_ICONS: Partial<
  Record<IconKeys, { icon: HugeiconData; body: readonly number[] }>
> = {
  House: { body: [0], icon: House },
  ReceiptText: { body: [0], icon: ReceiptTextIcon },
  Warehouse: { body: [3], icon: Warehouse },
  Wrench: { body: [0, 1], icon: Wrench },
  more: { body: [0], icon: MoreHorizontal },
  home: { body: [0, 1, 2, 3], icon: LayoutDashboard },
  LayoutDashboard: { body: [0, 1, 2, 3], icon: LayoutDashboard },
  analytics: { body: [3], icon: Analytics01Icon },
}

export function hasFilledTabIcon(name: IconKeys) {
  return name in FILLED_TAB_ICONS
}

export function FilledTabIcon({
  color,
  cutoutColor,
  name,
  size = 20,
  strokeWidth = 1.8,
}: {
  color: string
  cutoutColor: string
  name: IconKeys
  size?: number
  strokeWidth?: number
}) {
  const spec = FILLED_TAB_ICONS[name]
  if (!spec) return null
  const elements = spec.icon.map((element, index) => ({
    element,
    index,
    isBody: spec.body.includes(index),
  }))
  // Bodies first, so the cut-outs always draw on top of the fill.
  const ordered = [
    ...elements.filter(({ isBody }) => isBody),
    ...elements.filter(({ isBody }) => !isBody),
  ]

  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      {ordered.map(({ element: [type, attrs], index, isBody }) => {
        const paint = {
          fill: isBody ? color : "none",
          stroke: isBody ? color : cutoutColor,
          strokeLinecap: "round" as const,
          strokeLinejoin: "round" as const,
          strokeWidth,
        }
        if (type === "path")
          return <Path d={String(attrs.d)} key={index} {...paint} />
        if (type === "circle")
          return (
            <Circle
              cx={attrs.cx}
              cy={attrs.cy}
              key={index}
              r={attrs.r}
              {...paint}
            />
          )
        if (type === "rect")
          return (
            <Rect
              height={attrs.height}
              key={index}
              rx={attrs.rx}
              width={attrs.width}
              x={attrs.x}
              y={attrs.y}
              {...paint}
            />
          )
        return null
      })}
    </Svg>
  )
}
