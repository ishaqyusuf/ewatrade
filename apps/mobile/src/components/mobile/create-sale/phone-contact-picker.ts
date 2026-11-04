import { requireOptionalNativeModule } from "expo"
import type { ExistingContact } from "expo-contacts"
import { Linking, Platform } from "react-native"

type ContactsModule = typeof import("expo-contacts")

/** Development builds made before expo-contacts lack it until rebuilt. */
export const phoneContactsAvailable =
  Platform.OS !== "web" && Boolean(requireOptionalNativeModule("ExpoContacts"))

export type PhoneContactPick =
  | { status: "picked"; contact: ExistingContact }
  | { status: "cancelled" }
  | { status: "denied"; canAskAgain: boolean }

/**
 * Opens the phone's own contact picker. iOS needs no access for it; Android
 * asks once, on this tap, because reading the picked numbers needs it.
 */
export async function pickPhoneContact(): Promise<PhoneContactPick> {
  if (!phoneContactsAvailable) return { status: "cancelled" }
  // Loaded on first use: importing it eagerly throws where it isn't linked.
  const Contacts = require("expo-contacts") as ContactsModule
  if (Platform.OS === "android") {
    let permission = await Contacts.getPermissionsAsync()
    if (!permission.granted && permission.canAskAgain)
      permission = await Contacts.requestPermissionsAsync()
    if (!permission.granted)
      return { status: "denied", canAskAgain: permission.canAskAgain }
  }
  const contact = await Contacts.presentContactPickerAsync()
  return contact ? { status: "picked", contact } : { status: "cancelled" }
}

export function openContactsSettings() {
  void Linking.openSettings()
}
