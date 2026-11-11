import { ActionButton } from "@/components/mobile/action-button"
import { MobileWorkflowChrome } from "@/components/mobile/appearances/workflow-chrome"
import { FormField } from "@/components/mobile/form-field"
import {
  SearchFooterField,
  SearchFooterSpacer,
} from "@/components/mobile/search-footer-scope"
import { StatusBanner } from "@/components/mobile/status-banner"
import { Icon } from "@/components/ui/icon"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useColors } from "@/hooks/use-color"
import { uploadMobileCatalogPhoto } from "@/lib/catalog-photo-upload"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import * as Crypto from "expo-crypto"
import { Image } from "expo-image"
import { useEffect, useRef, useState } from "react"
import {
  Modal as RNModal,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native"
import { KeyboardAvoidingView } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import {
  type CatalogImageDraft,
  useCatalogImageDraft,
} from "../catalog-setup/use-catalog-image-draft"
import { DockedPhotoCamera } from "../docked-photo-camera"
import { SavedPhotoPreview } from "./saved-photo-preview"

export type CatalogGalleryEntry =
  RouterOutputs["catalog"]["photos"]["gallery"]["entries"][number]

/** The image's own title, else the first Item showing it. */
export function catalogGalleryLabel(
  entry: CatalogGalleryEntry,
  fallback = "Untitled image",
) {
  return entry.title ?? entry.items[0]?.name ?? fallback
}

function nameWords(name: string) {
  return new Set(
    name
      .toLocaleLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length >= 3)
      // "eggs" and "egg" are the same item word.
      .map((word) =>
        word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word,
      ),
  )
}

const usedOn = (entry: CatalogGalleryEntry) =>
  entry.state === "PENDING_REVIEW"
    ? "Checking image"
    : entry.state === "REJECTED"
      ? "Didn’t pass the image check"
      : !entry.items.length
        ? "Not on an item yet"
        : entry.items.length === 1
          ? "On 1 item"
          : `On ${entry.items.length} items`

/**
 * My images (Workshop dashboard/web-app/catalog/my-images v2-01). With an
 * item it picks photos, in order, for that item; without one (from Catalog)
 * it manages the library. The i button (or a tap in the library) opens the
 * image's title and category; Upload adds a photo straight to My images.
 */
export function CatalogPhotoGalleryPicker({
  open,
  storeId,
  item,
  stores,
  available = 0,
  pickedAssetIds = [],
  onClose,
  initialScope = "store",
  onAdd,
}: {
  open: boolean
  storeId: string
  /** The item photos are picked for; omit to manage My images. */
  item?: { id: string; name: string }
  stores: Array<{ id: string; name: string }>
  available?: number
  pickedAssetIds?: string[]
  onClose(): void
  initialScope?: "store" | "all"
  onAdd?(entries: CatalogGalleryEntry[]): void
}) {
  return (
    <RNModal
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
          initialScope={initialScope}
          onAdd={(entries) => {
            onAdd?.(entries)
            onClose()
          }}
        />
      ) : null}
    </RNModal>
  )
}

