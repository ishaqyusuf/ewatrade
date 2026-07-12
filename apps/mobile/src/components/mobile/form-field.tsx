import { Input } from "@/components/ui/input-2"
import { Text } from "@/components/ui/text"
import { cn } from "@/lib/utils"
import type { ComponentProps } from "react"
import { View } from "react-native"

type FormFieldProps = Omit<ComponentProps<typeof Input>, "className"> & {
  containerClassName?: string
  error?: string
  helper?: string
  inputClassName?: string
  label: string
}

export function FormField({
  containerClassName,
  error,
  helper,
  inputClassName,
  label,
  ...inputProps
}: FormFieldProps) {
  return (
    <View className={cn("gap-2", containerClassName)}>
      <Text className="text-sm font-semibold text-foreground">{label}</Text>
      <Input
        className={cn(
          "h-12 rounded-xl border-border bg-card px-4",
          error && "border-destructive",
          inputClassName,
        )}
        {...inputProps}
      />
      {error ? (
        <Text className="text-xs font-medium text-destructive">{error}</Text>
      ) : helper ? (
        <Text className="text-xs text-muted-foreground">{helper}</Text>
      ) : null}
    </View>
  )
}
