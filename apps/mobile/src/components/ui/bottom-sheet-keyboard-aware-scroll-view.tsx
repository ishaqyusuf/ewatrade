import {
  type BottomSheetScrollViewMethods,
  type BottomSheetScrollableProps,
  SCROLLABLE_TYPE,
  createBottomSheetScrollableComponent,
  useBottomSheetInternal,
} from "@gorhom/bottom-sheet"
import {
  type ForwardRefExoticComponent,
  type RefAttributes,
  createContext,
  forwardRef,
  memo,
  useContext,
} from "react"
import type { ScrollViewProps } from "react-native"
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from "react-native-keyboard-controller"
import Reanimated from "react-native-reanimated"
import { BottomSheetInputProvider } from "./bottom-sheet-input-context"

/** Height of a full-screen form's docked footer; a focused field scrolls
 * clear of it as well as the keyboard. */
export const KeyboardFooterHeightContext = createContext(0)

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
  {
    bottomOffset = 96,
    children,
    extraKeyboardSpace,
    // A sheet's Save/Add button must act on the first tap while a field still
    // has focus; React Native's "never" spends that tap closing the keyboard.
    keyboardShouldPersistTaps = "handled",
    ...props
  },
  ref,
) {
  // The same editor also opens full screen (forms with typing never use a
  // sheet), where Gorhom's scrollable has no sheet to attach to.
  const sheet = useBottomSheetInternal(true)
  const footerHeight = useContext(KeyboardFooterHeightContext)
  if (!sheet)
    return (
      <KeyboardAwareScrollView
        bottomOffset={Math.max(bottomOffset, footerHeight + 12)}
        extraKeyboardSpace={extraKeyboardSpace ?? 0}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        ref={ref as never}
        {...(props as KeyboardAwareScrollViewProps)}
      >
        {children}
      </KeyboardAwareScrollView>
    )
  return (
    <BottomSheetKeyboardAwareScrollViewComponent
      bottomOffset={bottomOffset}
      extraKeyboardSpace={extraKeyboardSpace ?? 220}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
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
