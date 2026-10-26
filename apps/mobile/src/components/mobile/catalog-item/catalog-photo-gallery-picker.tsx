import { ActionButton } from "@/components/mobile/action-button"
import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import { SearchFooterField } from "@/components/mobile/search-footer-scope"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Modal, ScrollView, View, useWindowDimensions } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { SavedPhotoPreview } from "./saved-photo-preview"

export type CatalogGalleryEntry =
  RouterOutputs["catalog"]["photos"]["gallery"]["entries"][number]

function nameWords(name: string) {
  return new Set(
    name
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 3),
  )
}

const usedOn = (entry: CatalogGalleryEntry) =>
  entry.items.length === 1 ? "On 1 item" : `On ${entry.items.length} items`

/**
 * My images (Workshop dashboard/web-app/catalog/my-images 02): approved photos
 * already on the business's items, picked in order and added to this item.
 */
export function CatalogPhotoGalleryPicker({
  open,
  storeId,
  item,
  stores,
  available,
  pickedAssetIds,
  onClose,
  onAdd,
}: {
  open: boolean
  storeId: string
  item: { id: string; name: string }
  stores: Array<{ id: string; name: string }>
  available: number
  pickedAssetIds: string[]
  onClose(): void
  onAdd(entries: CatalogGalleryEntry[]): void
}) {
  return (
    <Modal
      animationType="slide"
      presentationStyle="fullScreen"
      visible={open}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      {open ? (
        <GalleryPicker
          storeId={storeId}
          item={item}
          stores={stores}
          available={available}
          pickedAssetIds={pickedAssetIds}
          onClose={onClose}
          onAdd={(entries) => {
            onAdd(entries)
            onClose()
          }}
        />
      ) : null}
    </Modal>
  )
}

