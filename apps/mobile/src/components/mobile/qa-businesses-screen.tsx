import { View } from "@/components/ui/view"
import { useQaAccelerator } from "@/hooks/use-qa-accelerator"
import { groupQaProfiles } from "@ewatrade/utils/qa-profiles"
import { useEffect, useMemo, useState } from "react"
import { FlatList } from "react-native"
import { BottomSearchFooter } from "./bottom-search-footer"
import {
  QaBusinessGroup,
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
  const [search, setSearch] = useState("")
  const [footerHeight, setFooterHeight] = useState(140)
  const profiles = useMemo(
    () => groupQaProfiles(filterQaProfiles(qa.profiles, search)),
    [qa.profiles, search],
  )

  // Auth owns navigation after selection (dismiss sign-in screens, then Home).
  // Popping this route on token change races that redirect and can blank the stack.
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
          paddingBottom: footerHeight + 24,
        }}
        data={state ? [] : profiles}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        keyExtractor={(group) => group.business.id}
        ListEmptyComponent={
          <View className="px-5">{state ?? <QaProfilesEmpty qa={qa} />}</View>
        }
        ListHeaderComponent={
          <View className="pb-2">
            <QaDomainIntro
              qaDomain={qa.authorization.qaDomain}
              onLeave={onClose}
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
        placeholder="Search businesses or people"
        totalCount={qa.profiles.length}
        value={search}
      />
    </View>
  )
}
