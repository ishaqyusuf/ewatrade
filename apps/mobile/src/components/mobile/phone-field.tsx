import { CountrySelect } from "@/components/mobile/country-select"
import { FormField } from "@/components/mobile/form-field"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { countryFlag } from "@ewatrade/utils/countries"
import {
  AsYouType,
  type CountryCode,
  getCountryCallingCode,
  getExampleNumber,
  isSupportedCountry,
  parsePhoneNumberFromString,
} from "libphonenumber-js"
import examples from "libphonenumber-js/mobile/examples"
import type { ComponentProps } from "react"

/** The digits a person typed, without spaces, brackets or dashes. */
export function phoneDigits(value: string) {
  return value.replace(/\D/g, "")
}

/**
 * Digits grouped the way the country writes them beside its +code, such as
 * 803 555 0142 for Nigeria. An entry typed with the trunk 0 keeps the national
 * form (0803 555 0142).
 */
export function formatNationalPhone(countryCode: string, digits: string) {
  if (!digits || !isSupportedCountry(countryCode)) return digits
  const country = countryCode as CountryCode
  if (digits.startsWith("0")) return new AsYouType(country).input(digits)
  const dial = getCountryCallingCode(country)
  return new AsYouType()
    .input(`+${dial}${digits}`)
    .replace(new RegExp(`^\\+${dial}\\s?`), "")
}

/** The country of a stored international number such as +2348035550142. */
export function phoneCountryOf(value?: string | null) {
  const phone = value?.trim()
  if (!phone?.startsWith("+")) return undefined
  return parsePhoneNumberFromString(phone)?.country
}

/** The country's own example mobile number, without its trunk 0. */
export function phonePlaceholder(countryCode: string) {
  if (!isSupportedCountry(countryCode)) return "Phone number"
  const example = getExampleNumber(countryCode as CountryCode, examples)
  return example
    ? formatNationalPhone(countryCode, example.nationalNumber)
    : "Phone number"
}

/**
 * Phone entry with its own country inside the field: flag ▾ +234 opens the
 * searchable country list, and the number is grouped as it is typed. The value
 * stays plain digits; callers combine it with the dial code when saving.
 */
export function PhoneField({
  countryCode,
  editable = true,
  label = "Phone",
  onChangeText,
  onCountryChange,
  value,
  variant,
}: {
  countryCode: string
  editable?: boolean
  label?: string
  onChangeText: (digits: string) => void
  onCountryChange: (code: string) => void
  value: string
  variant?: ComponentProps<typeof FormField>["variant"]
}) {
  const colors = useColors()
  return (
    <CountrySelect
      disabled={!editable}
      onChange={onCountryChange}
      renderTrigger={(country, open) => {
        const digitsValue = phoneDigits(value)
        const formatted = formatNationalPhone(country.code, digitsValue)
        return (
          <FormField
            accessibilityLabel={`${label}, plus ${country.dialCode}`}
            autoComplete="tel-national"
            editable={editable}
            keyboardType="phone-pad"
            label={label}
            leadingContent={
              <Pressable
                accessibilityHint="Opens the country list"
                accessibilityLabel={`Phone country: ${country.name}, plus ${country.dialCode}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: !editable }}
                className="min-h-11 flex-row items-center gap-1.5 pr-1"
                disabled={!editable}
                haptic
                noRipple
                onPress={open}
              >
                <Text className="text-xl">{countryFlag(country.code)}</Text>
                <Icon
                  className="size-[13px]"
                  color={colors.mutedForeground}
                  name="ChevronDown"
                />
                <Text className="text-[15px] font-semibold text-foreground">
                  +{country.dialCode}
                </Text>
              </Pressable>
            }
            onChangeText={(next) => {
              const digits = phoneDigits(next)
              // Backspacing over a grouping space removes the digit before it.
              if (digits === digitsValue && next.length < formatted.length) {
                onChangeText(digitsValue.slice(0, -1))
                return
              }
              onChangeText(digits)
            }}
            placeholder={phonePlaceholder(country.code)}
            textContentType="telephoneNumber"
            value={formatted}
            variant={variant}
          />
        )
      }}
      value={countryCode}
    />
  )
}
