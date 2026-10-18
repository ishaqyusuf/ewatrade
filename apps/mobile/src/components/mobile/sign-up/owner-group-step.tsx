import { AuthMethodButton } from "@/components/mobile/auth-header"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { GREEN_TILL_THEME } from "@/lib/green-till-theme"
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
import { Animated, PanResponder, TextInput, View } from "react-native"
import { useReducedMotion } from "react-native-reanimated"
import { BusinessTypeAvatar } from "./business-type-avatar"
import { useOwnerSignupColors } from "./owner-signup-frame"
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
  onConflictEditorOpened,
}: {
  businesses: OwnerSetupBusiness[]
  plan: OwnerSetupDraft["planId"]
  onChange: (businesses: OwnerSetupBusiness[]) => void
  onPlan: (plan: OwnerSetupDraft["planId"]) => void
  onPreset: (mode: "together" | "separate") => void
  email?: string
  onConflictEditorOpened: () => void
  conflictBusinessId?: string
  onReady: (ready: boolean) => void
  onDragging: (dragging: boolean) => void
}) {
  const largeText = useLargeTextLayout()
  const colors = useOwnerSignupColors()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
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
    <View ref={root} collapsable={false} style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {[
          { label: "All one business", mode: "together" },
          { label: "Each separate", mode: "separate" },
        ].map((item) => (
          <Pressable
            key={item.mode}
            accessibilityRole="button"
            onPress={() =>
              onPreset(item.mode === "together" ? "together" : "separate")
            }
            hitSlop={4}
            style={{
              minHeight: 36,
              justifyContent: "center",
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: colors.muted,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                lineHeight: 20,
                fontWeight: "700",
                color: colors.foreground,
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
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
            borderColor: hit === index ? colors.primary : "transparent",
            backgroundColor: hit === index ? colors.accent : colors.background,
            borderRadius: 18,
            padding: 12,
          }}
        >
          <View
            style={{
              flexDirection: largeText ? "column" : "row",
              gap: 10,
              alignItems: largeText ? "flex-start" : "center",
            }}
          >
            <BusinessTypeAvatar
              typeKey={business.typeKeys[0] ?? "other"}
              size={36}
            />
            <View
              style={{
                flex: largeText ? undefined : 1,
                width: largeText ? "100%" : undefined,
                minWidth: 0,
              }}
            >
              {index === 0 ? (
                <>
                  <Text
                    style={{
                      fontSize: 16,
                      lineHeight: 22,
                      fontWeight: "700",
                      color: colors.foreground,
                    }}
                  >
                    {business.name}
                  </Text>
                  <Text
                    style={{
                      fontSize: 14,
                      lineHeight: 20,
                      color: colors.mutedForeground,
                    }}
                  >
                    {business.slug}.ewatrade.com
                  </Text>
                </>
              ) : (
                <>
                  <TextInput
                    accessibilityLabel={`Business ${index + 1} name`}
                    placeholder="Name this business"
                    placeholderTextColor={colors.mutedForeground}
                    value={business.name}
                    maxLength={120}
                    onChangeText={(name) =>
                      change(index, {
                        name,
                        ...(!edited.current.has(business.id ?? String(index))
                          ? { slug: normalizeStoreLink(name) }
                          : {}),
                      })
                    }
                    style={{
                      minHeight: largeText ? 52 : 40,
                      paddingHorizontal: 12,
                      borderRadius: 14,
                      borderWidth: 1.5,
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      color: colors.foreground,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  />
                  <StoreLinkField
                    compact
                    value={business.slug}
                    forceEdit={business.id === conflictBusinessId}
                    onEditorOpened={
                      business.id === conflictBusinessId
                        ? onConflictEditorOpened
                        : undefined
                    }
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
            </View>
            {businesses.length > 1 ? (
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: colors.card,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    lineHeight: 20,
                    fontWeight: "800",
                    color: colors.mutedForeground,
                  }}
                >
                  {index + 1}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
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
          {index >= limit ? (
            <Text
              style={{
                fontSize: 14,
                lineHeight: 20,
                fontWeight: "600",
                color: palette.amberForeground,
              }}
            >
              Waits for an upgrade. You can set it up later.
            </Text>
          ) : null}
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
          borderRadius: 18,
          padding: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Icon name="Plus" size={20} color={colors.mutedForeground} />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              fontWeight: "700",
              color: colors.foreground,
            }}
          >
            New business
          </Text>
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: colors.mutedForeground,
            }}
          >
            Drag a type here to run it on its own
          </Text>
        </View>
      </View>
      {businesses.length > 1 ? (
        <View
          style={{
            marginTop: 2,
            borderRadius: 16,
            paddingVertical: 13,
            paddingHorizontal: 14,
            backgroundColor: palette.lilac,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <Icon name="Sparkles" size={16} color={palette.lilacForeground} />
            <Text
              style={{
                fontSize: 14,
                lineHeight: 20,
                fontWeight: "700",
                color: palette.lilacForeground,
              }}
            >
              {businesses.length} businesses, one login
            </Text>
          </View>
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: palette.lilacForeground,
            }}
          >
            Each business has its own store link, stock and reports, and you
            switch between them from Home. Starter includes 1 business. Growth
            runs up to 3 and Pro up to 10. Both are free during launch.
          </Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Choose a business plan"
            style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
          >
            {(
              [
                {
                  key: upgradePlan,
                  label: `Use ${upgradePlan === "pro" ? "Pro" : "Growth"} · free during launch`,
                },
                { key: "starter", label: "Starter for now" },
              ] as const
            ).map((item) => (
              <Pressable
                key={item.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: plan === item.key }}
                onPress={() => onPlan(item.key)}
                style={{
                  minHeight: 40,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor:
                    plan === item.key ? colors.primary : colors.card,
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    lineHeight: 20,
                    fontWeight: "700",
                    color:
                      plan === item.key
                        ? colors.primaryForeground
                        : colors.foreground,
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {plan === "starter" ? (
            <Text
              style={{
                fontSize: 14,
                lineHeight: 20,
                color: palette.lilacForeground,
              }}
            >
              We’ll set up {businesses[0]?.name || "your first business"} now.
              The others wait on Home until you upgrade.
            </Text>
          ) : null}
        </View>
      ) : (
        <View
          style={{
            padding: 14,
            borderRadius: 16,
            backgroundColor: palette.mint,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon name="Check" size={18} color={palette.mintForeground} />
          <Text
            style={{
              flex: 1,
              fontSize: 14,
              lineHeight: 20,
              color: palette.mintForeground,
            }}
          >
            You run these as one business. Its store will list everything you
            do.
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
  const colors = useOwnerSignupColors()
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
        hitSlop={5}
        style={{
          minHeight: 34,
          paddingVertical: 7,
          paddingLeft: 7,
          paddingRight: 11,
          borderRadius: 999,
          backgroundColor: colors.card,
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
        }}
      >
        <Icon name="GripHorizontal" size={14} color={colors.mutedForeground} />
        <Text
          style={{
            fontSize: 14,
            lineHeight: 20,
            fontWeight: "700",
            color: colors.foreground,
          }}
        >
          {findBusinessType(typeKey)?.label}
        </Text>
      </Pressable>
    </View>
  )
}
