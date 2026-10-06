import "server-only"

import { cookies } from "next/headers"
import { getTableSettingsScope } from "./columns"
import {
  type DirectoryPageId,
  type DirectoryViewSettings,
  getDirectoryViewCookie,
  parseSavedDirectoryView,
} from "./directory-view-settings"

export async function getInitialDirectoryView(
  pageId: DirectoryPageId,
  identity: { userId: string; tenantId: string },
): Promise<DirectoryViewSettings> {
  const scope = getTableSettingsScope(identity.userId, identity.tenantId)
  const value = (await cookies()).get(
    getDirectoryViewCookie(pageId, scope),
  )?.value
  return { scope, view: parseSavedDirectoryView(value) }
}
