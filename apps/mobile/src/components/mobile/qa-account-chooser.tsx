import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useQaAccelerator } from "@/hooks/use-qa-accelerator"
import {
  filterQaProfiles,
  formatQaCount,
  groupQaProfiles,
  qaProfileDisplayName,
} from "@ewatrade/utils/qa-profiles"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useRouter } from "expo-router"
import { useEffect, useRef } from "react"
import { QaDomainOptions } from "./qa-domain-options"
import { StatusBanner } from "./status-banner"

/** Up to this many businesses fit a compact sheet; more open the full list. */
export const QA_SHEET_MAX_BUSINESSES = 5
export function qaChooserLayout(count: number) {
  return count > QA_SHEET_MAX_BUSINESSES ? "full" : "sheet"
}

type Qa = ReturnType<typeof useQaAccelerator>
type QaProfile = Qa["profiles"][number]
export { filterQaProfiles }

export function QaAccountChooser() {
  const qa = useQaAccelerator()
  const router = useRouter()
  const { token } = useAuthContext()
  const modal = useModal()
  const lastToken = useRef(token)

  useEffect(() => {
    if (lastToken.current === token) return
    lastToken.current = token
    modal.dismiss()
  }, [token, modal.dismiss])

  if (!qa.clientEnabled) {
    return null
  }

  if (!qa.capabilityAvailable || !qa.authorization) {
    return (
      <QaFab
        accessibilityHint="Opens QA domain setup"
        accessibilityLabel="Set up QA"
        onPress={qa.openAuthorizationSheet}
      />
    )
  }

  const groups = groupQaProfiles(qa.profiles)
  const full = qaChooserLayout(qa.profiles.length) === "full"
  return (
    <>
      <QaFab
        accessibilityHint="Shows businesses registered for the active QA Domain"
        accessibilityLabel={`Open ${groups.length} QA businesses`}
        count={groups.length}
        onPress={() =>
          // Many businesses: a full-screen list with bottom search.
          full ? router.push("/qa-businesses-modal") : modal.present()
        }
      />

      {/* A few businesses: a compact sheet sized to its rows, no search. */}
      <Modal
        enableDynamicSizing
        maxDynamicContentSize={660}
        ref={modal.ref}
        title="QA businesses"
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 24 }}>
          <View className="pb-5">
            <QaDomainIntro
              qaDomain={qa.authorization.qaDomain}
              onLeave={modal.dismiss}
            />
            {qaProfilesState(qa) ??
              (qa.profiles.length ? (
                <View>
                  {groups.map((group) => (
                    <QaBusinessGroup
                      key={group.business.id}
                      profiles={group.profiles}
                      qa={qa}
                    />
                  ))}
                </View>
              ) : (
                <QaProfilesEmpty qa={qa} />
              ))}
          </View>
        </BottomSheetScrollView>
      </Modal>
    </>
  )
}

export function QaDomainIntro({
  qaDomain,
  onLeave,
  directory = false,
}: { qaDomain: string; onLeave?: () => void; directory?: boolean }) {
  return (
    <View
      className={
        directory
          ? "min-h-12 flex-row items-center justify-between gap-3 pl-5 pr-4"
          : "flex-row items-center justify-between gap-3 px-5 pb-3"
      }
    >
      <Text className="min-w-0 flex-1 text-[14px] [-rn-line-height:20] text-muted-foreground">
        {qaDomain}
      </Text>
      <QaDomainOptions onLeave={onLeave} />
    </View>
  )
}

/** Error or first-load banner; null once profiles can be listed. */
export function qaProfilesState(qa: Qa) {
  if (qa.profileError)
    return (
      <StatusBanner
        actionLabel="Try again"
        icon="TriangleAlert"
        message={qa.profileError}
        onActionPress={() => void qa.refreshProfiles()}
        title="Businesses unavailable"
        tone="destructive"
      />
    )
  if (qa.profilesLoading && qa.profiles.length === 0)
    return (
      <StatusBanner
        icon="RefreshCw"
        message="Loading the active businesses and stores for this exact QA domain."
        title="Loading QA businesses"
        tone="primary"
      />
    )
  return null
}

