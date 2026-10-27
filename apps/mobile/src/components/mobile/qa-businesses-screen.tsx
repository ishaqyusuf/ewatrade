import { View } from "@/components/ui/view"
import { useAuthContext } from "@/hooks/use-auth"
import { useQaAccelerator } from "@/hooks/use-qa-accelerator"
import { groupQaProfiles } from "@ewatrade/utils/qa-profiles"
import { useRouter } from "expo-router"
import { useEffect, useMemo, useRef, useState } from "react"
import { FlatList } from "react-native"
import { BottomSearchFooter } from "./bottom-search-footer"
import {
  QaBusinessGroup,
  QaDomainActions,
  QaDomainIntro,
  QaProfilesEmpty,
  filterQaProfiles,
  qaProfilesState,
} from "./qa-account-chooser"

/**
 * Full-screen QA business list for domains with more than five businesses:
 * every profile in one scroll, with search docked at the bottom. Selecting a
 * business creates the same ordinary session as the compact sheet.
 */
export function QaBusinessesScreen({ onClose }: { onClose: () => void }) {
  const qa = useQaAccelerator()
  const router = useRouter()
  const { token } = useAuthContext()
  const [search, setSearch] = useState("")
  const [footerHeight, setFooterHeight] = useState(140)
  const lastToken = useRef(token)
  const profiles = useMemo(
    () => groupQaProfiles(filterQaProfiles(qa.profiles, search)),
    [qa.profiles, search],
  )

  // A selected business (new session) or a cleared domain ends the list.
  useEffect(() => {
    if (lastToken.current === token) return
    lastToken.current = token
    onClose()
  }, [token, onClose])
  const authorized = qa.capabilityAvailable && !!qa.authorization
  useEffect(() => {
    if (!authorized) onClose()
  }, [authorized, onClose])
  if (!qa.authorization) return null

  const state = qaProfilesState(qa)
  return (
    <View className="flex-1">
      <FlatList
        contentContainerStyle={{
          flexGrow: 1,
          gap: 8,
          paddingHorizontal: 20,
          paddingBottom: footerHeight + 24,
        }}
        data={state ? [] : profiles}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(group) => group.business.id}
        ListEmptyComponent={state ?? <QaProfilesEmpty qa={qa} />}
        ListHeaderComponent={
          <View className="pb-2">
            <QaDomainIntro
              qaDomain={qa.authorization.qaDomain}
              refreshing={qa.profilesLoading}
              onRefresh={() => void qa.refreshProfiles()}
            />
            <QaDomainActions
              qa={qa}
              onLeave={() => (router.canGoBack() ? router.back() : onClose())}
            />
          </View>
        }
        renderItem={({ item }) => (
          <QaBusinessGroup profiles={item.profiles} qa={qa} />
        )}
      />
      <BottomSearchFooter
        accessibilityLabel="Search QA businesses"
        alwaysShowSearch
        label="Search businesses"
        localSearch
        maxLength={160}
        onChangeText={setSearch}
        onHeightChange={setFooterHeight}
        placeholder="Search businesses, Stores or people"
        totalCount={qa.profiles.length}
        value={search}
      />
    </View>
  )
}
