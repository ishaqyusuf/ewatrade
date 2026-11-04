import {
  type BottomSheetScrollViewMethods,
  type BottomSheetScrollableProps,
  SCROLLABLE_TYPE,
  createBottomSheetScrollableComponent,
  useBottomSheetInternal,
} from "@gorhom/bottom-sheet"
import {
  type ForwardRefExoticComponent,
  type ForwardedRef,
  type RefAttributes,
  createContext,
  forwardRef,
  memo,
  useContext,
  useEffect,
  useRef,
} from "react"
import {
  Keyboard,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  type ScrollViewProps,
  TextInput,
} from "react-native"
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from "react-native-keyboard-controller"
import Reanimated from "react-native-reanimated"
import { BottomSheetInputProvider } from "./bottom-sheet-input-context"

/** Height of a full-screen form's docked footer; a focused field scrolls
 * clear of it as well as the keyboard. */
export const KeyboardFooterHeightContext = createContext(0)

/**
 * KeyboardAwareScrollView for full-screen forms. keyboard-controller follows
 * focus only in the activity window, so inside a native Modal a field tapped
 * low on the screen stayed under the keyboard (and the docked footer) until
 * the first keystroke. When the keyboard shows, this scrolls the focused
 * field clear itself; where the library already did, there is no overlap.
 */
export const ScreenKeyboardAwareScrollView = forwardRef(
  function ScreenKeyboardAwareScrollView(
    { bottomOffset = 96, onScroll, ...props }: KeyboardAwareScrollViewProps,
    ref: ForwardedRef<ScrollView>,
  ) {
    const footerHeight = useContext(KeyboardFooterHeightContext)
    const offset = Math.max(bottomOffset, footerHeight + 12)
    const scroll = useRef<ScrollView | null>(null)
    const scrollY = useRef(0)
    const latestOffset = useRef(offset)
    latestOffset.current = offset
    useEffect(() => {
      const subscription = Keyboard.addListener("keyboardDidShow", (event) => {
        const input = TextInput.State.currentlyFocusedInput()
        if (!input || !scroll.current) return
        input.measureInWindow((_x, y, _width, height) => {
          const overlap =
            y + height + latestOffset.current - event.endCoordinates.screenY
          if (overlap > 0)
            scroll.current?.scrollTo({ y: scrollY.current + overlap })
        })
      })
      return () => subscription.remove()
    }, [])
    return (
      <KeyboardAwareScrollView
        {...props}
        bottomOffset={offset}
        ref={(node: ScrollView | null) => {
          scroll.current = node
          if (typeof ref === "function") ref(node)
          else if (ref) ref.current = node
        }}
        scrollEventThrottle={props.scrollEventThrottle ?? 16}
        onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
          scrollY.current = event.nativeEvent.contentOffset.y
          onScroll?.(event)
        }}
      />
    )
  },
)

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
  if (!sheet)
    return (
      <ScreenKeyboardAwareScrollView
        bottomOffset={bottomOffset}
        extraKeyboardSpace={extraKeyboardSpace ?? 0}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        ref={ref as never}
        {...(props as KeyboardAwareScrollViewProps)}
      >
        {children}
      </ScreenKeyboardAwareScrollView>
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
