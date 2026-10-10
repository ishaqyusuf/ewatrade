import { Icon, type IconKeys } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import { GREEN_TILL_THEME, type GreenTillTint } from "@/lib/green-till-theme"
import { cn } from "@/lib/utils"
import { homeGreeting } from "../appearances/classic/home-counter-parts"
import { ListCard, RecordRow, SectionHeader } from "../green-till/kit"

export type AssistantSuggestion = {
  icon: IconKeys
  tint: GreenTillTint | "gold"
  title: string
  sub: string
  prompt: string
  /** Questions send at once; record requests open the composer to finish. */
  send: boolean
}

/** Starters per role (design 25, Assistant home). */
export function assistantSuggestions(role?: string): AssistantSuggestion[] {
  const r = role?.trim().toUpperCase()
  if (r === "OWNER" || r === "ADMIN")
    return [
      {
        icon: "Receipt",
        tint: "gold",
        title: "New order",
        sub: "Who, what and how they paid",
        prompt: "New order: ",
        send: false,
      },
      {
        icon: "Wallet",
        tint: "amber",
        title: "Who owes me money?",
        sub: "Customers with a balance",
        prompt: "Who owes me money?",
        send: true,
      },
      {
        icon: "BarChart3",
        tint: "mint",
        title: "What sold most this week?",
        sub: "By item",
        prompt: "What sold most this week?",
        send: true,
      },
      {
        icon: "Package",
        tint: "sky",
        title: "Add a product",
        sub: "Price, unit and stock",
        prompt: "Add a product: ",
        send: false,
      },
    ]
  if (r === "MANAGER")
    return [
      {
        icon: "Receipt",
        tint: "gold",
        title: "New order",
        sub: "Who, what and how they paid",
        prompt: "New order: ",
        send: false,
      },
      {
        icon: "ReceiptText",
        tint: "amber",
        title: "Which orders are unpaid?",
        sub: "This store",
        prompt: "Which orders are unpaid?",
        send: true,
      },
      {
        icon: "BarChart3",
        tint: "mint",
        title: "What sold most this week?",
        sub: "By item",
        prompt: "What sold most this week?",
        send: true,
      },
      {
        icon: "TriangleAlert",
        tint: "rose",
        title: "Is anything running low?",
        sub: "Stock in this store",
        prompt: "Is anything running low?",
        send: true,
      },
    ]
  return [
    {
      icon: "Receipt",
      tint: "gold",
      title: "New sale",
      sub: "Who, what and how they paid",
      prompt: "New sale: ",
      send: false,
    },
    {
      icon: "BarChart3",
      tint: "mint",
      title: "What did I sell this week?",
      sub: "Only your sales",
      prompt: "What did I sell this week?",
      send: true,
    },
    {
      icon: "Package",
      tint: "sky",
      title: "What’s in stock?",
      sub: "Stock in this store",
      prompt: "What’s in stock?",
      send: true,
    },
    {
      icon: "Users",
      tint: "lilac",
      title: "Find a customer",
      sub: "Phone and balance",
      prompt: "Find customer: ",
      send: false,
    },
  ]
}

