import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { GREEN_TILL_THEME, type GreenTillTint } from "@/lib/green-till-theme"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type Href, useRouter } from "expo-router"

type NudgeKey = NonNullable<RouterOutputs["growth"]["activeNudge"]>["key"]

/** Mobile screen and look per server-chosen nudge. Routing only, never eligibility. */
const NUDGE_SCREENS: Record<
  NudgeKey,
  { href: string; icon: IconKeys; tint: GreenTillTint }
> = {
  first_sale: { href: "/create-sale-modal", icon: "Receipt", tint: "mint" },
  assistant_channel: {
    href: "/assistant-whatsapp",
    icon: "WhatsApp",
    tint: "mint",
  },
  site_setup: { href: "/domain-management-modal", icon: "Globe", tint: "sky" },
  money_accounts: {
    href: "/finance-accounts-modal",
    icon: "Wallet",
    tint: "amber",
  },
}

/**
 * Home: the one lifecycle nudge the daily sweep chose for this owner
 * (`growth.activeNudge`). Hidden when there is none or while offline-unread.
 */
export function LifecycleNudgeCard() {
  const trpc = useTRPC()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { colorScheme } = useColorScheme()
  const nudgeQuery = trpc.growth.activeNudge.queryOptions()
  const nudge = useQuery({ ...nudgeQuery, staleTime: 5 * 60_000 })
  const dismiss = useMutation(
    trpc.growth.dismissNudge.mutationOptions({
      onSuccess: () => queryClient.setQueryData(nudgeQuery.queryKey, null),
    }),
  )
  const card = nudge.data
  const screen = card ? NUDGE_SCREENS[card.key] : undefined
  if (!card || !screen) return null
  const palette = GREEN_TILL_THEME[colorScheme]
  return (
    <View
      className="mt-3.5 flex-row items-start gap-3 rounded-[18px] bg-card py-3.5 pl-3.5 shadow-sm"
      testID="lifecycle-nudge-card"
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: palette[screen.tint],
          borderRadius: 12,
          height: 40,
          justifyContent: "center",
          width: 40,
        }}
      >
        <Icon
          className="size-[20px]"
          color={palette[`${screen.tint}Foreground`]}
          name={screen.icon}
        />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-sm font-bold [-rn-line-height:22] text-foreground">
          {card.title}
        </Text>
        <Text className="text-xs [-rn-line-height:20] text-muted-foreground">
          {card.body}
        </Text>
        <Pressable
          accessibilityRole="button"
          className="min-h-11 justify-center self-start"
          haptic
          hitSlop={6}
          onPress={() => router.push(screen.href as Href)}
        >
          <Text className="text-xs font-extrabold text-primary">
            {card.ctaLabel}
          </Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityLabel="Dismiss"
        accessibilityRole="button"
        className="size-11 items-center justify-center rounded-full"
        disabled={dismiss.isPending}
        hitSlop={4}
        onPress={() => dismiss.mutate({ id: card.id })}
      >
        <Icon className="size-[16px] text-muted-foreground" name="X" />
      </Pressable>
    </View>
  )
}
