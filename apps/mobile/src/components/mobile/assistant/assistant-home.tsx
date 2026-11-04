import { Icon, type IconKeys } from "@/components/ui/icon"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import type { GreenTillTint } from "@/lib/green-till-theme"
import { cn } from "@/lib/utils"
import { ActionButton } from "../action-button"
import { homeGreeting } from "../appearances/classic/home-counter-parts"
import { ListCard, RecordRow, SectionHeader } from "../green-till/kit"
import { StatusBanner } from "../status-banner"

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
        title: "Add an item",
        sub: "Price, unit and stock",
        prompt: "Add an item to my goods: ",
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

/** Questions send at once (arrow); record requests fill the box (pencil). */
function PromptGlyph({ send }: { send: boolean }) {
  return (
    <View
      className={cn(
        "size-[30px] items-center justify-center rounded-full",
        send && "bg-muted",
      )}
    >
      <Icon
        className={cn(
          "size-4",
          send ? "text-foreground" : "text-muted-foreground",
        )}
        name={send ? "ArrowUp" : "Pencil"}
      />
    </View>
  )
}

/** Assistant home (Workshop A2a v2.2, Prompt rows): greeting, role prompts, Recent. */
export function AssistantHome({
  name,
  role,
  chats,
  disabled,
  state,
  onSuggestion,
  onChat,
  onAllChats,
  onSearch,
}: {
  name?: string
  role?: string
  chats: AssistantChat[]
  disabled: boolean
  /** Offline dims the prompts; setup replaces them until the assistant is on. */
  state?: "offline" | "setup"
  onSuggestion: (suggestion: AssistantSuggestion) => void
  onChat: (id: string) => void
  onAllChats: () => void
  onSearch?: () => void
}) {
  const firstName = name?.trim().split(/\s+/)[0]
  return (
    <View className="pt-0.5">
      <Text
        accessibilityRole="header"
        className="mb-3.5 text-2xl font-extrabold tracking-tight text-foreground"
      >
        {homeGreeting(new Date().getHours())}
        {firstName ? `, ${firstName}` : ""}
      </Text>
      {state === "setup" ? (
        <View className="mt-10 items-center gap-1.5 px-3">
          <View className="mb-2 size-[52px] items-center justify-center rounded-full bg-muted">
            <Icon className="size-6 text-muted-foreground" name="Clock" />
          </View>
          <Text className="text-center text-lg font-extrabold text-foreground">
            Not ready yet
          </Text>
          <Text className="mb-3 text-center text-base [-rn-line-height:22] text-muted-foreground">
            The assistant is being set up for this business.
          </Text>
          {onSearch ? (
            <ActionButton variant="outline" onPress={onSearch}>
              Open search
            </ActionButton>
          ) : null}
        </View>
      ) : (
        <>
          {state === "offline" ? (
            <View className="mb-3.5">
              <StatusBanner
                title="You’re offline"
                tone="warning"
                message="Reconnect to ask or open a chat."
              />
            </View>
          ) : null}
          <View className={cn(disabled && "opacity-45")}>
            <ListCard>
              {assistantSuggestions(role).map((prompt) => (
                <RecordRow
                  key={prompt.title}
                  title={prompt.title}
                  meta={prompt.sub}
                  avatar={{ icon: prompt.icon, tint: prompt.tint }}
                  status={<PromptGlyph send={prompt.send} />}
                  onPress={disabled ? undefined : () => onSuggestion(prompt)}
                />
              ))}
            </ListCard>
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
        </>
      )}
    </View>
  )
}