function GalleryPicker({
  storeId,
  item,
  stores,
  available,
  pickedAssetIds,
  onClose,
  initialScope,
  onAdd,
}: {
  storeId: string
  item?: { id: string; name: string }
  stores: Array<{ id: string; name: string }>
  available: number
  pickedAssetIds: string[]
  onClose(): void
  initialScope: "store" | "all"
  onAdd(entries: CatalogGalleryEntry[]): void
}) {
  const trpc = useTRPC()
  const colors = useColors()
  const { width } = useWindowDimensions()
  const [scope, setScope] = useState(initialScope)
  const [search, setSearch] = useState("")
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string | null>(null)
  const [selected, setSelected] = useState<CatalogGalleryEntry[]>([])
  const [sourceOpen, setSourceOpen] = useState(false)
  const [details, setDetails] = useState<CatalogGalleryEntry | null>(null)
  // A ref, so clearing the draft right after an upload isn't refused.
  const uploading = useRef(false)
  const draft = useCatalogImageDraft({
    scopeKey: storeId,
    canEdit: () => !uploading.current,
  })
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])
  const gallery = useInfiniteQuery(
    trpc.catalog.photos.gallery.infiniteQueryOptions(
      {
        storeId,
        catalogItemId: item?.id || undefined,
        scope,
        query: query || undefined,
        category: category ?? undefined,
      },
      {
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        placeholderData: keepPreviousData,
        retry: false,
      },
    ),
  )
  const entries = gallery.data?.pages.flatMap((page) => page.entries) ?? []
  const categories = gallery.data?.pages[0]?.categories ?? []
  const filtered = Boolean(query || category)
  const words = nameWords(item?.name ?? "")
  const matches =
    item && !filtered
      ? entries.filter((entry) =>
          [entry.title ?? "", ...entry.items.map((used) => used.name)].some(
            (name) => [...nameWords(name)].some((word) => words.has(word)),
          ),
        )
      : []
  const rest = entries.filter((entry) => !matches.includes(entry))
  // Measured grid width; the window width misses the chrome's own insets.
  const [gridWidth, setGridWidth] = useState(0)
  const tileSize = Math.floor(
    ((gridWidth || Math.min(width, 640) - 32) - 2 * 8) / 3 - 0.5,
  )
  const count = selected.length

  function toggle(entry: CatalogGalleryEntry) {
    if (!item || entry.state !== "APPROVED") {
      setDetails(entry)
      return
    }
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
    const unavailable = !item
      ? null
      : entry.onTargetItem
        ? "Already on this item"
        : pickedAssetIds.includes(entry.assetId)
          ? "Already added"
          : null
    const full = Boolean(item) && !on && count >= available
    const name = catalogGalleryLabel(entry, item?.name)
    const dim = Boolean(unavailable) || full || entry.state !== "APPROVED"
    return (
      <View key={entry.assetId} style={{ width: tileSize }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${name}, ${unavailable ?? usedOn(entry)}`}
          accessibilityState={{
            selected: item ? on : undefined,
            disabled: Boolean(unavailable),
          }}
          disabled={Boolean(unavailable)}
          onPress={() => toggle(entry)}
          style={{ gap: 5 }}
        >
          <View
            style={{
              borderColor: on ? colors.primary : colors.border,
              borderRadius: 14,
              borderWidth: 3,
              height: tileSize,
              opacity: dim ? 0.45 : 1,
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
            {entry.state === "PENDING_REVIEW" ? (
              <View className="absolute left-1.5 top-1.5 rounded-md bg-card px-1.5 py-0.5">
                <Text className="text-[11px] font-bold text-foreground">
                  Checking
                </Text>
              </View>
            ) : null}
          </View>
          <View>
            <Text
              numberOfLines={1}
              className="text-xs font-bold text-foreground"
            >
              {name}
            </Text>
            {entry.category ? (
              <Text
                numberOfLines={1}
                className="text-xs font-bold text-primary"
              >
                {entry.category}
              </Text>
            ) : null}
            <Text numberOfLines={1} className="text-xs text-muted-foreground">
              {unavailable ?? usedOn(entry)}
            </Text>
          </View>
        </Pressable>
        {item ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Details for ${name}`}
            hitSlop={8}
            onPress={() => setDetails(entry)}
            style={{
              alignItems: "center",
              backgroundColor: colors.card,
              borderRadius: 14,
              height: 28,
              justifyContent: "center",
              left: tileSize - 34,
              position: "absolute",
              top: tileSize - 34,
              width: 28,
            }}
          >
            <Icon name="Info" size={16} className="text-foreground" />
          </Pressable>
        ) : null}
      </View>
    )
  }

  const uploadTile = (
    <Pressable
      key="upload"
      accessibilityRole="button"
      accessibilityLabel="Upload to My images"
      onPress={() => setSourceOpen(true)}
      style={{
        alignItems: "center",
        backgroundColor: colors.muted,
        borderColor: colors.primary,
        borderRadius: 14,
        borderStyle: "dashed",
        borderWidth: 1.5,
        gap: 4,
        height: tileSize,
        justifyContent: "center",
        width: tileSize,
      }}
    >
      <Icon name="Plus" size={22} className="text-primary" />
      <Text className="text-xs font-extrabold text-primary">Upload</Text>
    </Pressable>
  )

  const section = (
    title: string | null,
    list: CatalogGalleryEntry[],
    withUpload = false,
  ) =>
    list.length || withUpload ? (
      <View className="gap-2.5">
        {title ? (
          <Text
            accessibilityRole="header"
            className="text-xs font-bold uppercase tracking-[1.1px] text-muted-foreground"
          >
            {title}
          </Text>
        ) : null}
        <View
          className="flex-row flex-wrap gap-2"
          onLayout={(event) =>
            setGridWidth(Math.floor(event.nativeEvent.layout.width))
          }
        >
          {withUpload ? uploadTile : null}
          {list.map(tile)}
        </View>
      </View>
    ) : null

  const currentStore =
    stores.find((store) => store.id === storeId)?.name ?? "This store"
  const chip = (
    key: string,
    label: string,
    on: boolean,
    onPress: () => void,
    role: "radio" | "button" = "radio",
  ) => (
    <Pressable
      key={key}
      accessibilityRole={role}
      accessibilityState={role === "radio" ? { checked: on } : { selected: on }}
      onPress={onPress}
      className={`min-h-11 justify-center rounded-full border px-4 ${
        on ? "border-primary bg-primary/10" : "border-border bg-card"
      }`}
    >
      <Text
        className={`text-sm ${on ? "font-bold text-primary" : "text-muted-foreground"}`}
      >
        {label}
      </Text>
    </Pressable>
  )

  return (
    <MobileWorkflowChrome
      hideHeader={false}
      keyboardBottomOffset={0}
      title="My images"
      closeLabel="Close My images"
      backLabel={item ? "Back to Images" : "Back to Catalog"}
      onBack={onClose}
      onClose={onClose}
      trailing={
        item ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              count ? `Add ${count} photo${count > 1 ? "s" : ""}` : "Add photos"
            }
            accessibilityState={{ disabled: !count }}
            disabled={!count}
            onPress={() => onAdd(selected)}
            className={`h-11 min-w-11 items-center justify-center rounded-full px-4 ${
              count ? "bg-primary" : "bg-muted"
            }`}
          >
            <Text
              className={`text-sm font-extrabold ${
                count ? "text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {count ? `Add ${count}` : "Add"}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Upload to My images"
            onPress={() => setSourceOpen(true)}
            className="h-11 min-w-11 items-center justify-center rounded-full bg-primary px-4"
          >
            <Text className="text-sm font-extrabold text-primary-foreground">
              Upload
            </Text>
          </Pressable>
        )
      }
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          gap: 14,
          paddingBottom: 24,
          paddingHorizontal: 16,
        }}
      >
        <Text className="text-sm text-muted-foreground">
          {!item
            ? "Business photos, ready for any item."
            : count
              ? `${count} selected · up to ${available} for ${item.name}`
              : `Pick up to ${available} for ${item.name}.`}
        </Text>
        <SearchFooterField
          localSearch
          accessibilityLabel="Search My images"
          placeholder="Search titles, categories, items"
          value={search}
          onChangeText={setSearch}
        />
        {stores.length > 1 ? (
          <View accessibilityRole="radiogroup" className="flex-row gap-2">
            {chip("store", currentStore, scope === "store", () =>
              setScope("store"),
            )}
            {chip("all", "All stores", scope === "all", () => setScope("all"))}
          </View>
        ) : null}
        {categories.length || category ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            accessibilityLabel="Category"
            contentContainerStyle={{ gap: 8 }}
          >
            {chip("all", "All", category === null, () => setCategory(null))}
            {[
              ...categories.map((value) => value.name),
              ...(category &&
              !categories.some((value) => value.name === category)
                ? [category]
                : []),
            ].map((name) =>
              chip(name, name, category === name, () => setCategory(name)),
            )}
          </ScrollView>
        ) : null}
        {draft.error ? (
          <StatusBanner tone="warning" message={draft.error} />
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
        ) : !entries.length && filtered ? (
          <View className="items-center gap-2 px-4 py-10">
            <Text className="text-center text-base font-bold text-foreground">
              {query
                ? `No images match “${query}”`
                : "No images in this category"}
            </Text>
            <Text className="text-center text-sm text-muted-foreground">
              {`Search titles, categories and item names${scope === "store" && stores.length > 1 ? ", or try All stores" : ""}.`}
            </Text>
            <ActionButton
              variant="outline"
              onPress={() => {
                setSearch("")
                setCategory(null)
              }}
            >
              Clear filters
            </ActionButton>
          </View>
        ) : (
          <>
            {!entries.length ? (
              <View className="items-center gap-2 px-4 py-6">
                <Text className="text-center text-base font-bold text-foreground">
                  No business images yet
                </Text>
                <Text className="text-center text-sm text-muted-foreground">
                  Upload photos here, or add them to your items. They show up
                  for everyone once their image check passes.
                </Text>
              </View>
            ) : null}
            {section(matches.length ? "Best matches" : null, matches)}
            {section(
              matches.length ? "All images" : null,
              rest,
              Boolean(item) && !filtered,
            )}
            {gallery.hasNextPage ? (
              <ActionButton
                variant="outline"
                isLoading={gallery.isFetchingNextPage}
                loadingLabel="Loading…"
                onPress={() => void gallery.fetchNextPage()}
              >
                Show more
              </ActionButton>
            ) : null}
          </>
        )}
        <SearchFooterSpacer />
      </ScrollView>
      <UploadSourceSheet
        open={sourceOpen}
        onClose={() => setSourceOpen(false)}
        onChoose={(source) => {
          setSourceOpen(false)
          void draft.select(source)
        }}
      />
      <DockedPhotoCamera {...draft.camera} />
      <ImageDetailsSheet
        storeId={storeId}
        entry={details}
        image={draft.image}
        fallbackName={item?.name}
        categories={categories.map((value) => value.name)}
        onUploading={(value) => {
          uploading.current = value
        }}
        onClose={() => {
          setDetails(null)
          draft.remove()
        }}
        onRemoved={(entry) => {
          setSelected((current) =>
            current.filter((value) => value.assetId !== entry.assetId),
          )
          setDetails(null)
        }}
      />
    </MobileWorkflowChrome>
  )
}

function UploadSourceSheet({
  open,
  onClose,
  onChoose,
}: {
  open: boolean
  onClose(): void
  onChoose(source: CatalogImageDraft["source"]): void
}) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const options = [
    ["camera", "Take a photo", "Camera"],
    ["photos", "Choose from phone", "Image"],
  ] as const
  return (
    <RNModal
      animationType="fade"
      transparent
      visible={open}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close Upload to My images"
        onPress={onClose}
        noRipple
        transition={false}
        style={{ backgroundColor: colors.overlay, flex: 1 }}
      />
      <View
        accessibilityViewIsModal
        style={{
          backgroundColor: colors.card,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          bottom: 0,
          gap: 4,
          left: 0,
          paddingBottom: 16 + insets.bottom,
          paddingHorizontal: 12,
          paddingTop: 16,
          position: "absolute",
          right: 0,
        }}
      >
        <Text
          accessibilityRole="header"
          className="px-3 pb-2 text-base font-extrabold text-foreground"
        >
          Upload to My images
        </Text>
        {options.map(([source, label, icon]) => (
          <Pressable
            key={source}
            accessibilityRole="button"
            onPress={() => onChoose(source)}
            className="min-h-14 flex-row items-center gap-3 rounded-2xl px-3"
          >
            <Icon className="size-[20px] text-foreground" name={icon} />
            <Text className="flex-1 text-base font-semibold text-foreground">
              {label}
            </Text>
          </Pressable>
        ))}
        <ActionButton variant="outline" onPress={onClose}>
          Cancel
        </ActionButton>
      </View>
    </RNModal>
  )
}

/** Title and category of one image, or of a new upload before it is sent. */
function ImageDetailsSheet({
  storeId,
  entry,
  image,
  fallbackName,
  categories,
  onUploading,
  onClose,
  onRemoved,
}: {
  storeId: string
  entry: CatalogGalleryEntry | null
  image: CatalogImageDraft | null
  fallbackName?: string
  categories: string[]
  onUploading(uploading: boolean): void
  onClose(): void
  onRemoved(entry: CatalogGalleryEntry): void
}) {
  const insets = useSafeAreaInsets()
  const colors = useColors()
  const { height } = useWindowDimensions()
  const open = Boolean(entry || image)
  return (
    <RNModal
      animationType="slide"
      transparent
      visible={open}
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close image details"
        onPress={onClose}
        noRipple
        transition={false}
        style={{ backgroundColor: colors.overlay, flex: 1 }}
      />
      {/* The translucent modal window never resizes for the keyboard on
          Android, so the sheet pads itself above it on both platforms. */}
      <KeyboardAvoidingView
        behavior="padding"
        pointerEvents="box-none"
        style={{
          bottom: 0,
          justifyContent: "flex-end",
          left: 0,
          position: "absolute",
          right: 0,
          top: insets.top + 8,
        }}
      >
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: colors.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            // A percentage resolves against this auto-height wrapper and
            // clipped the sheet's last row (Add to My images, Remove).
            flexShrink: 1,
            maxHeight: height * 0.92,
            paddingBottom: 16 + insets.bottom,
            paddingTop: 16,
          }}
        >
          {image ? (
            <NewImageForm
              key={image.id}
              storeId={storeId}
              image={image}
              categories={categories}
              onUploading={onUploading}
              onDone={onClose}
              onCancel={onClose}
            />
          ) : entry ? (
            <DetailsForm
              key={entry.assetId}
              entry={entry}
              fallbackName={fallbackName}
              categories={categories}
              onDone={onClose}
              onRemoved={() => onRemoved(entry)}
            />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </RNModal>
  )
}

function CategorySuggestions({
  categories,
  value,
  onPick,
}: {
  categories: string[]
  value: string
  onPick(value: string): void
}) {
  if (!categories.length) return null
  return (
    <View className="flex-row flex-wrap gap-2">
      {categories.map((name) => {
        const on = value.trim().toLocaleLowerCase() === name.toLocaleLowerCase()
        return (
          <Pressable
            key={name}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`Category ${name}`}
            onPress={() => onPick(on ? "" : name)}
            className={`min-h-9 justify-center rounded-full border px-3 ${
              on ? "border-primary bg-primary/10" : "border-border bg-card"
            }`}
          >
            <Text
              className={`text-xs ${on ? "font-bold text-primary" : "text-muted-foreground"}`}
            >
              {name}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

function SheetHeader({
  title,
  onCancel,
}: {
  title: string
  onCancel(): void
}) {
  return (
    <View className="flex-row items-center justify-between px-5 pb-2">
      <Text
        accessibilityRole="header"
        className="text-lg font-extrabold text-foreground"
      >
        {title}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onCancel}
        className="min-h-11 justify-center px-2"
      >
        <Text className="text-sm font-bold text-primary">Cancel</Text>
      </Pressable>
    </View>
  )
}

function DetailsForm({
  entry,
  fallbackName,
  categories,
  onDone,
  onRemoved,
}: {
  entry: CatalogGalleryEntry
  fallbackName?: string
  categories: string[]
  onDone(): void
  onRemoved(): void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState(entry.title ?? "")
  const [category, setCategory] = useState(entry.category ?? "")
  const [confirmRemove, setConfirmRemove] = useState(false)
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.catalog.photos.gallery.pathKey(),
    })
  const update = useMutation(
    trpc.catalog.photos.updateGalleryDetails.mutationOptions({
      onSuccess: () => {
        void refresh()
        onDone()
      },
    }),
  )
  const remove = useMutation(
    trpc.catalog.photos.remove.mutationOptions({
      onSuccess: () => {
        void refresh()
        onRemoved()
      },
    }),
  )
  const dirty =
    title.trim() !== (entry.title ?? "") ||
    category.trim() !== (entry.category ?? "")
  const name = catalogGalleryLabel(entry, fallbackName)
  return (
    <>
      <SheetHeader title="Image details" onCancel={onDone} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 14, paddingHorizontal: 20 }}
      >
        <View className="flex-row items-center gap-3">
          <View className="size-24 overflow-hidden rounded-2xl bg-muted">
            <SavedPhotoPreview
              assetId={entry.assetId}
              storeId={entry.storeId}
              name={name}
              variant="thumbnail"
            />
          </View>
          <View className="flex-1 gap-0.5">
            <Text
              numberOfLines={2}
              className="text-base font-bold text-foreground"
            >
              {name}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {entry.items.length
                ? entry.items.map((used) => used.name).join(", ")
                : usedOn(entry)}
            </Text>
          </View>
        </View>
        {entry.state === "PENDING_REVIEW" ? (
          <StatusBanner
            tone="default"
            message="Checking this image. Other managers see it once it passes."
          />
        ) : entry.state === "REJECTED" ? (
          <StatusBanner
            tone="warning"
            message="This image didn’t pass the image check, so it can’t be used."
          />
        ) : null}
        <FormField
          label="Title"
          maxLength={80}
          placeholder={entry.items[0]?.name ?? "e.g. Half crate, top view"}
          helper={
            !entry.title && entry.items[0]
              ? `Shows as “${entry.items[0].name}” until you add one`
              : undefined
          }
          value={title}
          onChangeText={setTitle}
        />
        <FormField
          label="Category"
          maxLength={40}
          placeholder="e.g. Eggs"
          value={category}
          onChangeText={setCategory}
        />
        <CategorySuggestions
          categories={categories}
          value={category}
          onPick={setCategory}
        />
        {update.error ? (
          <StatusBanner tone="warning" message={update.error.message} />
        ) : null}
        <ActionButton
          disabled={!dirty}
          isLoading={update.isPending}
          loadingLabel="Saving…"
          onPress={() =>
            update.mutate({
              storeId: entry.storeId,
              assetId: entry.assetId,
              title: title.trim(),
              category: category.trim(),
            })
          }
        >
          Save details
        </ActionButton>
        {entry.galleryAsset ? (
          confirmRemove ? (
            <View className="gap-2">
              <Text className="text-sm text-muted-foreground">
                {entry.items.length
                  ? "Items using this image keep their own copy."
                  : "It isn’t on any item."}
              </Text>
              <ActionButton
                variant="destructive"
                isLoading={remove.isPending}
                onPress={() => {
                  const target = entry.galleryAsset
                  if (target)
                    remove.mutate({
                      storeId: target.storeId,
                      assetId: target.assetId,
                    })
                }}
              >
                Remove from My images
              </ActionButton>
              <ActionButton
                variant="outline"
                onPress={() => setConfirmRemove(false)}
              >
                Keep it
              </ActionButton>
            </View>
          ) : (
            <ActionButton
              variant="outline"
              onPress={() => setConfirmRemove(true)}
            >
              Remove from My images
            </ActionButton>
          )
        ) : null}
        {remove.error ? (
          <StatusBanner tone="warning" message={remove.error.message} />
        ) : null}
      </ScrollView>
    </>
  )
}

function NewImageForm({
  storeId,
  image,
  categories,
  onUploading,
  onDone,
  onCancel,
}: {
  storeId: string
  image: CatalogImageDraft
  categories: string[]
  onUploading(uploading: boolean): void
  onDone(): void
  onCancel(): void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const createIntent = useMutation(
    trpc.catalog.photos.createIntent.mutationOptions(),
  )
  const addToGallery = useMutation(
    trpc.catalog.photos.addToGallery.mutationOptions(),
  )
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const operation = useRef(Crypto.randomUUID())
  // A retry after the bytes landed only repeats the gallery step.
  const uploaded = useRef<string | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  async function submit() {
    if (busy) return
    setBusy(true)
    onUploading(true)
    setError(null)
    try {
      uploaded.current ??= await uploadMobileCatalogPhoto({
        image,
        storeId,
        clientOperationId: `my-images:${operation.current}`,
        assertCurrent: () => {
          if (!mounted.current) throw new Error("Upload cancelled.")
        },
        createIntent: (input) => createIntent.mutateAsync(input),
      })
      await addToGallery.mutateAsync({
        storeId,
        assetId: uploaded.current,
        title: title.trim(),
        category: category.trim(),
      })
      await queryClient.invalidateQueries({
        queryKey: trpc.catalog.photos.gallery.pathKey(),
      })
      onUploading(false)
      onDone()
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error ? cause.message : "Upload failed. Try again.",
        )
    } finally {
      onUploading(false)
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <>
      <SheetHeader title="New image" onCancel={onCancel} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ gap: 14, paddingHorizontal: 20 }}
      >
        <View className="flex-row items-center gap-3">
          <View className="size-24 overflow-hidden rounded-2xl bg-muted">
            <Image
              source={{ uri: image.uri }}
              contentFit="cover"
              accessibilityIgnoresInvertColors
              style={{ height: "100%", width: "100%" }}
            />
          </View>
          <View className="flex-1 gap-0.5">
            <Text className="text-base font-bold text-foreground">
              Goes to My images
            </Text>
            <Text className="text-xs text-muted-foreground">
              Not added to any item. Others see it once its image check passes.
            </Text>
          </View>
        </View>
        <FormField
          label="Title"
          maxLength={80}
          placeholder="e.g. Half crate, top view"
          value={title}
          onChangeText={setTitle}
        />
        <FormField
          label="Category"
          maxLength={40}
          placeholder="e.g. Eggs"
          value={category}
          onChangeText={setCategory}
        />
        <CategorySuggestions
          categories={categories}
          value={category}
          onPick={setCategory}
        />
        {error ? <StatusBanner tone="warning" message={error} /> : null}
        <ActionButton
          isLoading={busy}
          loadingLabel="Uploading…"
          onPress={() => void submit()}
        >
          Add to My images
        </ActionButton>
      </ScrollView>
    </>
  )
}