function GalleryPicker({
  storeId,
  item,
  stores,
  available,
  pickedAssetIds,
  onClose,
  onAdd,
}: {
  storeId: string
  item: { id: string; name: string }
  stores: Array<{ id: string; name: string }>
  available: number
  pickedAssetIds: string[]
  onClose(): void
  onAdd(entries: CatalogGalleryEntry[]): void
}) {
  const trpc = useTRPC()
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const { width } = useWindowDimensions()
  const [scope, setScope] = useState<"store" | "all">("store")
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<CatalogGalleryEntry[]>([])
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])
  const gallery = useQuery(
    trpc.catalog.photos.gallery.queryOptions(
      {
        storeId,
        catalogItemId: item.id,
        scope,
        query: query || undefined,
      },
      { placeholderData: keepPreviousData, retry: false },
    ),
  )
  const entries = gallery.data?.entries ?? []
  const words = nameWords(item.name)
  const matches = query
    ? []
    : entries.filter((entry) =>
        entry.items.some((used) =>
          [...nameWords(used.name)].some((word) => words.has(word)),
        ),
      )
  const rest = query
    ? entries
    : entries.filter((entry) => !matches.includes(entry))
  const tileSize = Math.floor((Math.min(width, 640) - 32 - 16) / 3)
  const count = selected.length

  function toggle(entry: CatalogGalleryEntry) {
    setSelected((current) =>
      current.some((value) => value.assetId === entry.assetId)
        ? current.filter((value) => value.assetId !== entry.assetId)
        : current.length < available
          ? [...current, entry]
          : current,
    )
  }

  function tile(entry: CatalogGalleryEntry) {
    const index = selected.findIndex((value) => value.assetId === entry.assetId)
    const on = index >= 0
    const unavailable = entry.onTargetItem
      ? "Already on this item"
      : pickedAssetIds.includes(entry.assetId)
        ? "Already added"
        : null
    const full = !on && count >= available
    const name = entry.items[0]?.name ?? item.name
    return (
      <Pressable
        key={entry.assetId}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${unavailable ?? usedOn(entry)}`}
        accessibilityState={{
          selected: on,
          disabled: Boolean(unavailable) || full,
        }}
        disabled={Boolean(unavailable) || full}
        onPress={() => toggle(entry)}
        style={{ gap: 5, width: tileSize }}
      >
        <View
          style={{
            borderColor: on ? colors.primary : colors.border,
            borderRadius: 14,
            borderWidth: 3,
            height: tileSize,
            opacity: unavailable || full ? 0.45 : 1,
            overflow: "hidden",
          }}
        >
          <View className="flex-1 bg-muted">
            <SavedPhotoPreview
              assetId={entry.assetId}
              storeId={entry.storeId}
              name={name}
              variant="thumbnail"
            />
          </View>
          {on ? (
            <View className="absolute right-1.5 top-1.5 size-6 items-center justify-center rounded-full bg-primary">
              <Text className="text-xs font-extrabold text-primary-foreground">
                {index + 1}
              </Text>
            </View>
          ) : null}
        </View>
        <View>
          <Text numberOfLines={1} className="text-xs font-bold text-foreground">
            {name}
          </Text>
          <Text numberOfLines={1} className="text-xs text-muted-foreground">
            {unavailable ?? usedOn(entry)}
          </Text>
        </View>
      </Pressable>
    )
  }

  const section = (title: string | null, list: CatalogGalleryEntry[]) =>
    list.length ? (
      <View className="gap-2.5">
        {title ? (
          <Text
            accessibilityRole="header"
            className="text-xs font-bold uppercase tracking-[1.1px] text-muted-foreground"
          >
            {title}
          </Text>
        ) : null}
        <View className="flex-row flex-wrap gap-2">{list.map(tile)}</View>
      </View>
    ) : null

  const currentStore =
    stores.find((store) => store.id === storeId)?.name ?? "This store"

  return (
    <MobileWorkflowChrome
      hideHeader={false}
      keyboardBottomOffset={0}
      title="My images"
      closeLabel="Close My images"
      backLabel="Back to Images"
      onBack={onClose}
      onClose={onClose}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: 14,
          paddingBottom: 120 + insets.bottom,
          paddingHorizontal: 16,
        }}
      >
        <Text className="text-sm text-muted-foreground">
          Photos already on your items. Pick up to {available} for {item.name}.
        </Text>
        <SearchFooterField
          localSearch
          accessibilityLabel="Search My images"
          placeholder="Search item names"
          value={search}
          onChangeText={setSearch}
        />
        {stores.length > 1 ? (
          <View accessibilityRole="radiogroup" className="flex-row gap-2">
            {(
              [
                ["store", currentStore],
                ["all", "All stores"],
              ] as const
            ).map(([value, label]) => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked: scope === value }}
                onPress={() => setScope(value)}
                className={`min-h-11 justify-center rounded-full border px-4 ${
                  scope === value
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card"
                }`}
              >
                <Text
                  className={`text-sm ${
                    scope === value
                      ? "font-bold text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {gallery.isPending ? (
          <StatusBanner tone="default" message="Loading My images…" />
        ) : gallery.isError ? (
          <View className="gap-3">
            <StatusBanner tone="warning" message={gallery.error.message} />
            <ActionButton
              variant="outline"
              onPress={() => void gallery.refetch()}
            >
              Try again
            </ActionButton>
          </View>
        ) : !entries.length ? (
          <View className="items-center gap-2 px-4 py-10">
            <Text className="text-center text-base font-bold text-foreground">
              {query ? `No images match “${query}”` : "No business images yet"}
            </Text>
            <Text className="text-center text-sm text-muted-foreground">
              {query
                ? `Try another item name${scope === "store" && stores.length > 1 ? " or All stores" : ""}.`
                : "Photos on your items show up here once their image check passes, so you can use them again."}
            </Text>
            {query ? (
              <ActionButton variant="outline" onPress={() => setSearch("")}>
                Clear search
              </ActionButton>
            ) : null}
          </View>
        ) : (
          <>
            {section(matches.length ? "Best matches" : null, matches)}
            {section(matches.length ? "All images" : null, rest)}
            {gallery.data?.truncated ? (
              <Text className="text-xs text-muted-foreground">
                Showing your most recent images. Search to find older ones.
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
      <View
        style={{
          alignItems: "center",
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          bottom: 0,
          flexDirection: "row",
          gap: 12,
          left: 0,
          paddingBottom: 12 + insets.bottom,
          paddingHorizontal: 16,
          paddingTop: 12,
          position: "absolute",
          right: 0,
        }}
      >
        <Text className="flex-1 text-sm text-muted-foreground">
          {count ? `${count} selected` : "Tap images to add"}
        </Text>
        <ActionButton disabled={!count} onPress={() => onAdd(selected)}>
          {count ? `Add ${count} photo${count > 1 ? "s" : ""}` : "Add"}
        </ActionButton>
      </View>
    </MobileWorkflowChrome>
  )
}
