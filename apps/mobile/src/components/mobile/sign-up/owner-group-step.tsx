import { AuthMethodButton } from "@/components/mobile/auth-header"
import { FormField } from "@/components/mobile/form-field"
import { QaQuickFillButton } from "@/components/mobile/qa-quick-fill-button"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
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
import { Animated, PanResponder, View } from "react-native"
import { useReducedMotion } from "react-native-reanimated"
import { BusinessTypeAvatar } from "./business-type-avatar"
import { StoreLinkField } from "./store-link-field"

export function OwnerGroupStep({
  businesses,
  plan,
  onChange,
  onPlan,
  onPreset,
  onReady,
  onDragging,
  email,
  conflictBusinessId,
}: {
  businesses: OwnerSetupBusiness[]
  plan: OwnerSetupDraft["planId"]
  onChange: (businesses: OwnerSetupBusiness[]) => void
  onPlan: (plan: OwnerSetupDraft["planId"]) => void
  onPreset: (mode: "together" | "separate") => void
  email?: string
  conflictBusinessId?: string
  onReady: (ready: boolean) => void
  onDragging: (dragging: boolean) => void
}) {
  const largeText = useLargeTextLayout()
  const colors = useColors()
  const menu = useModal()
  const [moving, setMoving] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [availability, setAvailability] = useState<Record<string, boolean>>({})
  const targets = useRef(new Map<number | "new", View>())
  const edited = useRef(new Set<string>())
  const root = useRef<View>(null)
  const offset = useRef({ x: 0, y: 0 })
  const rectangles = useRef<
    {
      id: number | "new"
      x: number
      y: number
      width: number
      height: number
    }[]
  >([])
  const pointer = useRef({ x: 0, y: 0 })
  const start = useRef({ x: 0, y: 0 })
  const ghost = useRef(new Animated.ValueXY()).current
  const [hit, setHit] = useState<number | "new" | null>(null)
  const generation = useRef(0)
  const [ghostReady, setGhostReady] = useState(false)
  const draggingCallback = useRef(onDragging)
  draggingCallback.current = onDragging
  useEffect(
    () => () => {
      generation.current++
      ghost.stopAnimation()
      draggingCallback.current(false)
    },
    [ghost],
  )
  const reducedMotion = useReducedMotion()
  const upgradePlan = businesses.length > 3 ? "pro" : "growth"
  function hitAt(x: number, y: number) {
    return (
      rectangles.current.find(
        (r) =>
          x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height,
      )?.id ?? null
    )
  }
  function endDrag(token = generation.current) {
    if (token !== generation.current) return
    generation.current++
    setGhostReady(false)
    setDragging(null)
    setHit(null)
    onDragging(false)
  }
  function dragMove(x: number, y: number) {
    pointer.current = { x, y }
    ghost.setValue({
      x: x - offset.current.x - 50,
      y: y - offset.current.y - 22,
    })
    setHit(hitAt(x, y))
  }
  function beginDrag(key: string, x: number, y: number) {
    const token = ++generation.current
    ghost.stopAnimation()
    rectangles.current = []
    setGhostReady(false)
    setHit(null)
    onDragging(true)
    setDragging(key)
    start.current = { x, y }
    pointer.current = { x, y }
    root.current?.measure((_x, _y, _width, _height, left, top) => {
      if (token !== generation.current) return
      offset.current = { x: left, y: top }
      dragMove(pointer.current.x, pointer.current.y)
      setGhostReady(true)
    })
    void Promise.all(
      [...targets.current].map(
        ([id, node]) =>
          new Promise<{
            id: number | "new"
            x: number
            y: number
            width: number
            height: number
          }>((resolve) =>
            node.measure((_x, _y, width, height, left, top) =>
              resolve({ id, x: left, y: top, width, height }),
            ),
          ),
      ),
    ).then((values) => {
      if (token !== generation.current) return
      rectangles.current = values
      setHit(hitAt(pointer.current.x, pointer.current.y))
    })
  }
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

  function drop(key: string, x: number, y: number) {
    const target = hitAt(x, y)
    if (target !== null) {
      onChange(moveOwnerBusinessType(businesses, key, target))
      endDrag()
      return
    }
    if (reducedMotion) {
      endDrag()
      return
    }
    const token = generation.current
    Animated.timing(ghost, {
      toValue: {
        x: start.current.x - offset.current.x - 50,
        y: start.current.y - offset.current.y - 22,
      },
      duration: 160,
      useNativeDriver: true,
    }).start(() => endDrag(token))
  }
  function move(target: number | "new") {
    if (moving) onChange(moveOwnerBusinessType(businesses, moving, target))
    setMoving(null)
    menu.dismiss()
  }
  return (
    <View ref={root} collapsable={false} style={{ gap: 16 }}>
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
          key={business.id}
          ref={(node) => {
            if (node) targets.current.set(index, node)
            else targets.current.delete(index)
          }}
          collapsable={false}
          style={{
            gap: 12,
            borderWidth: 1,
            borderColor: hit === index ? colors.primary : colors.border,
            borderRadius: 20,
            padding: 14,
          }}
        >
          <View
            style={{
              flexDirection: largeText ? "column" : "row",
              gap: 12,
              alignItems: largeText ? "flex-start" : "center",
            }}
          >
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
                    ...(!edited.current.has(business.id ?? String(index))
                      ? { slug: normalizeStoreLink(name) }
                      : {}),
                  })
                }
                variant="green-gate"
                maxLength={120}
              />
              <StoreLinkField
                value={business.slug}
                forceEdit={business.id === conflictBusinessId}
                email={email}
                onChange={(slug) => {
                  edited.current.add(business.id ?? String(index))
                  change(index, { slug })
                }}
                onCanonicalize={(slug) => change(index, { slug })}
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
                onStart={(x, y) => beginDrag(key, x, y)}
                onMove={dragMove}
                onDrop={(x, y) => void drop(key, x, y)}
                onCancel={() => endDrag()}
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
        style={{
          borderColor: hit === "new" ? colors.primary : colors.border,
          borderWidth: 1,
          borderStyle: "dashed",
          borderRadius: 20,
          padding: 14,
        }}
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
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Choose a business plan"
            style={{ gap: 8 }}
          >
            {(
              [
                {
                  key: upgradePlan,
                  label: `Use ${upgradePlan === "pro" ? "Pro" : "Growth"}`,
                },
                { key: "starter", label: "Starter for now" },
              ] as const
            ).map((choice) => (
              <Pressable
                key={choice.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: plan === choice.key }}
                onPress={() => onPlan(choice.key)}
                className={`min-h-11 flex-row items-center gap-3 rounded-xl border px-3.5 ${plan === choice.key ? "border-primary bg-primary/10" : "border-border bg-card"}`}
              >
                <Text className="flex-1 text-sm font-bold text-foreground">
                  {choice.label}
                </Text>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  {plan === choice.key ? (
                    <Icon name="CircleCheck" className="size-5 text-primary" />
                  ) : (
                    <View className="size-5 rounded-full border border-border" />
                  )}
                </View>
              </Pressable>
            ))}
          </View>
          <Text className="text-xs text-muted-foreground">
            {plan === "starter"
              ? "The extras wait on Home until you upgrade."
              : "Each business has its own stock, store link and reports."}
          </Text>
        </View>
      ) : (
        <View className="gap-2 rounded-[20px] bg-card p-3.5">
          <Text className="text-sm font-bold text-foreground">
            One business, one store link
          </Text>
          <Text className="text-xs text-muted-foreground">
            Your types share stock, customers and reports.
          </Text>
        </View>
      )}
      {dragging && ghostReady ? (
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            {
              position: "absolute",
              left: 0,
              top: 0,
              zIndex: 100,
              elevation: 12,
              borderWidth: 1,
              borderColor: colors.primary,
              borderRadius: 24,
              backgroundColor: colors.card,
              padding: 14,
            },
            { transform: ghost.getTranslateTransform() },
          ]}
        >
          <Text className="text-xs font-bold text-foreground">
            {findBusinessType(dragging)?.label}
          </Text>
        </Animated.View>
      ) : null}
      <Modal ref={menu.ref} title="Move to…" snapPoints={["60%"]}>
        <BottomSheetScrollView contentContainerStyle={{ padding: 18, gap: 12 }}>
          {businesses.map((b, i) => (
            <AuthMethodButton
              key={b.id}
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
  onMove,
  onDrop,
  onCancel,
}: {
  typeKey: string
  onMenu: () => void
  onStart: (x: number, y: number) => void
  onMove: (x: number, y: number) => void
  onDrop: (x: number, y: number) => void
  onCancel: () => void
}) {
  const callbacks = useRef({ onStart, onMove, onDrop, onCancel })
  callbacks.current = { onStart, onMove, onDrop, onCancel }
  const armed = useRef(false)
  const captured = useRef(false)
  const wasLongPress = useRef(false)
  const pressOutTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (pressOutTimer.current) clearTimeout(pressOutTimer.current)
    },
    [],
  )
  const handlers = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: () => armed.current,
      onMoveShouldSetPanResponder: () => armed.current,
      onPanResponderGrant: () => {
        if (pressOutTimer.current) clearTimeout(pressOutTimer.current)
        captured.current = true
      },
      onPanResponderMove: (_, g) => callbacks.current.onMove(g.moveX, g.moveY),
      onPanResponderRelease: (_, g) => {
        armed.current = false
        captured.current = false
        callbacks.current.onDrop(g.moveX, g.moveY)
      },
      onPanResponderTerminationRequest: () => !armed.current,
      onPanResponderTerminate: () => {
        armed.current = false
        captured.current = false
        callbacks.current.onCancel()
      },
    }),
  ).current
  return (
    <View {...handlers.panHandlers}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${findBusinessType(typeKey)?.label}. Move to another business`}
        accessibilityActions={[
          { name: "activate", label: "Move to another business" },
        ]}
        onAccessibilityAction={onMenu}
        delayLongPress={250}
        onPressIn={() => {
          if (pressOutTimer.current) clearTimeout(pressOutTimer.current)
          wasLongPress.current = false
        }}
        onLongPress={(event) => {
          armed.current = true
          wasLongPress.current = true
          callbacks.current.onStart(
            event.nativeEvent.pageX,
            event.nativeEvent.pageY,
          )
        }}
        onPressOut={(event) => {
          const { pageX, pageY } = event.nativeEvent
          // Responder takeover may terminate Pressability before its grant callback.
          pressOutTimer.current = setTimeout(() => {
            if (armed.current && !captured.current) {
              armed.current = false
              callbacks.current.onDrop(pageX, pageY)
            }
          }, 0)
        }}
        onPress={() => {
          if (!wasLongPress.current) onMenu()
        }}
        className="min-h-11 justify-center rounded-full border border-border bg-card px-3.5"
      >
        <Text className="text-xs font-semibold text-foreground">
          {findBusinessType(typeKey)?.label}
        </Text>
      </Pressable>
    </View>
  )
}
