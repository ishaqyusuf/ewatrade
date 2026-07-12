/**
 * Modal
 * Dependencies:
 * - @gorhom/bottom-sheet.
 *
 * Props:
 * - All `BottomSheetModalProps` props.
 * - `title` (string | undefined): Optional title for the modal header.
 *
 * Usage Example:
 * import { Modal, useModal } from '@gorhom/bottom-sheet';
 *
 * function DisplayModal() {
 *   const { ref, present, dismiss } = useModal();
 *
 *   return (
 *     <View>
 *       <Modal
 *         snapPoints={['60%']} // optional
 *         title="Modal Title"
 *         ref={ref}
 *       >
 *         Modal Content
 *       </Modal>
 *     </View>
 *   );
 * }
 *
 */

import type {
  BottomSheetBackdropProps,
  BottomSheetBackgroundProps,
  BottomSheetModalProps,
} from "@gorhom/bottom-sheet"
import { BottomSheetBackdrop, BottomSheetModal } from "@gorhom/bottom-sheet"
import * as React from "react"
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native"
import { Path, Svg } from "react-native-svg"

import { useColors } from "@/hooks/use-color"
import { Pressable } from "./pressable"
import { Text } from "./text"

const FLOATING_SHEET_RADIUS = 32
const FLOATING_SHEET_SIDE_INSET = 8

function getFloatingBottomInset() {
  return Platform.OS === "android" ? 20 : 28
}

type ModalProps = BottomSheetModalProps & {
  title?: string
  hideHeader?: boolean
}

type ModalRef = React.ForwardedRef<BottomSheetModal>

type ModalHeaderProps = {
  title?: string
  dismiss: () => void
}

export const useModal = () => {
  const ref = React.useRef<BottomSheetModal>(null)

  const present = React.useCallback((data?: never) => {
    ref.current?.present(data)
  }, [])
  const dismiss = React.useCallback(() => {
    ref.current?.dismiss()
  }, [])
  return { ref, present, dismiss }
}

export const Modal = React.forwardRef(
  (
    {
      snapPoints: _snapPoints = ["60%"],
      title,
      hideHeader = false,
      detached = true,
      bottomInset,
      enableDynamicSizing = false,
      ...props
    }: ModalProps,
    ref: ModalRef,
  ) => {
    const colors = useColors()
    const { height } = useWindowDimensions()
    const resolvedBottomInset = bottomInset ?? getFloatingBottomInset()
    const maxDynamicContentSize = React.useMemo(
      () =>
        props.maxDynamicContentSize ??
        Math.max(
          240,
          height - resolvedBottomInset - FLOATING_SHEET_SIDE_INSET * 2,
        ),
      [height, props.maxDynamicContentSize, resolvedBottomInset],
    )
    const detachedProps = React.useMemo(
      () =>
        getDetachedProps(detached, {
          bottomInset: resolvedBottomInset,
          containerStyle: props.containerStyle,
          shadowColor: colors.foreground,
          style: props.style,
        }),
      [
        colors.foreground,
        detached,
        resolvedBottomInset,
        props.style,
        props.containerStyle,
      ],
    )
    const modal = useModal()
    const snapPoints = React.useMemo(() => _snapPoints, [_snapPoints])

    React.useImperativeHandle(
      ref,
      () => (modal.ref.current as BottomSheetModal) || null,
    )
    const renderBackgroundComponent = React.useCallback(
      ({ pointerEvents, style }: BottomSheetBackgroundProps) => (
        <View
          pointerEvents={pointerEvents}
          style={[
            style,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: StyleSheet.hairlineWidth,
            },
            detached
              ? {
                  borderRadius: FLOATING_SHEET_RADIUS,
                  borderBottomLeftRadius: FLOATING_SHEET_RADIUS,
                  borderBottomRightRadius: FLOATING_SHEET_RADIUS,
                  borderTopLeftRadius: FLOATING_SHEET_RADIUS,
                  borderTopRightRadius: FLOATING_SHEET_RADIUS,
                }
              : null,
            props.backgroundStyle,
          ]}
        />
      ),
      [colors.border, colors.card, detached, props.backgroundStyle],
    )
    const renderHandleComponent = React.useCallback(
      () =>
        hideHeader ? (
          <View
            className={
              detached
                ? "mb-4 mt-3 h-1.5 w-12 self-center rounded-full bg-muted-foreground/25"
                : "mb-2 mt-2 h-1 w-12 self-center rounded-lg bg-muted-foreground/25"
            }
          />
        ) : (
          <>
            <View
              className={
                detached
                  ? "mb-8 mt-3 h-1.5 w-12 self-center rounded-full bg-muted-foreground/25"
                  : "mb-8 mt-2 h-1 w-12 self-center rounded-lg bg-muted-foreground/25"
              }
            />
            <ModalHeader title={title} dismiss={modal.dismiss} />
          </>
        ),
      [detached, hideHeader, title, modal.dismiss],
    )

    return (
      <BottomSheetModal
        {...props}
        {...detachedProps}
        ref={modal.ref}
        index={0}
        snapPoints={snapPoints}
        backdropComponent={props.backdropComponent || renderBackdrop}
        android_keyboardInputMode={
          props.android_keyboardInputMode ?? "adjustResize"
        }
        accessibilityLabel={props.accessibilityLabel ?? title}
        backgroundComponent={
          props.backgroundComponent ?? renderBackgroundComponent
        }
        enableDynamicSizing={enableDynamicSizing}
        enablePanDownToClose={props.enablePanDownToClose ?? true}
        handleComponent={
          "handleComponent" in props
            ? props.handleComponent
            : renderHandleComponent
        }
        keyboardBlurBehavior={props.keyboardBlurBehavior ?? "restore"}
        keyboardBehavior={props.keyboardBehavior ?? "interactive"}
        maxDynamicContentSize={maxDynamicContentSize}
      />
    )
  },
)
Modal.displayName = "Modal"
/**
 * Custom Backdrop
 */

