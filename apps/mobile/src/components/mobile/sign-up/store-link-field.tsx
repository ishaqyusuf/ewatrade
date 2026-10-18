import { FormField } from "@/components/mobile/form-field"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useTRPC } from "@/trpc/client"
import {
  isValidStoreLink,
  normalizeStoreLink,
} from "@ewatrade/utils/store-link"
import { useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"

export function StoreLinkField({
  value,
  onChange,
  onAvailability,
  onCanonicalize,
  fixed = false,
  email,
}: {
  value: string
  onChange: (slug: string) => void
  onAvailability: (available: boolean) => void
  onCanonicalize?: (slug: string) => void
  fixed?: boolean
  email?: string
}) {
  const trpc = useTRPC()
  const [editing, setEditing] = useState(false)
  const [debounced, setDebounced] = useState("")
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), 450)
    return () => clearTimeout(timer)
  }, [value])
  const check = useQuery(
    trpc.auth.storeLinkAvailability.queryOptions(
      {
        slug: debounced,
        emailDomain:
          email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
            ? email.trim().toLowerCase().split("@")[1]
            : undefined,
      },
      {
        enabled: !fixed && isValidStoreLink(debounced) && value === debounced,
        staleTime: 0,
        retry: false,
      },
    ),
  )
  const available =
    fixed ||
    (check.isSuccess &&
      check.data.available &&
      check.data.slug === value &&
      value === debounced &&
      !check.isFetching)
  useEffect(() => onAvailability(available), [available, onAvailability])
  useEffect(() => {
    if (check.data && value === debounced && check.data.slug !== value)
      onCanonicalize?.(check.data.slug)
  }, [check.data, value, debounced, onCanonicalize])
  return (
    <View className="gap-2">
      {editing && !fixed ? (
        <FormField
          label="Store link"
          value={value}
          onChangeText={(text) => onChange(normalizeStoreLink(text))}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={40}
          variant="green-gate"
        />
      ) : null}
      <Text
        accessibilityLiveRegion="polite"
        className="text-xs text-muted-foreground"
      >
        {value || "your-business"}.ewatrade.com ·{" "}
        {fixed
          ? "Your store link"
          : available
            ? "Available"
            : value !== debounced || check.isFetching
              ? "Checking…"
              : !isValidStoreLink(value)
                ? "Choose a link with 2–40 letters or numbers"
                : check.isError
                  ? check.error.message
                  : value
                    ? "That link is taken. Try one below, or edit it."
                    : "Your store link appears here as you name your business"}
      </Text>
      {!fixed ? (
        <Pressable
          accessibilityRole="button"
          className="min-h-11 justify-center"
          onPress={() => {
            setEditing((current) => !current)
            if (check.isError) void check.refetch()
          }}
        >
          <Text className="text-xs font-bold text-primary">
            {editing ? "Done editing" : "Edit link"}
            {check.isError ? " / retry" : ""}
          </Text>
        </Pressable>
      ) : null}
      {!fixed && check.data && !check.data.available ? (
        <View className="flex-row flex-wrap gap-2">
          {check.data.suggestions.map((slug) => (
            <Pressable
              key={slug}
              accessibilityRole="button"
              accessibilityLabel={`Use ${slug}.ewatrade.com`}
              className="min-h-11 justify-center rounded-full border border-border bg-card px-3.5"
              onPress={() => {
                onChange(slug)
                setEditing(true)
              }}
            >
              <Text className="text-xs text-primary">{slug}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}
