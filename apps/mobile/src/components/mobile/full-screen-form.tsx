import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { KeyboardFooterHeightContext } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import {
  type BottomSheetModal,
  BottomSheetModalProvider,
} from "@gorhom/bottom-sheet"
import {
  type ReactNode,
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { Keyboard, Modal as NativeModal, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

type ModalBackAction = () => boolean
const ModalBackContext = createContext<
  ((action: ModalBackAction) => () => void) | null
>(null)

/** Native modals consume Android Back before an inner sheet can see it. */
export function useFullScreenFormBack(action: ModalBackAction) {
  const register = useContext(ModalBackContext)
  useEffect(() => register?.(action), [action, register])
}

type FullScreenFormProps = {
  title: string
  closeLabel?: string
  /** Off when the body docks its own footer (a search) on the safe area. */
  bottomInset?: boolean
  /** While saving, X and Android Back leave the form open. */
  closeDisabled?: boolean
  /** Actions docked under the body (the action-bar footer); they ride the
   * keyboard, and fields in the body scroll clear of them. */
  footer?: ReactNode
  /** Shows a back chevron instead of X (a step inside the form); Android
   * Back follows it too. */
  onBack?: () => void
  backLabel?: string
  children: ReactNode
}

/**
 * The body of a full-screen form with its actions docked underneath, in the
 * action-bar footer of the app's workflow views. The footer rides the
 * keyboard, and fields in the body scroll clear of it.
 */
export function DockedFooterLayout({
  footer,
  label,
  children,
}: {
  footer: ReactNode
  label: string
  children: ReactNode
}) {
  const [footerHeight, setFooterHeight] = useState(0)
  return (
    <>
      <KeyboardFooterHeightContext.Provider value={footerHeight}>
        <View style={{ flex: 1, minHeight: 0 }}>{children}</View>
      </KeyboardFooterHeightContext.Provider>
      <BottomSearchFooter
        variant="action-bar"
        position="relative"
        accessibilityLabel={label}
        onHeightChange={setFooterHeight}
        searchVisible={false}
        onChangeText={() => undefined}
        placeholder=""
        totalCount={0}
        value=""
      >
        {footer}
      </BottomSearchFooter>
    </>
  )
}

/**
 * A form that takes typing, opened over the current screen. Bottom sheets are
 * only for a few choices, confirmations and keyboard-free controls; anything
 * with a text field or search opens here instead, with the same chrome as the
 * app's full-screen workflow views. Android Back closes it.
 */
export function FullScreenForm({
  visible,
  title,
  closeLabel = `Close ${title.toLowerCase()}`,
  bottomInset = true,
  closeDisabled = false,
  footer,
  onBack,
  backLabel,
  onClose,
  children,
}: FullScreenFormProps & {
  visible: boolean
  onClose: () => void
}) {
  const insets = useSafeAreaInsets()
  const backActions = useRef(new Set<ModalBackAction>())
  const registerBackAction = useCallback((action: ModalBackAction) => {
    backActions.current.add(action)
    return () => {
      backActions.current.delete(action)
    }
  }, [])
  const close = () => {
    if (closeDisabled) return
    Keyboard.dismiss()
    onClose()
  }
  return (
    <NativeModal
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      visible={visible}
      onRequestClose={() => {
        for (const action of Array.from(backActions.current).reverse())
          if (action()) return
        if (onBack) onBack()
        else close()
      }}
    >
      <ModalBackContext.Provider value={registerBackAction}>
        {/* Keyboard-free pickers inside the form still present sheets. */}
        <BottomSheetModalProvider>
          <MobileWorkflowChrome
            hideHeader={false}
            keyboardBottomOffset={96}
            title={title}
            closeLabel={closeLabel}
            onClose={close}
            onBack={onBack}
            backLabel={backLabel}
          >
            {/* Explicit flex styles: with classes the body collapsed inside the
              native modal and the footer was drawn under the header. */}
            <View
              style={{
                flex: 1,
                paddingBottom: bottomInset && !footer ? insets.bottom : 0,
              }}
            >
              {footer ? (
                <DockedFooterLayout footer={footer} label={`${title} actions`}>
                  {children}
                </DockedFooterLayout>
              ) : (
                children
              )}
            </View>
          </MobileWorkflowChrome>
        </BottomSheetModalProvider>
      </ModalBackContext.Provider>
    </NativeModal>
  )
}

/**
 * `FullScreenForm` driven by a `useModal()` ref, so a sheet that took typing
 * converts without changing the hooks that present and dismiss it.
 */
export const FullScreenModal = forwardRef<
  BottomSheetModal,
  FullScreenFormProps & {
    onChange?: (index: number) => void
    onDismiss?: () => void
  }
>(function FullScreenModal({ onChange, onDismiss, ...props }, ref) {
  const [open, setOpen] = useState(false)
  const opened = useRef(false)
  const callbacks = useRef({ onChange, onDismiss })
  callbacks.current = { onChange, onDismiss }
  const present = useCallback(() => {
    if (opened.current) return
    opened.current = true
    setOpen(true)
    callbacks.current.onChange?.(0)
  }, [])
  const dismiss = useCallback(() => {
    if (!opened.current) return
    opened.current = false
    setOpen(false)
    callbacks.current.onChange?.(-1)
    callbacks.current.onDismiss?.()
  }, [])
  useImperativeHandle(
    ref,
    () =>
      ({
        present,
        dismiss,
        close: dismiss,
        forceClose: dismiss,
        expand: present,
      }) as unknown as BottomSheetModal,
    [present, dismiss],
  )
  return <FullScreenForm {...props} visible={open} onClose={dismiss} />
})
