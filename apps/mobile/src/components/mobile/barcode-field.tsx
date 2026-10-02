import { ActionButton } from "@/components/mobile/action-button"
import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import { FormField } from "@/components/mobile/form-field"
import { StatusBanner } from "@/components/mobile/status-banner"
import { requireOptionalNativeModule } from "expo"
import {
  type ComponentProps,
  Suspense,
  lazy,
  useEffect,
  useRef,
  useState,
} from "react"
import { Keyboard, Modal, View } from "react-native"

const BarcodeCameraScreen = lazy(() =>
  import("./barcode-camera-screen").then((module) => ({
    default: module.BarcodeCameraScreen,
  })),
)

export function BarcodeField(props: ComponentProps<typeof FormField>) {
  const [scanning, setScanning] = useState(false)
  const scanSession = useRef(0)
  const editable = useRef(props.editable !== false)
  editable.current = props.editable !== false
  const currentSession = scanSession.current
  useEffect(() => {
    if (props.editable === false) {
      scanSession.current++
      setScanning(false)
    }
  }, [props.editable])
  useEffect(
    () => () => {
      scanSession.current++
    },
    [],
  )
  // Older development binaries can still use manual entry until rebuilt.
  const cameraAvailable = Boolean(requireOptionalNativeModule("ExpoCamera"))
  const close = () => {
    scanSession.current++
    setScanning(false)
  }
  return (
    <>
      <FormField
        {...props}
        autoCapitalize="none"
        autoCorrect={false}
        leadingIcon="Camera"
        leadingActionLabel="Scan barcode with camera"
        onLeadingActionPress={() => {
          if (!editable.current) return
          Keyboard.dismiss()
          scanSession.current++
          setScanning(true)
        }}
      />
      {scanning ? (
        <Modal
          animationType="slide"
          presentationStyle="fullScreen"
          visible
          onRequestClose={close}
          statusBarTranslucent
          navigationBarTranslucent
        >
          <MobileWorkflowChrome
            screen="first-product"
            hideHeader={false}
            keyboardBottomOffset={0}
            title="Scan barcode"
            closeLabel="Cancel barcode scan"
            onClose={close}
          >
            {cameraAvailable ? (
              <Suspense
                fallback={
                  <StatusBanner
                    tone="default"
                    message="Opening barcode camera…"
                  />
                }
              >
                <BarcodeCameraScreen
                  onCancel={close}
                  onRead={(code) => {
                    if (
                      !editable.current ||
                      scanSession.current !== currentSession
                    )
                      return
                    props.onChangeText?.(code)
                    close()
                  }}
                />
              </Suspense>
            ) : (
              <View className="gap-5 px-4 pt-5">
                <StatusBanner
                  tone="default"
                  message="Install the updated app to scan barcodes. You can still type the code."
                />
                <ActionButton variant="outline" onPress={close}>
                  Back to barcode
                </ActionButton>
              </View>
            )}
          </MobileWorkflowChrome>
        </Modal>
      ) : null}
    </>
  )
}