export const renderBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop
    {...props}
    appearsOnIndex={0}
    disappearsOnIndex={-1}
    opacity={0.38}
    pressBehavior="close"
  />
)

/**
 *
 * @param detached
 * @returns
 *
 * @description
 * In case the modal is detached, we need to add some extra props to the modal to make it look like a detached modal.
 */

const getDetachedProps = (
  detached: boolean,
  {
    bottomInset,
    containerStyle,
    shadowColor,
    style,
  }: Pick<BottomSheetModalProps, "bottomInset" | "containerStyle" | "style"> & {
    shadowColor: string
  },
) => {
  if (detached) {
    return {
      detached: true,
      bottomInset: bottomInset ?? getFloatingBottomInset(),
      containerStyle: [
        {
          elevation: 2000,
          marginHorizontal: FLOATING_SHEET_SIDE_INSET,
          shadowColor,
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 0.18,
          shadowRadius: 28,
          zIndex: 2000,
        },
        containerStyle,
      ],
      style: [
        {
          overflow: "hidden",
          borderRadius: FLOATING_SHEET_RADIUS,
          borderBottomLeftRadius: FLOATING_SHEET_RADIUS,
          borderBottomRightRadius: FLOATING_SHEET_RADIUS,
          borderTopLeftRadius: FLOATING_SHEET_RADIUS,
          borderTopRightRadius: FLOATING_SHEET_RADIUS,
        },
        style,
      ],
    } as Partial<BottomSheetModalProps>
  }

  if (bottomInset === undefined) {
    return {} as Partial<BottomSheetModalProps>
  }

  return { bottomInset } as Partial<BottomSheetModalProps>
}

/**
 * ModalHeader
 */

const ModalHeader = React.memo(({ title, dismiss }: ModalHeaderProps) => {
  return (
    <>
      {title && (
        <View className="flex-row bg-card px-2 py-4">
          <View className="size-6" />
          <View className="flex-1">
            <Text className="text-center text-[16px] font-bold text-primary">
              {title}
            </Text>
          </View>
        </View>
      )}
      <CloseButton close={dismiss} />
    </>
  )
})
ModalHeader.displayName = "ModalHeader"
const CloseButton = ({ close }: { close: () => void }) => {
  return (
    <Pressable
      onPress={close}
      className="absolute right-3 top-3 size-6 items-center justify-center "
      haptic
      hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
      accessibilityLabel="close modal"
      accessibilityRole="button"
      accessibilityHint="closes the modal"
      transition
    >
      <Svg
        className="fill-gray-500 dark:fill-gray-400"
        width={24}
        height={24}
        fill="none"
        viewBox="0 0 24 24"
      >
        <Path d="M18.707 6.707a1 1 0 0 0-1.414-1.414L12 10.586 6.707 5.293a1 1 0 0 0-1.414 1.414L10.586 12l-5.293 5.293a1 1 0 1 0 1.414 1.414L12 13.414l5.293 5.293a1 1 0 0 0 1.414-1.414L13.414 12l5.293-5.293Z" />
      </Svg>
    </Pressable>
  )
}