export function QaProfilesEmpty({ qa }: { qa: Qa }) {
  return (
    <StatusBanner
      actionLabel="Refresh"
      icon="Building2"
      message="No active QA businesses match this domain and search."
      onActionPress={() => void qa.refreshProfiles()}
      title="No QA businesses"
      tone="primary"
    />
  )
}

type QaDirectoryGroup = { identifier?: string; singleProfile: boolean }

/** One flat business section; only its Store/profile rows are interactive. */
export function QaBusinessGroup({
  directory,
  profiles,
  qa,
}: { directory?: QaDirectoryGroup; profiles: QaProfile[]; qa: Qa }) {
  const profile = profiles[0]
  if (!profile) return null
  return (
    <View className={directory ? "border-b border-border" : undefined}>
      <View
        className={
          directory
            ? "gap-1 px-5 pb-0.5 pt-4"
            : "gap-2 border-b border-border px-5 pb-3 pt-6"
        }
      >
        <View className="flex-row flex-wrap items-baseline justify-between gap-x-3">
          <Text
            accessibilityRole={directory ? "header" : undefined}
            accessibilityLabel={
              directory?.identifier
                ? `${profile.business.name}, business ID ending ${directory.identifier}`
                : undefined
            }
            className={
              directory
                ? "min-w-0 shrink text-[16px] [-rn-line-height:22] font-bold text-foreground/90"
                : "text-[17px] [-rn-line-height:24] font-bold text-foreground"
            }
          >
            {profile.business.name}
          </Text>
          {directory?.identifier ? (
            <Text
              importantForAccessibility="no"
              className="text-[14px] [-rn-line-height:20] tabular-nums text-muted-foreground"
            >
              #{directory.identifier}
            </Text>
          ) : null}
        </View>
        <View
          className={
            directory
              ? "flex-row flex-wrap gap-x-2 gap-y-1"
              : "flex-row flex-wrap gap-x-5 gap-y-1"
          }
          accessibilityLabel="Business counts. Services are included in catalog items."
        >
          <QaCount
            label="Catalog items"
            subdued={!!directory}
            value={profile.counts?.catalogItems}
          />
          <QaCount
            label="Services"
            separator={!!directory}
            subdued={!!directory}
            value={profile.counts?.services}
          />
        </View>
      </View>
      {profiles.map((entry, index) => (
        <View key={entry.profileReference}>
          {directory && index > 0 ? (
            <View className="ml-16 border-t border-border/70" />
          ) : null}
          <QaProfileRow directory={directory} profile={entry} qa={qa} />
        </View>
      ))}
    </View>
  )
}

function QaCount({
  label,
  separator = false,
  subdued = false,
  value,
}: {
  label: string
  separator?: boolean
  subdued?: boolean
  value?: number | null
}) {
  return (
    <View
      className="flex-row items-baseline gap-1.5"
      accessibilityLabel={`${label}: ${value == null ? "unavailable" : value}`}
    >
      {separator ? (
        <Text
          importantForAccessibility="no"
          className="text-[14px] [-rn-line-height:20] text-muted-foreground"
        >
          ·
        </Text>
      ) : null}
      <Text
        className={
          subdued
            ? "text-[14px] [-rn-line-height:20] font-semibold tabular-nums text-muted-foreground"
            : "text-[14px] [-rn-line-height:20] font-semibold tabular-nums text-foreground"
        }
      >
        {formatQaCount(value)}
      </Text>
      <Text className="text-[14px] [-rn-line-height:20] text-muted-foreground">
        {label}
      </Text>
    </View>
  )
}

