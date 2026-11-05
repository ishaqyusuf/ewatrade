import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { FormField } from "@/components/mobile/form-field"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { View } from "@/components/ui/view"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_GROUPS,
  type BusinessType,
  findBusinessType,
} from "@ewatrade/utils/business-types"
import { rankBySearch } from "@ewatrade/utils/search-rank"
import { BottomSheetView } from "@gorhom/bottom-sheet"
import { useEffect, useMemo, useRef } from "react"
import { Text } from "react-native"
import { type View as NativeView, ScrollView } from "react-native"
import { BusinessTypeAvatar } from "./business-type-avatar"
import {
  useOwnerSectionScroll,
  useOwnerSignupColors,
} from "./owner-signup-frame"
import { ownerTypePickPresentation } from "./owner-type-pick"

export function OwnerTypePicker({
  selected,
  other,
  onSelected,
  onOther,
  query,
  multi,
  footerHeight,
}: {
  selected: string[]
  other: string
  onSelected: (keys: string[]) => void
  onOther: (text: string) => void
  query: string
  multi: boolean
  footerHeight: number
}) {
  const colors = useOwnerSignupColors()
  const largeText = useLargeTextLayout()
  const jump = useOwnerSectionScroll()
  const sections = useRef(new Map<string, NativeView>())
  // Picking "Something else" adds its field under the footer; bring it up.
  const revealOther = useRef(false)
  const otherField = useRef<NativeView>(null)
  const types = useMemo(
    () =>
      rankBySearch(BUSINESS_TYPES, query, (type) => [
        { text: type.label },
        { text: type.examples },
        { text: type.group },
      ]),
    [query],
  )
  const groups = BUSINESS_TYPE_GROUPS.map((group) => ({
    ...group,
    types: types.filter(
      (type) => type.key !== "other" && type.group === group.key,
    ),
  })).filter((group) => group.types.length > 0)
  const otherType = BUSINESS_TYPES.find((type) => type.key === "other")
  function pick(key: string) {
    if (key === "other" && !selected.includes(key)) revealOther.current = true
    onSelected(
      multi
        ? selected.includes(key)
          ? selected.filter((value) => value !== key)
          : [...selected, key]
        : [key],
    )
  }
  function row(
    type: BusinessType,
    index: number,
    rows: BusinessType[] = [type],
  ) {
    const chosen = selected.includes(type.key)
    return (
      <Pressable
        key={type.key}
        accessibilityRole={multi ? "checkbox" : "radio"}
        accessibilityState={{ checked: chosen }}
        accessibilityLabel={`${type.label}. ${type.examples}`}
        onPress={() => pick(type.key)}
        style={{
          minHeight: 64,
          paddingVertical: 10,
          paddingHorizontal: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          backgroundColor: chosen ? colors.accent : colors.background,
        }}
      >
        {index < rows.length - 1 ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              bottom: 0,
              left: 12,
              right: 12,
              height: 1,
              backgroundColor: colors.border,
            }}
          />
        ) : null}
        <BusinessTypeAvatar typeKey={type.key} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontSize: 16,
              lineHeight: 22,
              fontWeight: "700",
              color: colors.foreground,
            }}
          >
            {type.label}
          </Text>
          <Text
            numberOfLines={largeText ? undefined : 1}
            style={{
              fontSize: 16,
              lineHeight: 22,
              color: colors.mutedForeground,
            }}
          >
            {type.examples}
          </Text>
        </View>
        {multi ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Icon
              name={chosen ? "CheckSquare" : "Square"}
              size={22}
              color={chosen ? colors.primary : colors.border}
            />
          </View>
        ) : null}
      </Pressable>
    )
  }
  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -18 }}
        contentContainerStyle={{
          gap: 6,
          paddingHorizontal: 18,
          paddingBottom: 2,
        }}
      >
        {BUSINESS_TYPE_GROUPS.map((group) => (
          <Pressable
            key={group.key}
            accessibilityRole="button"
            hitSlop={4}
            onPress={() => {
              const target = sections.current.get(group.key)
              if (target) jump(target)
            }}
            style={{
              minHeight: 36,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: colors.muted,
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontSize: 16,
                lineHeight: 22,
                fontWeight: "700",
                color: colors.foreground,
              }}
            >
              {group.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {groups.map((group) => (
        <View
          key={group.key}
          ref={(node) => {
            if (node) sections.current.set(group.key, node)
            else sections.current.delete(group.key)
          }}
          collapsable={false}
        >
          <Text
            accessibilityRole="header"
            style={{
              fontSize: 16,
              lineHeight: 22,
              fontWeight: "800",
              color: colors.mutedForeground,
              letterSpacing: 0.69,
              textTransform: "uppercase",
              marginTop: 18,
              marginBottom: 8,
            }}
          >
            {group.label}
          </Text>
          <View
            accessibilityRole={multi ? undefined : "radiogroup"}
            accessibilityLabel={`${group.label} business types`}
            style={{
              borderRadius: 18,
              overflow: "hidden",
              backgroundColor: colors.background,
            }}
          >
            {group.types.map(row)}
          </View>
        </View>
      ))}
      {!groups.length && query.trim() ? (
        <Text className="py-4 text-sm text-muted-foreground">
          No matching types. Try another word or choose Something else.
        </Text>
      ) : null}
      <Text
        accessibilityRole="header"
        style={{
          fontSize: 16,
          lineHeight: 22,
          fontWeight: "800",
          color: colors.mutedForeground,
          letterSpacing: 0.69,
          textTransform: "uppercase",
          marginTop: 18,
          marginBottom: 8,
        }}
      >
        Not listed
      </Text>
      <View style={{ borderRadius: 18, overflow: "hidden" }}>
        {otherType ? row(otherType, 0) : null}
      </View>
      {selected.includes("other") ? (
        <View
          ref={otherField}
          onLayout={() => {
            if (!revealOther.current || !otherField.current) return
            revealOther.current = false
            jump(otherField.current)
          }}
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 16,
            backgroundColor: colors.accent,
          }}
        >
          <FormField
            label="What kind of business is it?"
            placeholder="e.g. Event rentals, car wash, POS agent"
            value={other}
            maxLength={60}
            onChangeText={onOther}
            variant="green-gate"
          />
        </View>
      ) : null}
      <View style={{ height: footerHeight + 24 }} />
    </View>
  )
}

