import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { Textarea } from "@/components/ui/textarea"
import { View } from "@/components/ui/view"
import { cn } from "@/lib/utils"
import {
  type CustomerMessageEventKey,
  getCustomerMessageEvent,
} from "@ewatrade/customer-messages/client"
import { useRef } from "react"
import type { TextInput } from "react-native"
import {
  MESSAGE_MAX_CHARACTERS,
  insertVariable,
  messageLength,
  messageVariableLabel,
  tryRenderMessage,
} from "./message-model"

/** The customer's view of the text: plain, newlines kept. */
export function MessageBubble({ text }: { text: string }) {
  return (
    <View className="self-stretch rounded-[18px] rounded-tr-[6px] bg-tint-mint px-3.5 py-3">
      <Text
        className="text-[15px] leading-[22px] text-tint-mint-foreground"
        selectable
      >
        {text}
      </Text>
    </View>
  )
}

/** Wording with tap-to-insert details and a live example. */
export function MessageComposer({
  eventKey,
  value,
  onChange,
  variables,
  exampleLabel,
  label,
  editable = true,
}: {
  eventKey: CustomerMessageEventKey
  value: string
  onChange: (value: string) => void
  variables: Record<string, string | undefined>
  exampleLabel: string
  label: string
  editable?: boolean
}) {
  const input = useRef<TextInput>(null)
  const selection = useRef<{ start: number; end: number } | null>(null)
  const event = getCustomerMessageEvent(eventKey)
  const length = messageLength(value)
  const over = length > MESSAGE_MAX_CHARACTERS
  const rendered = value.trim()
    ? tryRenderMessage(eventKey, value, variables)
    : null
  const problem = over
    ? `Keep it under ${MESSAGE_MAX_CHARACTERS} characters.`
    : rendered?.problem
  return (
    <View className="gap-3">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-[14px] font-bold text-foreground">{label}</Text>
        <Text
          className={cn(
            "text-[12px] text-muted-foreground",
            over && "text-destructive",
          )}
        >
          {length}/{MESSAGE_MAX_CHARACTERS}
        </Text>
      </View>
      <Textarea
        ref={input}
        accessibilityLabel={label}
        className="min-h-36 rounded-2xl border-0 bg-card px-3.5 py-3 text-[15px]"
        editable={editable}
        numberOfLines={8}
        onChangeText={onChange}
        onSelectionChange={(change) => {
          selection.current = change.nativeEvent.selection
        }}
        value={value}
      />
      {problem ? (
        <Text
          accessibilityRole="alert"
          className="text-[13px] text-destructive"
        >
          {problem}
        </Text>
      ) : null}
      <Text className="text-[12px] text-muted-foreground">
        Tap to add details. They fill in for each customer.
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {event.variables.map((name) => (
          <Pressable
            key={name}
            accessibilityLabel={`Insert ${messageVariableLabel(name)}`}
            accessibilityRole="button"
            className="min-h-9 justify-center rounded-full bg-card px-3 shadow-sm active:opacity-80"
            disabled={!editable}
            haptic="selection"
            onPress={() => {
              const next = insertVariable(value, name, selection.current)
              onChange(next.value)
              selection.current = { start: next.caret, end: next.caret }
              input.current?.focus()
            }}
          >
            <Text className="text-[13px] font-semibold text-foreground">
              + {messageVariableLabel(name)}
            </Text>
          </Pressable>
        ))}
      </View>
      {rendered?.text ? (
        <View className="gap-2">
          <Text className="text-[12px] text-muted-foreground">
            {exampleLabel}
          </Text>
          <MessageBubble text={rendered.text} />
        </View>
      ) : null}
    </View>
  )
}
