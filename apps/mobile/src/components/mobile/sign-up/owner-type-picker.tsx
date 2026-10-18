import { AuthActionButton } from "@/components/mobile/auth-header"
import { BottomSearchFooter } from "@/components/mobile/bottom-search-footer"
import { FormField } from "@/components/mobile/form-field"
import { RowDivider } from "@/components/mobile/green-till/kit"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import {
  BUSINESS_TYPES,
  BUSINESS_TYPE_GROUPS,
  findBusinessType,
} from "@ewatrade/utils/business-types"
import { rankBySearch } from "@ewatrade/utils/search-rank"
import { Fragment, useMemo, useState } from "react"
import { ScrollView } from "react-native"
import { BusinessTypeAvatar } from "./business-type-avatar"

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
  const [group, setGroup] = useState<string | null>(null)
  const types = useMemo(
    () =>
      rankBySearch(BUSINESS_TYPES, query, (t) => [
        t.label,
        t.examples,
        t.group,
      ]),
    [query],
  )
  const visible = [
    ...types.filter((t) => t.key !== "other" && (!group || t.group === group)),
    ...BUSINESS_TYPES.filter((t) => t.key === "other"),
  ]
  const pick = (key: string) =>
    onSelected(
      multi
        ? selected.includes(key)
          ? selected.filter((k) => k !== key)
          : [...selected, key]
        : selected[0] === key
          ? []
          : [key],
    )
  return (
    <>
      <QaQuickFillButton
        formId="mobile.signup.types"
        isDirty={selected.length > 0}
        onFill={() => onSelected(["poultry"])}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
      >
        <Pressable
          className="min-h-11 justify-center rounded-full border border-border bg-card px-3.5"
          accessibilityRole="button"
          onPress={() => setGroup(null)}
        >
          <Text className="text-xs font-bold text-primary">All</Text>
        </Pressable>
        {BUSINESS_TYPE_GROUPS.map((g) => (
          <Pressable
            key={g.key}
            accessibilityRole="button"
            accessibilityState={{ selected: group === g.key }}
            className={`min-h-11 justify-center rounded-full border px-3.5 ${group === g.key ? "border-primary bg-primary/10" : "border-border bg-card"}`}
            onPress={() => setGroup(g.key)}
          >
            <Text className="text-xs text-foreground">{g.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View className="overflow-hidden rounded-[20px] bg-card">
        {visible.map((type, index) => (
          <Fragment key={type.key}>
            <Pressable
              accessibilityRole={multi ? "checkbox" : "radio"}
              accessibilityState={{ checked: selected.includes(type.key) }}
              accessibilityLabel={`${type.label}. ${type.examples}`}
              className="min-h-[72px] flex-row items-center gap-3 px-3.5 py-3"
              onPress={() => pick(type.key)}
            >
              <BusinessTypeAvatar typeKey={type.key} />
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-bold text-foreground">
                  {type.label}
                </Text>
                <Text className="text-xs text-muted-foreground">
                  {type.examples}
                </Text>
              </View>
              {multi ? (
                <Text
                  accessibilityElementsHidden
                  className="text-lg text-primary"
                >
                  {selected.includes(type.key) ? "☑" : "☐"}
                </Text>
              ) : null}
              {index < visible.length - 1 ? <RowDivider /> : null}
            </Pressable>
          </Fragment>
        ))}
      </View>
      {visible.every((t) => t.key === "other") && query.trim() ? (
        <Text className="text-sm text-muted-foreground">
          No matching types. Try another word or choose Something else.
        </Text>
      ) : null}
      {selected.includes("other") ? (
        <FormField
          label="What kind of business is it?"
          placeholder="e.g. Event rentals, car wash, POS agent"
          value={other}
          maxLength={60}
          onChangeText={onOther}
          variant="green-gate"
        />
      ) : null}
      <View style={{ height: footerHeight + 24 }} />
    </>
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
  onContinue,
}: {
  query: string
  onQuery: (v: string) => void
  onFocus: (v: boolean) => void
  onHeight: (v: number) => void
  multi: boolean
  selected: string[]
  valid: boolean
  onMore: () => void
  onContinue: () => void
}) {
  return (
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
      {selected.length > 0 ? (
        <View className="gap-3 rounded-[20px] bg-card p-3.5 shadow-sm">
          {!multi ? (
            <View className="flex-row items-center gap-3">
              <BusinessTypeAvatar typeKey={selected[0] ?? "other"} />
              <View className="min-w-0 flex-1">
                <Text className="text-xs text-muted-foreground">
                  Your business type
                </Text>
                <Text className="text-sm font-bold text-foreground">
                  {findBusinessType(selected[0])?.label}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                className="min-h-11 justify-center px-3.5"
                onPress={onMore}
              >
                <Text className="text-xs font-bold text-primary">
                  Select more types
                </Text>
              </Pressable>
            </View>
          ) : null}
          <AuthActionButton disabled={!valid} onPress={onContinue}>
            {multi ? `Continue with ${selected.length} types` : "Proceed"}
          </AuthActionButton>
        </View>
      ) : null}
    </BottomSearchFooter>
  )
}
