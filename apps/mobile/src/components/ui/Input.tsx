// import { useAuth } from '@providers/auth-provider'
import { useColors } from "@/hooks/use-color"
import { cn } from "@/lib/utils"
import { Ionicons } from "@expo/vector-icons"
import { useState } from "react"
import {
  type Control,
  Controller,
  type FieldValues,
  type Path,
} from "react-hook-form"
import { Text, TextInput, type TextInputProps, View } from "react-native"

interface InputProps<T extends FieldValues> extends TextInputProps {
  label?: string
  className?: string
  control: Control<T>
  name: Path<T>
  icon?: keyof typeof Ionicons.glyphMap
  secureTextEntry?: boolean
}

export function Input<T extends FieldValues>({
  label,
  className,
  control,
  name,
  icon,
  secureTextEntry = true,
  ...rest
}: InputProps<T>) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(true)
  const colors = useColors()
  // const { user } = useAuth()

  const togglePasswordVisibility = () => {
    setIsPasswordVisible(!isPasswordVisible)
  }

  return (
    <View>
      <Controller
        control={control}
        name={name}
        render={({
          field: { value, onBlur, onChange },
          fieldState: { error },
        }) => (
          <>
            <View className="flex-row justify-between">
              <Text className="mb-1 text-sm font-poppins-medium text-foreground">
                {label}
              </Text>
              {error && (
                <Text className="font-poppins text-xs text-destructive">
                  {error?.message}
                </Text>
              )}
            </View>
            <View
              className={cn(
                "flex-row items-center rounded-xl border bg-card p-4",
                error ? "border-destructive" : "border-border",
              )}
            >
              {icon ? (
                <Ionicons name={icon} size={20} color={colors.primary} />
              ) : null}
              <View className={cn("flex-1 mx-3", className)}>
                <TextInput
                  value={value}
                  onBlur={onBlur}
                  onChangeText={onChange}
                  secureTextEntry={
                    name === "password" ||
                    name === "confirmPassword" ||
                    name === "oldPassword" ||
                    name === "newPassword" ||
                    name === "confirmNewPassword"
                      ? isPasswordVisible
                      : false
                  }
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholderTextColor={colors.mutedForeground}
                  style={{
                    flex: 1,
                    color: colors.foreground,
                    fontFamily: "Poppins",
                    fontSize: 18,
                    textAlignVertical: "center",
                    paddingVertical: 0,
                    includeFontPadding: false,
                  }}
                  {...rest}
                />
              </View>
              {(name === "password" ||
                name === "confirmPassword" ||
                name === "oldPassword" ||
                name === "newPassword" ||
                name === "confirmNewPassword") &&
                String(value ?? "").length > 0 && (
                  <Ionicons
                    name={isPasswordVisible ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={colors.primary}
                    onPress={togglePasswordVisibility}
                  />
                )}
            </View>
          </>
        )}
      />
    </View>
  )
}