export function QaProfileRow({
  directory,
  profile,
  qa,
}: { directory?: QaDirectoryGroup; profile: QaProfile; qa: Qa }) {
  const opening =
    qa.isSelecting && qa.selectingProfileReference === profile.profileReference
  const person = qaProfileDisplayName(profile)
  return (
    <Pressable
      accessibilityHint={`${person}. ${directory?.identifier ? `Business ID ending ${directory.identifier}. ` : ""}Signs in through the ordinary app session. ${profile.counts?.orders == null ? "Order count unavailable" : `${profile.counts.orders} orders in this Store`}.`}
      accessibilityLabel={`Open ${profile.business.name}, ${profile.store.name}, as ${profile.membership.role}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: qa.isSelecting, busy: opening }}
      className={
        directory
          ? `min-h-[68px] flex-row items-center gap-2.5 py-2.5 pl-5 pr-4 active:bg-accent ${opening ? "bg-accent" : ""}`
          : "min-h-20 gap-2 border-b border-border px-5 py-4 active:bg-accent"
      }
      disabled={qa.isSelecting}
      haptic
      onPress={() => qa.selectProfile(profile.profileReference)}
      transition={!directory}
    >
      {directory ? (
        <QaDirectoryProfile
          person={person}
          profile={profile}
          opening={opening}
          storeRepeatsBusiness={
            directory.singleProfile &&
            profile.store.name === profile.business.name
          }
        />
      ) : (
        <>
          <View className="flex-row items-start justify-between gap-3">
            <Text className="min-w-0 flex-1 text-[16px] [-rn-line-height:22] font-semibold text-foreground">
              {profile.store.name}
            </Text>
            <Text className="text-[14px] [-rn-line-height:20] uppercase text-muted-foreground">
              {opening ? "Opening…" : profile.membership.role}
            </Text>
          </View>
          <View className="flex-row items-start justify-between gap-3">
            <Text className="min-w-0 flex-1 text-[14px] [-rn-line-height:20] text-muted-foreground">
              {person}
            </Text>
            <Text className="text-[14px] [-rn-line-height:20] tabular-nums text-primary">
              {formatQaCount(profile.counts?.orders)} orders
            </Text>
          </View>
        </>
      )}
    </Pressable>
  )
}

function QaDirectoryProfile({
  person,
  profile,
  opening,
  storeRepeatsBusiness,
}: {
  person: string
  profile: QaProfile
  opening: boolean
  storeRepeatsBusiness: boolean
}) {
  const initials = person
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join("")
    .toUpperCase()
  const role = profile.membership.role
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
  return (
    <>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="size-[34px] shrink-0 items-center justify-center rounded-full bg-muted"
      >
        <Text
          className="text-xs font-semibold text-foreground/80"
          maxFontSizeMultiplier={1}
        >
          {initials}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-[16px] [-rn-line-height:22] font-medium text-foreground/80">
          {storeRepeatsBusiness ? person : profile.store.name}
        </Text>
        {storeRepeatsBusiness ? null : (
          <Text className="text-[14px] [-rn-line-height:19] text-muted-foreground">
            {person}
          </Text>
        )}
      </View>
      <View className="max-w-[38%] shrink-0 gap-0.5">
        <Text className="text-right text-[14px] [-rn-line-height:19] text-muted-foreground">
          {opening ? "Opening…" : role}
        </Text>
        <Text className="text-right text-[14px] [-rn-line-height:19] tabular-nums text-muted-foreground">
          {formatQaCount(profile.counts?.orders)} orders
        </Text>
      </View>
      <Icon name="ChevronRight" className="size-[14px] text-muted-foreground" />
    </>
  )
}

/** Round floating QA button: a "QA" mark, with the business count once set up. */
function QaFab({
  accessibilityHint,
  accessibilityLabel,
  count,
  onPress,
}: {
  accessibilityHint: string
  accessibilityLabel: string
  count?: number
  onPress: () => void
}) {
  return (
    <View>
      <Pressable
        accessibilityHint={accessibilityHint}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        className="size-14 items-center justify-center rounded-full border-[1.5px] border-primary/20 bg-card shadow-md active:bg-accent"
        haptic
        onPress={onPress}
        testID="qa-fab"
      >
        {/* The 56dp button does not grow, so its mark stops scaling at 1.3x. */}
        <Text
          maxFontSizeMultiplier={1.3}
          className="text-base font-extrabold [-rn-line-height:22] text-primary"
        >
          QA
        </Text>
      </Pressable>
      {count === undefined ? null : (
        // Outside the button, which clips its children. The count stops
        // scaling at 1.3x and the badge grows with it, so large text never
        // clips the number.
        <View
          className="absolute -right-1 -top-1 min-h-[22px] min-w-[22px] items-center justify-center rounded-full border-2 border-background bg-primary px-1"
          pointerEvents="none"
        >
          <Text
            maxFontSizeMultiplier={1.3}
            className="text-xs font-bold [-rn-line-height:16] [-rn-include-font-padding:false] [-rn-text-align-vertical:center] text-primary-foreground"
          >
            {count}
          </Text>
        </View>
      )}
    </View>
  )
}