export function OwnerTypeFooter({
  query,
  onQuery,
  onFocus,
  onHeight,
  multi,
  selected,
  valid,
  onMore,
  onClear,
  onContinue,
  pickRequest,
}: {
  query: string
  onQuery: (value: string) => void
  onFocus: (value: boolean) => void
  onHeight: (value: number) => void
  multi: boolean
  selected: string[]
  valid: boolean
  onMore: () => void
  onClear: () => void
  onContinue: () => void
  pickRequest: number
}) {
  const colors = useOwnerSignupColors()
  const largeText = useLargeTextLayout()
  const sheet = useModal()
  const presentedPick = useRef(0)
  const {
    otherOnPage,
    sheet: showSheet,
    continueInFooter,
  } = ownerTypePickPresentation({ multi, selected })
  useEffect(() => {
    if (pickRequest === 0) {
      presentedPick.current = 0
      sheet.dismiss()
      return
    }
    if (!showSheet) sheet.dismiss()
    if (pickRequest <= presentedPick.current) return
    presentedPick.current = pickRequest
    if (showSheet) sheet.present()
  }, [pickRequest, showSheet, sheet.dismiss, sheet.present])
  function proceed() {
    if (!valid) return
    sheet.dismiss()
    onContinue()
  }
  const primary = (
    <Pressable
      accessibilityRole="button"
      disabled={!valid}
      onPress={proceed}
      style={{
        flex: multi || largeText || otherOnPage ? undefined : 1,
        minHeight: 48,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 999,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: valid ? colors.primary : colors.muted,
        opacity: valid ? 1 : 0.5,
      }}
    >
      <Text
        style={{
          color: valid ? colors.primaryForeground : colors.mutedForeground,
          fontSize: 16,
          lineHeight: 20,
          fontWeight: "800",
        }}
      >
        {multi
          ? `Continue with ${selected.length} ${selected.length === 1 ? "type" : "types"}`
          : "Continue"}
      </Text>
      <Icon
        name="ArrowRight"
        size={18}
        color={valid ? colors.primaryForeground : colors.mutedForeground}
      />
    </Pressable>
  )
  return (
    <>
      <BottomSearchFooter
        accessibilityLabel="Search business types"
        placeholder="Search, e.g. eggs, salon, phones"
        value={query}
        onChangeText={onQuery}
        onFocusChange={onFocus}
        onHeightChange={onHeight}
        totalCount={BUSINESS_TYPES.length}
        alwaysShowSearch
        actionsAboveSearch
        localSearch
      >
        {continueInFooter ? primary : null}
      </BottomSearchFooter>
      <Modal
        ref={sheet.ref}
        title="Your business type"
        hideHeader
        enableDynamicSizing
        backgroundStyle={{
          backgroundColor: colors.card,
          borderColor: colors.border,
        }}
      >
        <BottomSheetView
          style={{ paddingHorizontal: 18, paddingBottom: 22, gap: 16 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <BusinessTypeAvatar typeKey={selected[0] ?? "other"} size={44} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  fontSize: 16,
                  lineHeight: 22,
                  fontWeight: "700",
                  color: colors.mutedForeground,
                }}
              >
                Your business type
              </Text>
              <Text
                style={{
                  fontSize: 17,
                  lineHeight: 24,
                  fontWeight: "700",
                  color: colors.foreground,
                }}
              >
                {findBusinessType(selected[0])?.label}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear pick"
              onPress={() => {
                sheet.dismiss()
                onClear()
              }}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: colors.muted,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="X" size={18} color={colors.foreground} />
            </Pressable>
          </View>
          <View style={{ flexDirection: largeText ? "column" : "row", gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                sheet.dismiss()
                onMore()
              }}
              style={{
                flex: largeText ? undefined : 1,
                minHeight: 48,
                paddingHorizontal: 10,
                paddingVertical: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  lineHeight: 22,
                  fontWeight: "800",
                  color: colors.primary,
                }}
              >
                Select more types
              </Text>
            </Pressable>
            {primary}
          </View>
        </BottomSheetView>
      </Modal>
    </>
  )
}
