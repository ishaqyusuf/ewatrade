import { Icon } from "@/components/ui/icon"
import { Modal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import {
  type BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet"
import { type RefObject, createContext, useContext } from "react"
import { View, useWindowDimensions } from "react-native"
import type { SellingUnitEditorFieldsProps } from "./catalog-setup-model"
import { catalogSetupClassName } from "./catalog-setup-presentation"

export const SellingUnitReferenceSheetContext = createContext<{
  ref: RefObject<BottomSheetModal | null>
  open: boolean
  present: () => void
  dismiss: () => void
  onDismiss: () => void
} | null>(null)

export function SellingUnitReferenceSelector({
  fields,
  market,
}: {
  fields: Pick<
    SellingUnitEditorFieldsProps,
    "referenceUnits" | "unitEditorDraft" | "onChangeDraft" | "unitName"
  >
  market: boolean
}) {
  const sheet = useContext(SellingUnitReferenceSheetContext)
  const { height } = useWindowDimensions()
  const units = fields.referenceUnits ?? []
  const current = fields.unitEditorDraft
  // Exclude descendants as well as self, so an edited ancestor cannot form a cycle.
  const excluded = new Set([current.id])
  let changed = true
  while (changed) {
    changed = false
    for (const unit of units)
      if (
        unit.referenceUnitId &&
        excluded.has(unit.referenceUnitId) &&
        !excluded.has(unit.id)
      ) {
        excluded.add(unit.id)
        changed = true
      }
  }
  const candidates = units.filter((unit) => !excluded.has(unit.id))
  if (!sheet || (!candidates.length && !current.referenceUnitId)) return null
  const name =
    units.find((unit) => unit.id === current.referenceUnitId)?.name ??
    (fields.unitName.trim() || "main unit")
  const choices = [
    { id: undefined, name: fields.unitName.trim() || "Main unit" },
    ...candidates,
  ]
  return (
    <View className="gap-2">
      <Text
        className={catalogSetupClassName(
          "text-sm font-bold text-foreground",
          market,
        )}
      >
        Build this unit from
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Reference unit: ${name}`}
        accessibilityState={{ expanded: sheet.open }}
        onPress={sheet.present}
        className={catalogSetupClassName(
          "min-h-12 flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3",
          market,
        )}
      >
        <Text
          className={catalogSetupClassName("flex-1 text-foreground", market)}
        >
          {name}
        </Text>
        <Icon
          name="ChevronDown"
          className={catalogSetupClassName(
            "size-sm text-muted-foreground",
            market,
          )}
        />
      </Pressable>
      <Modal
        ref={sheet.ref}
        hideHeader
        accessibilityLabel="Build this unit from"
        snapPoints={[]}
        enableDynamicSizing
        maxDynamicContentSize={height * 0.65}
        onDismiss={sheet.onDismiss}
      >
        <BottomSheetScrollView keyboardShouldPersistTaps="handled">
          <View className="gap-2 px-5 pt-2 pb-6">
            <View className="flex-row items-center gap-3">
              <Text
                accessibilityRole="header"
                className="flex-1 text-xl font-bold text-foreground"
              >
                Build this unit from
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close reference unit picker"
                onPress={sheet.dismiss}
                className="size-11 items-center justify-center rounded-full active:bg-accent"
              >
                <Icon name="X" className="size-sm text-muted-foreground" />
              </Pressable>
            </View>
            <Text className="text-sm text-muted-foreground">
              Choose what one selling unit contains.
            </Text>
            <View accessibilityRole="radiogroup" className="gap-2 pt-3">
              {choices.map((unit) => (
                <Pressable
                  key={unit.id ?? "canonical"}
                  accessibilityRole="radio"
                  accessibilityLabel={`Use ${unit.name} as reference unit`}
                  accessibilityState={{
                    selected: current.referenceUnitId === unit.id,
                  }}
                  className={catalogSetupClassName(
                    "min-h-12 flex-row items-center justify-between rounded-xl px-4 py-3 active:bg-accent",
                    market,
                  )}
                  onPress={() => {
                    if (current.referenceUnitId !== unit.id)
                      fields.onChangeDraft({
                        referenceUnitId: unit.id,
                        relationCount: "",
                        relationDirection: "canonical_per_unit",
                      })
                    sheet.dismiss()
                  }}
                >
                  <View className="min-w-0 flex-1 gap-1">
                    <Text className="font-bold text-foreground">
                      {unit.name}
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      {unit.id ? "Selling unit" : "Main unit"}
                    </Text>
                  </View>
                  {current.referenceUnitId === unit.id ? (
                    <Icon
                      name="Check"
                      className={catalogSetupClassName(
                        "size-sm text-primary",
                        market,
                      )}
                    />
                  ) : null}
                </Pressable>
              ))}
            </View>
          </View>
        </BottomSheetScrollView>
      </Modal>
      <Text
        className={catalogSetupClassName(
          "text-xs text-muted-foreground",
          market,
        )}
      >
        For example: 1 carton contains 6 trays. Choosing a different reference
        clears the count so you can confirm the new relationship.
      </Text>
    </View>
  )
}
