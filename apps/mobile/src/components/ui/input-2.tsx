import { useColors } from "@/hooks/use-color"
import { cn } from "@/lib/utils"
import { BottomSheetTextInput } from "@gorhom/bottom-sheet"
import type { ComponentType } from "react"
import { VariableContextProvider } from "nativewind"
import {
  Platform,
  TextInput,
  type TextInputProps,
  type TextStyle,
} from "react-native"
import { useBottomSheetInput } from "./bottom-sheet-input-context"

type InputProps = TextInputProps &
  React.RefAttributes<TextInput> & {
    className?: string
    expand?: boolean
    foregroundColor?: string
    inputTextAlign?: "auto" | "center" | "left" | "right"
    placeholderClassName?: string
    unstyled?: boolean
  }

const NativeTextInput = TextInput as ComponentType<InputProps>
const NativeBottomSheetTextInput =
  BottomSheetTextInput as ComponentType<InputProps>

function Input({
  className,
  expand,
  foregroundColor,
  inputTextAlign,
  placeholderClassName,
  style,
  unstyled,
  ...props
}: InputProps) {
  const colors = useColors()
  const isBottomSheetInput = useBottomSheetInput()
  const embeddedSizingStyle: TextStyle = expand
    ? { flexBasis: 0, flexGrow: 1, flexShrink: 1 }
    : { width: "100%" }
  const embeddedInputStyle: TextStyle = {
    color: foregroundColor ?? colors.foreground,
    fontSize: 16,
    lineHeight: 20,
    minWidth: 0,
    opacity: props.editable === false ? 0.5 : 1,
    paddingHorizontal: 0,
    paddingVertical: 0,
    textAlign: inputTextAlign ?? "left",
    ...(props.multiline
      ? { minHeight: 72, textAlignVertical: "top" as const }
      : { height: 48 }),
    ...embeddedSizingStyle,
  }

  if (isBottomSheetInput) {
    return (
      <NativeBottomSheetTextInput
        placeholderTextColor={
          props.placeholderTextColor ?? colors.mutedForeground
        }
        selectionColor={props.selectionColor ?? colors.primary}
        style={
          unstyled
            ? [embeddedInputStyle, style]
            : [
                {
                  alignItems: "center",
                  backgroundColor: colors.card,
                  borderColor: className?.includes("border-destructive")
                    ? colors.destructive
                    : colors.border,
                  borderRadius: 12,
                  borderWidth: 1,
                  color: foregroundColor ?? colors.foreground,
                  flexDirection: "row",
                  fontSize: 16,
                  height: 48,
                  lineHeight: 20,
                  minWidth: 0,
                  opacity: props.editable === false ? 0.5 : 1,
                  paddingHorizontal: 16,
                  paddingVertical: 4,
                  textAlign: inputTextAlign ?? "left",
                  ...(expand
                    ? { flexBasis: 0, flexGrow: 1, flexShrink: 1 }
                    : { width: "100%" }),
                },
                style,
              ]
        }
        {...props}
      />
    )
  }

  if (unstyled) {
    // NativeWind owns this path unless the caller explicitly supplies native
    // geometry. Bottom-sheet inputs above remain a style-only native boundary.
    if (!style) {
      const field = (
        <NativeTextInput
          className={cn(
            "min-w-0 bg-transparent border-0 px-0 py-0 text-base text-foreground [-rn-line-height:20]",
            expand ? "basis-0 grow shrink" : "w-full",
            props.multiline
              ? "min-h-[72px] [-rn-text-align-vertical:top]"
              : "h-12",
            props.editable === false && "opacity-50",
            inputTextAlign === "center"
              ? "text-center"
              : inputTextAlign === "right"
                ? "text-right"
                : inputTextAlign === "auto"
                  ? "[-rn-text-align:auto]"
                  : "text-left",
            className,
            foregroundColor && "text-[color:var(--embedded-input-ink)]",
          )}
          placeholderTextColor={
            props.placeholderTextColor ?? colors.mutedForeground
          }
          selectionColor={props.selectionColor ?? colors.primary}
          {...props}
        />
      )
      return foregroundColor ? (
        <VariableContextProvider
          value={{ "--embedded-input-ink": foregroundColor }}
        >
          {field}
        </VariableContextProvider>
      ) : (
        field
      )
    }
    return (
      <NativeTextInput
        placeholderTextColor={
          props.placeholderTextColor ?? colors.mutedForeground
        }
        selectionColor={props.selectionColor ?? colors.primary}
        style={[embeddedInputStyle, style]}
        {...props}
      />
    )
  }

  return (
    <NativeTextInput
      className={cn(
        "flex h-12 w-full min-w-0 flex-row items-center border border-border bg-background px-3 py-1 text-base leading-5 text-foreground dark:bg-input/30 sm:h-9 rounded-lg",
        props.editable === false &&
          cn(
            "opacity-50",
            Platform.select({
              web: "disabled:pointer-events-none disabled:cursor-not-allowed",
            }),
          ),
        Platform.select({
          web: cn(
            "outline-none transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground md:text-sm",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
            "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
          ),
          native:
            "placeholder:text-muted-foreground/50 placeholder:dark:text-gray-400",
        }),
        className,
      )}
      placeholderTextColor={
        props.placeholderTextColor ?? colors.mutedForeground
      }
      selectionColor={props.selectionColor ?? colors.primary}
      style={[
        {
          color: colors.foreground,
          textAlign: inputTextAlign ?? "left",
          ...(expand
            ? { flexBasis: 0, flexGrow: 1, flexShrink: 1 }
            : undefined),
        },
        style,
      ]}
      {...props}
    />
  )
}

export { Input }
