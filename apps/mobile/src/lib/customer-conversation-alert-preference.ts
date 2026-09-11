import AsyncStorage from "@react-native-async-storage/async-storage"

const CUSTOMER_CONVERSATION_SOUND_KEY =
  "ewatrade:customer-conversation-sound:v1"

export async function getCustomerConversationSoundEnabled() {
  return (
    (await AsyncStorage.getItem(CUSTOMER_CONVERSATION_SOUND_KEY)) === "enabled"
  )
}

export async function setCustomerConversationSoundEnabled(enabled: boolean) {
  await AsyncStorage.setItem(
    CUSTOMER_CONVERSATION_SOUND_KEY,
    enabled ? "enabled" : "disabled",
  )
}
