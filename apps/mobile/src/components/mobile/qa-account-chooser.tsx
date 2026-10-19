import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useQaAccelerator } from "@/hooks/use-qa-accelerator"
import { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { useRouter } from "expo-router"
import { useEffect, useRef } from "react"
import { StatusBanner } from "./status-banner"

/** Up to this many businesses fit a compact sheet; more open the full list. */
export const QA_SHEET_MAX_BUSINESSES = 5
export function qaChooserLayout(count: number) {
  return count > QA_SHEET_MAX_BUSINESSES ? "full" : "sheet"
}

type Qa = ReturnType<typeof useQaAccelerator>
type QaProfile = Qa["profiles"][number]

export function filterQaProfiles(profiles: QaProfile[], search: string) {
  const query = search.trim().toLowerCase()
  if (!query) return profiles
  return profiles.filter((profile) =>
    [
      profile.business.name,
      profile.business.slug,
      profile.identity.email,
      profile.identity.name,
      profile.membership.role,
      profile.store.name,
    ].some((value) => value.toLowerCase().includes(query)),
  )
}

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

  const full = qaChooserLayout(qa.profiles.length) === "full"
  return (
    <>
      <QaFab
        accessibilityHint="Shows businesses registered for the active QA Domain"
        accessibilityLabel={`Open ${qa.profiles.length} QA businesses`}
        count={qa.profiles.length}
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
          <View className="gap-4 px-5 pb-5">
            <QaDomainIntro qaDomain={qa.authorization.qaDomain} />
            {qaProfilesState(qa) ??
              (qa.profiles.length ? (
                <View className="gap-2">
                  {qa.profiles.map((profile) => (
                    <QaProfileRow
                      key={profile.profileReference}
                      profile={profile}
                      qa={qa}
                    />
                  ))}
                </View>
              ) : (
                <QaProfilesEmpty qa={qa} />
              ))}
            <QaDomainActions qa={qa} onLeave={modal.dismiss} />
          </View>
        </BottomSheetScrollView>
      </Modal>
    </>
  )
}

export function QaDomainIntro({ qaDomain }: { qaDomain: string }) {
  return (
    <View className="gap-1">
      <Text className="text-sm font-semibold text-foreground">{qaDomain}</Text>
      <Text className="text-xs text-muted-foreground">
        Selecting a business creates a normal app session. No password is
        exposed or filled.
      </Text>
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

export function QaProfileRow({ profile, qa }: { profile: QaProfile; qa: Qa }) {
  return (
    <Pressable
      accessibilityHint="Signs in through the ordinary app session"
      accessibilityLabel={`Open ${profile.business.name}, ${profile.store.name}, as ${profile.membership.role}`}
      accessibilityRole="button"
      className="min-h-16 flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 active:bg-accent"
      disabled={qa.isSelecting}
      haptic
      onPress={() => qa.selectProfile(profile.profileReference)}
      transition
    >
      <View className="size-10 items-center justify-center rounded-xl bg-primary/10">
        <Text className="font-black text-primary">
          {profile.business.name.slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-bold text-foreground" numberOfLines={1}>
          {profile.business.name}
        </Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {profile.store.name} · {profile.identity.name}
        </Text>
      </View>
      <View className="rounded-full bg-muted px-2.5 py-1">
        <Text className="text-xs font-black uppercase text-muted-foreground">
          {qa.selectingProfileReference === profile.profileReference
            ? "Opening…"
            : profile.membership.role}
        </Text>
      </View>
    </Pressable>
  )
}

/** Clear QA data / Change QA Domain; onLeave closes the chooser first. */
export function QaDomainActions({
  qa,
  onLeave,
}: {
  qa: Qa
  onLeave: () => void
}) {
  return (
    <View className="flex-row justify-between gap-3 border-t border-border pt-3">
      <Pressable
        accessibilityRole="button"
        className="min-h-11 justify-center px-1"
        onPress={() => {
          onLeave()
          void qa.clearQaData().then(qa.openAuthorizationSheet)
        }}
      >
        <Text className="text-sm font-bold text-destructive">
          Clear QA data
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        className="min-h-11 justify-center px-1"
        onPress={() => void qa.clearQaData()}
      >
        <Text className="text-sm font-bold text-primary">Change QA Domain</Text>
      </Pressable>
    </View>
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
        <Text className="text-base font-extrabold [-rn-line-height:22] text-primary">
          QA
        </Text>
      </Pressable>
      {count === undefined ? null : (
        // Outside the button, which clips its children.
        <View
          className="absolute -right-1 -top-1 h-[22px] min-w-[22px] items-center justify-center rounded-full border-2 border-background bg-primary px-1"
          pointerEvents="none"
        >
          <Text className="text-xs font-bold [-rn-line-height:22] [-rn-include-font-padding:false] [-rn-text-align-vertical:center] text-primary-foreground">
            {count}
          </Text>
        </View>
      )}
    </View>
  )
}
