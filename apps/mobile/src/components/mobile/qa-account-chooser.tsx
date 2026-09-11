import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useQaAccelerator } from "@/hooks/use-qa-accelerator"
import { useMemo, useState } from "react"
import { FormField } from "./form-field"
import { StatusBanner } from "./status-banner"

export function QaAccountChooser() {
  const qa = useQaAccelerator()
  const modal = useModal()
  const [search, setSearch] = useState("")
  const filteredProfiles = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return qa.profiles
    return qa.profiles.filter((profile) =>
      [
        profile.business.name,
        profile.business.slug,
        profile.identity.email,
        profile.identity.name,
        profile.membership.role,
        profile.store.name,
      ].some((value) => value.toLowerCase().includes(query)),
    )
  }, [qa.profiles, search])

  if (!qa.clientEnabled) {
    return null
  }

  if (!qa.capabilityAvailable || !qa.authorization) {
    return (
      <Pressable
        accessibilityHint="Opens optional QA Domain and tester credential setup"
        accessibilityLabel="Set up QA"
        accessibilityRole="button"
        className="min-h-11 flex-row items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-3 active:bg-primary/20"
        haptic
        onPress={qa.openAuthorizationSheet}
        transition
      >
        <Icon className="size-sm text-primary" name="Globe" />
        <Text className="text-xs font-black uppercase tracking-[1px] text-primary">
          Set QA
        </Text>
      </Pressable>
    )
  }

  return (
    <>
      <View className="items-end">
        <Pressable
          accessibilityHint="Shows businesses registered for the active QA Domain"
          accessibilityLabel={`Open ${qa.profiles.length} QA businesses`}
          accessibilityRole="button"
          className="relative min-h-11 flex-row items-center justify-center gap-2 rounded-2xl bg-primary px-3 shadow-sm active:bg-primary/90"
          haptic
          onPress={modal.present}
          transition
        >
          <Icon className="size-sm text-primary-foreground" name="Users" />
          <Text className="text-xs font-black uppercase tracking-[1px] text-primary-foreground">
            QA · {qa.profiles.length}
          </Text>
        </Pressable>
      </View>

      <Modal
        enableDynamicSizing
        keyboardBehavior="extend"
        maxDynamicContentSize={660}
        ref={modal.ref}
        snapPoints={["72%"]}
        title="QA businesses"
      >
        <BottomSheetKeyboardAwareScrollView
          bottomOffset={100}
          contentContainerStyle={{ paddingBottom: 24 }}
          extraKeyboardSpace={120}
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-4 px-5 pb-5">
            <View className="gap-1">
              <Text className="text-sm font-semibold text-foreground">
                {qa.authorization.qaDomain}
              </Text>
              <Text className="text-xs text-muted-foreground">
                Selecting a business creates a normal app session. No password
                is exposed or filled.
              </Text>
            </View>
            <FormField
              autoCapitalize="none"
              label="Search businesses"
              leadingIcon="Search"
              onChangeText={setSearch}
              placeholder="Business, owner, role, or store"
              value={search}
              variant="search"
            />
            {qa.profileError ? (
              <StatusBanner
                actionLabel="Try again"
                icon="TriangleAlert"
                message={qa.profileError}
                onActionPress={() => void qa.refreshProfiles()}
                title="Businesses unavailable"
                tone="destructive"
              />
            ) : null}
            {qa.profilesLoading && qa.profiles.length === 0 ? (
              <StatusBanner
                icon="RefreshCw"
                message="Loading the active businesses and stores for this exact QA domain."
                title="Loading QA businesses"
                tone="info"
              />
            ) : filteredProfiles.length ? (
              <View className="gap-2">
                {filteredProfiles.map((profile) => (
                  <Pressable
                    accessibilityHint="Signs in through the ordinary app session"
                    accessibilityLabel={`Open ${profile.business.name}, ${profile.store.name}, as ${profile.membership.role}`}
                    accessibilityRole="button"
                    className="min-h-16 flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 active:bg-accent"
                    disabled={qa.isSelecting}
                    haptic
                    key={profile.profileReference}
                    onPress={() => qa.selectProfile(profile.profileReference)}
                    transition
                  >
                    <View className="size-10 items-center justify-center rounded-xl bg-primary/10">
                      <Text className="font-black text-primary">
                        {profile.business.name.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View className="min-w-0 flex-1 gap-0.5">
                      <Text
                        className="font-bold text-foreground"
                        numberOfLines={1}
                      >
                        {profile.business.name}
                      </Text>
                      <Text
                        className="text-xs text-muted-foreground"
                        numberOfLines={1}
                      >
                        {profile.store.name} · {profile.identity.name}
                      </Text>
                    </View>
                    <View className="rounded-full bg-muted px-2.5 py-1">
                      <Text className="text-[10px] font-black uppercase text-muted-foreground">
                        {qa.selectingProfileReference ===
                        profile.profileReference
                          ? "Opening…"
                          : profile.membership.role}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : (
              <StatusBanner
                actionLabel="Refresh"
                icon="Building2"
                message="No active QA businesses match this domain and search."
                onActionPress={() => void qa.refreshProfiles()}
                title="No QA businesses"
                tone="info"
              />
            )}
            <View className="flex-row justify-between gap-3 border-t border-border pt-3">
              <Pressable
                accessibilityRole="button"
                className="min-h-11 justify-center px-1"
                onPress={() => {
                  modal.dismiss()
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
                <Text className="text-sm font-bold text-primary">
                  Change QA Domain
                </Text>
              </Pressable>
            </View>
          </View>
        </BottomSheetKeyboardAwareScrollView>
      </Modal>
    </>
  )
}
