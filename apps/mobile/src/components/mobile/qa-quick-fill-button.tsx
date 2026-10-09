import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useQaAccelerator } from "@/hooks/use-qa-accelerator"
import { resolveQaQuickFillIntent } from "@/lib/qa-quick-fill-interaction"
import {
  type QaFixtureContext,
  createQaFixtureContext,
} from "@ewatrade/utils/qa-fixtures"
import * as Crypto from "expo-crypto"
import { useRef, useState } from "react"

type QaQuickFillButtonProps = {
  canUndo?: boolean
  formId: string
  isDirty?: boolean
  label?: string
  onFill: (context: QaFixtureContext, sequence: number) => void
  onUndo?: () => void
}

export function QaQuickFillButton({
  canUndo,
  formId,
  isDirty,
  label = "Quick Fill",
  onFill,
  onUndo,
}: QaQuickFillButtonProps) {
  const qa = useQaAccelerator()
  const auth = useAuthContext()
  const sequence = useRef(0)
  const [confirming, setConfirming] = useState(false)
  // Signed-in fills fetch fresh fixture facts first, which can take a moment.
  const [filling, setFilling] = useState(false)
  const fixtureFacts = qa.fixtureContext
    ? qa.fixtureContext
    : !auth.isAuthenticated && qa.authorization
      ? {
          currencyCode: "NGN",
          qaDomain: qa.authorization.qaDomain,
          seed: qa.authorization.testerIdentity,
          storeId: "signup",
          tenantId: "signup",
          timezone: "Africa/Lagos",
        }
      : null

  if (
    !qa.toolingAvailable ||
    !fixtureFacts ||
    (auth.isAuthenticated && !auth.profile?.businessId)
  ) {
    return null
  }

  async function fill() {
    if (filling) return
    setFilling(true)
    const currentFacts = auth.isAuthenticated
      ? await qa.refreshFixtureContext().finally(() => setFilling(false))
      : fixtureFacts
    setFilling(false)
    if (!currentFacts) return
    sequence.current += 1
    onFill(
      createQaFixtureContext({
        currencyCode: currentFacts.currencyCode,
        domain: currentFacts.qaDomain,
        invocationId: Crypto.randomUUID(),
        seed: `${currentFacts.seed}:${formId}`,
        storeId: currentFacts.storeId ?? "unselected",
        tenantId: currentFacts.tenantId,
        timezone: currentFacts.timezone,
      }),
      sequence.current,
    )
    setConfirming(false)
  }

  function requestFill() {
    const intent = resolveQaQuickFillIntent({ action: "request", isDirty })
    if (intent === "confirm") setConfirming(true)
    else if (intent === "fill") fill()
  }

  if (confirming) {
    return (
      <View className="gap-2.5 rounded-[18px] border-[1.5px] border-primary/25 bg-accent p-3.5">
        <View className="flex-row items-center gap-2">
          <Icon className="size-[16px] text-primary" name="WandSparkles" />
          <Text className="flex-1 text-sm font-extrabold [-rn-line-height:20] text-foreground">
            Replace the current draft?
          </Text>
          <QaTag />
        </View>
        <Text className="text-[12.5px] [-rn-line-height:18] text-muted-foreground">
          Cancel keeps every manual edit. Replace applies QA fixture values but
          does not submit this form.
        </Text>
        <View className="flex-row justify-end gap-2">
          <Pressable
            accessibilityRole="button"
            className="min-h-10 justify-center rounded-full px-4 active:bg-card"
            onPress={() => setConfirming(false)}
          >
            <Text className="text-[13px] font-extrabold text-muted-foreground">
              Cancel
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            className="min-h-10 justify-center rounded-full bg-primary px-4 active:opacity-90"
            haptic
            onPress={fill}
          >
            <Text className="text-[13px] font-extrabold text-primary-foreground">
              Replace
            </Text>
          </Pressable>
        </View>
      </View>
    )
  }

  // A small Green Till pill: quiet enough to sit inside a real form, marked
  // QA so it is never mistaken for a product control.
  return (
    <View className="flex-row items-center justify-end gap-1.5">
      {canUndo && onUndo ? (
        <Pressable
          accessibilityLabel="Undo QA Quick Fill"
          accessibilityRole="button"
          className="min-h-11 flex-row items-center gap-1.5 rounded-full px-3 active:bg-muted"
          haptic
          onPress={onUndo}
        >
          <Icon className="size-[15px] text-muted-foreground" name="Undo2" />
          <Text className="text-[12.5px] font-bold text-muted-foreground">
            Undo
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityHint={`Uses ${fixtureFacts.qaDomain} and never submits the form`}
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ busy: filling }}
        className="min-h-11 justify-center"
        disabled={filling}
        haptic
        hitSlop={4}
        onPress={requestFill}
        testID="qa-quick-fill"
        transition
      >
        <View className="min-h-9 flex-row items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-primary/40 bg-accent pl-3 pr-1.5">
          <Icon className="size-[15px] text-primary" name="WandSparkles" />
          <Text className="text-[12.5px] font-bold [-rn-line-height:18] text-primary">
            {filling ? "Filling…" : label}
          </Text>
          <QaTag />
        </View>
      </Pressable>
    </View>
  )
}

function QaTag() {
  return (
    <View className="h-4 items-center justify-center rounded-full bg-primary px-1.5">
      <Text className="text-[9.5px] font-bold [-rn-line-height:12] [-rn-include-font-padding:false] [-rn-text-align-vertical:center] text-primary-foreground">
        QA
      </Text>
    </View>
  )
}
