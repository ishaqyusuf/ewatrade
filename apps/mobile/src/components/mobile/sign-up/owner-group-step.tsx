import {
  AuthActionButton,
  AuthMethodButton,
} from "@/components/mobile/auth-header"
import { FormField } from "@/components/mobile/form-field"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { getPlan } from "@/lib/retail-ops-subscription"
import { findBusinessType } from "@ewatrade/utils/business-types"
import type {
  OwnerSetupBusiness,
  OwnerSetupDraft,
} from "@ewatrade/utils/owner-signup"
import { moveOwnerBusinessType } from "@ewatrade/utils/owner-signup"
import { normalizeStoreLink } from "@ewatrade/utils/store-link"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useEffect, useRef, useState } from "react"
import { PanResponder, View } from "react-native"
import { BusinessTypeAvatar } from "./business-type-avatar"
import { StoreLinkField } from "./store-link-field"

export function OwnerGroupStep({
  businesses,
  plan,
  onChange,
  onPlan,
  onPreset,
  onReady,
}: {
  businesses: OwnerSetupBusiness[]
  plan: OwnerSetupDraft["planId"]
  onChange: (businesses: OwnerSetupBusiness[]) => void
  onPlan: (plan: OwnerSetupDraft["planId"]) => void
  onPreset: (mode: "together" | "separate") => void
  onReady: (ready: boolean) => void
}) {
  const colors = useColors()
  const menu = useModal()
  const [moving, setMoving] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [availability, setAvailability] = useState<Record<string, boolean>>({})
  const targets = useRef(new Map<number | "new", View>())
  const edited = useRef(new Set<number>())
  const limit = getPlan(plan).limits.businesses
  function change(index: number, patch: Partial<OwnerSetupBusiness>) {
    onChange(businesses.map((b, i) => (i === index ? { ...b, ...patch } : b)))
  }
  useEffect(() => {
    const next = availability
    onReady(
      businesses.every(
        (b, i) =>
          b.typeKeys.length > 0 &&
          !!b.name.trim() &&
          (i === 0 || next[b.slug] === true),
      ) && new Set(businesses.map((b) => b.slug)).size === businesses.length,
    )
  }, [businesses, availability, onReady])

  async function drop(key: string, x: number, y: number) {
    const rectangles = await Promise.all(
      [...targets.current].map(
        ([id, node]) =>
          new Promise<{
            id: number | "new"
            x: number
            y: number
            width: number
            height: number
          }>((resolve) =>
            node.measureInWindow((left, top, width, height) =>
              resolve({ id, x: left, y: top, width, height }),
            ),
          ),
      ),
    )
    const target = rectangles.find(
      (r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height,
    )
    if (target) onChange(moveOwnerBusinessType(businesses, key, target.id))
    setDragging(null)
  }
  function move(target: number | "new") {
    if (moving) onChange(moveOwnerBusinessType(businesses, moving, target))
    setMoving(null)
    menu.dismiss()
  }
  return (
    <View style={{ gap: 16 }}>
      <QaQuickFillButton
        formId="mobile.signup.group"
        isDirty={businesses.length > 1}
        onFill={() =>
          onChange(
            businesses.map((b, i) =>
              i
                ? {
                    ...b,
                    name: `${businesses[0]?.name ?? "My business"} ${i + 1}`,
                    slug: normalizeStoreLink(
                      `${businesses[0]?.slug ?? "business"}-${i + 1}`,
                    ),
                  }
                : b,
            ),
          )
        }
      />
      <AuthMethodButton
        label="All one business"
        onPress={() => onPreset("together")}
      />
      <AuthMethodButton
        label="Each separate"
        onPress={() => onPreset("separate")}
      />
      {businesses.map((business, index) => (
        <View
          key={index === 0 ? "first" : business.typeKeys.join(",")}
          ref={(node) => {
            if (node) targets.current.set(index, node)
            else targets.current.delete(index)
          }}
          collapsable={false}
          style={{
            gap: 12,
            borderWidth: 1,
            borderColor: dragging ? colors.primary : colors.border,
            borderRadius: 20,
            padding: 14,
          }}
        >
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <BusinessTypeAvatar typeKey={business.typeKeys[0] ?? "other"} />
            <Text className="flex-1 text-sm font-bold text-foreground">
              Business {index + 1}
              {index >= limit ? " · Waits for an upgrade" : ""}
            </Text>
          </View>
          {index === 0 ? (
            <>
              <Text className="text-sm font-bold text-foreground">
                {business.name}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {business.slug}.ewatrade.com
              </Text>
            </>
          ) : (
            <>
              <FormField
                label={`Business ${index + 1} name`}
                value={business.name}
                onChangeText={(name) =>
                  change(index, {
                    name,
                    ...(!edited.current.has(index)
                      ? { slug: normalizeStoreLink(name) }
                      : {}),
                  })
                }
                variant="green-gate"
                maxLength={120}
              />
              <StoreLinkField
                value={business.slug}
                onChange={(slug) => {
                  edited.current.add(index)
                  change(index, { slug })
                }}
                onAvailability={(ok) =>
                  setAvailability((current) => {
                    if (current[business.slug] === ok) return current
                    const next = { ...current, [business.slug]: ok }

                    return next
                  })
                }
              />
            </>
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {business.typeKeys.map((key) => (
              <TypeChip
                key={key}
                typeKey={key}
                onMenu={() => {
                  setMoving(key)
                  menu.present()
                }}
                onStart={() => setDragging(key)}
                onDrop={(x, y) => void drop(key, x, y)}
                onCancel={() => setDragging(null)}
              />
            ))}
          </View>
          {business.typeKeys.length === 0 ? (
            <Text className="text-xs text-destructive">
              Move a type here before continuing.
            </Text>
          ) : null}
        </View>
      ))}
      <View
        ref={(node) => {
          if (node) targets.current.set("new", node)
          else targets.current.delete("new")
        }}
        collapsable={false}
        className="rounded-[20px] border border-dashed border-border p-3.5"
      >
        <Text className="text-sm font-bold text-foreground">New business</Text>
        <Text className="text-xs text-muted-foreground">
          Drag a type here, or tap a type and choose A new business.
        </Text>
      </View>
      {businesses.length > 1 ? (
        <View className="gap-3 rounded-[20px] bg-card p-3.5">
          <Text className="text-sm font-bold text-foreground">
            {businesses.length} businesses, one login
          </Text>
          <Text className="text-xs text-muted-foreground">
            Starter includes 1 business. Growth runs up to 3 and Pro up to 10.
            Both are free during launch.
          </Text>
          <AuthActionButton
            onPress={() => onPlan(businesses.length > 3 ? "pro" : "growth")}
          >
            Use {businesses.length > 3 ? "Pro" : "Growth"}
            {plan !== "starter" ? " ✓" : ""}
          </AuthActionButton>
          <AuthMethodButton
            label={`Starter for now${plan === "starter" ? " ✓" : ""}`}
            onPress={() => onPlan("starter")}
          />
          <Text className="text-xs text-muted-foreground">
            {plan === "starter"
              ? "The extras wait on Home until you upgrade."
              : "Each business has its own stock, store link and reports."}
          </Text>
        </View>
      ) : null}
      <Modal ref={menu.ref} title="Move to…" snapPoints={["60%"]}>
        <BottomSheetScrollView contentContainerStyle={{ padding: 18, gap: 12 }}>
          {businesses.map((b, i) => (
            <AuthMethodButton
              key={b.slug || String(i)}
              label={b.name || `Business ${i + 1}`}
              onPress={() => move(i)}
            />
          ))}
          <AuthMethodButton
            label="A new business"
            onPress={() => move("new")}
          />
        </BottomSheetScrollView>
      </Modal>
    </View>
  )
}
function TypeChip({
  typeKey,
  onMenu,
  onStart,
  onDrop,
  onCancel,
}: {
  typeKey: string
  onMenu: () => void
  onStart: () => void
  onDrop: (x: number, y: number) => void
  onCancel: () => void
}) {
  const handlers = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 12,
    onPanResponderGrant: onStart,
    onPanResponderRelease: (_, g) => onDrop(g.moveX, g.moveY),
    onPanResponderTerminate: onCancel,
  })
  return (
    <View {...handlers.panHandlers}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${findBusinessType(typeKey)?.label}. Move to another business`}
        accessibilityActions={[
          { name: "activate", label: "Move to another business" },
        ]}
        onAccessibilityAction={onMenu}
        onPress={onMenu}
        className="min-h-11 justify-center rounded-full border border-border bg-card px-3.5"
      >
        <Text className="text-xs font-semibold text-foreground">
          {findBusinessType(typeKey)?.label}
        </Text>
      </Pressable>
    </View>
  )
}
