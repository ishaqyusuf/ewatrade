import { View } from "@/components/ui/view"
import { useQaAccelerator } from "@/hooks/use-qa-accelerator"
import {
  filterQaProfiles,
  groupQaProfiles,
  qaBusinessNameIdentifiers,
} from "@ewatrade/utils/qa-profiles"
import { useEffect, useMemo, useState } from "react"
import { FlatList } from "react-native"
import { BottomSearchFooter } from "./bottom-search-footer"
import {
  QaBusinessGroup,
  QaDomainIntro,
  QaProfilesEmpty,
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
  const groups = useMemo(() => groupQaProfiles(qa.profiles), [qa.profiles])
  const directory = useMemo(() => {
    const identifiers = qaBusinessNameIdentifiers(
      groups.map(({ business }) => business),
    )
    return new Map(
      groups.map(({ business, profiles }) => [
        business.id,
        {
          identifier: identifiers.get(business.id),
          singleProfile: profiles.length === 1,
        },
      ]),
    )
  }, [groups])
  const profiles = useMemo(
    () =>
      search.trim()
        ? groupQaProfiles(filterQaProfiles(qa.profiles, search))
        : groups,
    [groups, qa.profiles, search],
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
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View className="px-5">{state ?? <QaProfilesEmpty qa={qa} />}</View>
        }
        ListHeaderComponent={
          <QaDomainIntro
            directory
            qaDomain={qa.authorization.qaDomain}
            onLeave={onClose}
          />
        }
        renderItem={({ item }) => (
          <QaBusinessGroup
            directory={directory.get(item.business.id)}
            profiles={item.profiles}
            qa={qa}
          />
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