function chatDay(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  const days = Math.round(
    (new Date(today.toDateString()).getTime() -
      new Date(date.toDateString()).getTime()) /
      86_400_000,
  )
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

export type AssistantChat = {
  id: string
  title?: string | null
  updatedAt: string | Date
}

export function AssistantChatRow({
  chat,
  onPress,
  disabled,
}: { chat: AssistantChat; onPress: () => void; disabled?: boolean }) {
  return (
    <RecordRow
      title={chat.title || "New chat"}
      meta={chatDay(String(chat.updatedAt))}
      avatar={{ icon: "MessageCircle", tint: "mint" }}
      onPress={disabled ? undefined : onPress}
    />
  )
}

export function AssistantHome({
  name,
  role,
  chats,
  disabled,
  onSuggestion,
  onChat,
  onAllChats,
}: {
  name?: string
  role?: string
  chats: AssistantChat[]
  disabled: boolean
  onSuggestion: (suggestion: AssistantSuggestion) => void
  onChat: (id: string) => void
  onAllChats: () => void
}) {
  const large = useLargeTextLayout()
  const { colorScheme } = useColorScheme()
  const palette = GREEN_TILL_THEME[colorScheme]
  const firstName = name?.trim().split(/\s+/)[0]
  const rep = !["OWNER", "ADMIN", "MANAGER"].includes(
    role?.trim().toUpperCase() ?? "",
  )
  const tiles = assistantSuggestions(role)
  const rows = large
    ? tiles.map((t) => [t])
    : [tiles.slice(0, 2), tiles.slice(2)]
  return (
    <View className="pt-1.5">
      <View
        style={{
          alignItems: "center",
          backgroundColor: palette.gold,
          borderRadius: 15,
          height: 44,
          justifyContent: "center",
          width: 44,
        }}
      >
        <Icon
          className="size-[22px]"
          color={palette.goldForeground}
          name="Sparkles"
        />
      </View>
      <Text
        accessibilityRole="header"
        className="mb-1 mt-3 text-2xl font-extrabold tracking-tight text-foreground"
      >
        {homeGreeting(new Date().getHours())}
        {firstName ? `, ${firstName}` : ""}. How can I help today?
      </Text>
      <Text className="text-[13px] text-muted-foreground">
        {rep
          ? "Ask about your sales and what’s in stock, or start a sale."
          : "Ask about sales, stock and customers, or tell me what to record. Nothing changes until you confirm."}
      </Text>
      <View className="mt-3.5 gap-2">
        {rows.map((row) => (
          <View key={row[0]?.title} className="flex-row gap-2">
            {row.map((tile) => {
              const gold = tile.tint === "gold"
              const ink = gold
                ? palette.goldForeground
                : palette[`${tile.tint as GreenTillTint}Foreground`]
              return (
                <View
                  key={tile.title}
                  className={cn(
                    "flex-1 rounded-[18px]",
                    gold ? "bg-gold" : "bg-card shadow-sm",
                    disabled && "opacity-45",
                  )}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityHint={tile.sub}
                    accessibilityState={{ disabled }}
                    className={cn(
                      "gap-2.5 rounded-[18px] p-3",
                      large ? "min-h-[84px]" : "min-h-[112px]",
                    )}
                    disabled={disabled}
                    haptic
                    onPress={() => onSuggestion(tile)}
                  >
                    <View
                      style={{
                        alignItems: "center",
                        backgroundColor: gold
                          ? "rgba(30,30,28,0.1)"
                          : palette[tile.tint as GreenTillTint],
                        borderRadius: 11,
                        height: 34,
                        justifyContent: "center",
                        width: 34,
                      }}
                    >
                      <Icon
                        className="size-[17px]"
                        color={ink}
                        name={tile.icon}
                      />
                    </View>
                    <View className="gap-0.5">
                      <Text
                        className={cn(
                          "text-[13.5px] font-bold",
                          gold ? "text-gold-foreground" : "text-foreground",
                        )}
                      >
                        {tile.title}
                      </Text>
                      <Text
                        className={cn(
                          "text-[11.5px]",
                          gold
                            ? "text-gold-foreground/70"
                            : "text-muted-foreground",
                        )}
                      >
                        {tile.sub}
                      </Text>
                    </View>
                  </Pressable>
                </View>
              )
            })}
          </View>
        ))}
      </View>
      {chats.length ? (
        <>
          <SectionHeader
            title="Recent"
            actionLabel="All chats"
            onAction={onAllChats}
          />
          <ListCard>
            {chats.map((chat) => (
              <AssistantChatRow
                key={chat.id}
                chat={chat}
                disabled={disabled}
                onPress={() => onChat(chat.id)}
              />
            ))}
          </ListCard>
        </>
      ) : null}
    </View>
  )
}
