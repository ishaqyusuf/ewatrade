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
    !qa.clientEnabled ||
    !qa.authorization ||
    !fixtureFacts ||
    (auth.isAuthenticated && !auth.profile?.businessId)
  ) {
    return null
  }

  function fill() {
    sequence.current += 1
    onFill(
      createQaFixtureContext({
        currencyCode: fixtureFacts.currencyCode,
        domain: fixtureFacts.qaDomain,
        invocationId: Crypto.randomUUID(),
        seed: `${fixtureFacts.seed}:${formId}`,
        storeId: fixtureFacts.storeId ?? "unselected",
        tenantId: fixtureFacts.tenantId,
        timezone: fixtureFacts.timezone,
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
      <View className="gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3">
        <Text className="text-sm font-bold text-foreground">
          Replace the current draft?
        </Text>
        <Text className="text-xs leading-5 text-muted-foreground">
          Cancel keeps every manual edit. Replace applies QA fixture values but
          does not submit this form.
        </Text>
        <View className="flex-row justify-end gap-2">
          <Pressable
            accessibilityRole="button"
            className="min-h-11 justify-center rounded-xl px-4"
            onPress={() => setConfirming(false)}
          >
            <Text className="text-sm font-bold text-muted-foreground">
              Cancel
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            className="min-h-11 justify-center rounded-xl bg-primary px-4"
            onPress={fill}
          >
            <Text className="text-sm font-bold text-primary-foreground">
              Replace
            </Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <View className="flex-row items-center justify-end gap-2">
      {canUndo && onUndo ? (
        <Pressable
          accessibilityLabel="Undo QA Quick Fill"
          accessibilityRole="button"
          className="min-h-11 flex-row items-center gap-2 rounded-xl px-3"
          onPress={onUndo}
        >
          <Icon className="size-sm text-muted-foreground" name="Undo2" />
          <Text className="text-xs font-bold text-muted-foreground">Undo</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityHint={`Uses ${qa.authorization.qaDomain} and never submits the form`}
        accessibilityLabel={label}
        accessibilityRole="button"
        className="min-h-11 flex-row items-center gap-2 rounded-xl bg-primary px-4"
        haptic
        onPress={requestFill}
        transition
      >
        <Icon className="size-sm text-primary-foreground" name="WandSparkles" />
        <Text className="text-xs font-black text-primary-foreground">
          {label}
        </Text>
        <View className="rounded bg-primary-foreground/15 px-1.5 py-0.5">
          <Text className="text-[9px] font-black text-primary-foreground">
            QA
          </Text>
        </View>
      </Pressable>
    </View>
  )
}
