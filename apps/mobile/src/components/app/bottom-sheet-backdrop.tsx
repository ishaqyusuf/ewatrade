import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet"

import { useColors } from "@/hooks/use-color"

export const APP_BOTTOM_SHEET_BACKDROP_ELEVATION = 3999
export const APP_BOTTOM_SHEET_ELEVATION = 4000

type AppBottomSheetBackdropProps = BottomSheetBackdropProps & {
  dismissible?: boolean
}

export function AppBottomSheetBackdrop({
  dismissible = true,
  style,
  ...props
}: AppBottomSheetBackdropProps) {
  const colors = useColors()

  return (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      opacity={1}
      pressBehavior={dismissible ? "close" : "none"}
      style={[
        style,
        {
          backgroundColor: colors.overlay,
          elevation: APP_BOTTOM_SHEET_BACKDROP_ELEVATION,
          zIndex: APP_BOTTOM_SHEET_BACKDROP_ELEVATION,
        },
      ]}
    />
  )
}
