import {
  type BottomSheetScrollViewMethods,
  type BottomSheetScrollableProps,
  SCROLLABLE_TYPE,
  createBottomSheetScrollableComponent,
} from "@gorhom/bottom-sheet"
import {
  type ForwardRefExoticComponent,
  type RefAttributes,
  forwardRef,
  memo,
} from "react"
import type { ScrollViewProps } from "react-native"
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from "react-native-keyboard-controller"
import Reanimated from "react-native-reanimated"
import { BottomSheetInputProvider } from "./bottom-sheet-input-context"

type BottomSheetKeyboardAwareScrollViewProps = ScrollViewProps &
  BottomSheetScrollableProps &
  KeyboardAwareScrollViewProps

const AnimatedKeyboardAwareScrollView =
  Reanimated.createAnimatedComponent<KeyboardAwareScrollViewProps>(
    KeyboardAwareScrollView,
  )

const BottomSheetKeyboardAwareScrollViewComponent =
  createBottomSheetScrollableComponent<
    BottomSheetScrollViewMethods,
    BottomSheetKeyboardAwareScrollViewProps
  >(SCROLLABLE_TYPE.SCROLLVIEW, AnimatedKeyboardAwareScrollView)

const BottomSheetKeyboardAwareScrollViewBase = forwardRef<
  BottomSheetScrollViewMethods,
  BottomSheetKeyboardAwareScrollViewProps
>(function BottomSheetKeyboardAwareScrollViewBase(
  { bottomOffset = 96, children, extraKeyboardSpace = 220, ...props },
  ref,
) {
  return (
    <BottomSheetKeyboardAwareScrollViewComponent
      bottomOffset={bottomOffset}
      extraKeyboardSpace={extraKeyboardSpace}
      ref={ref}
      {...props}
    >
      <BottomSheetInputProvider>{children}</BottomSheetInputProvider>
    </BottomSheetKeyboardAwareScrollViewComponent>
  )
})

export const BottomSheetKeyboardAwareScrollView = memo(
  BottomSheetKeyboardAwareScrollViewBase,
) as ForwardRefExoticComponent<
  BottomSheetKeyboardAwareScrollViewProps &
    RefAttributes<BottomSheetScrollViewMethods>
>

BottomSheetKeyboardAwareScrollView.displayName =
  "BottomSheetKeyboardAwareScrollView"
