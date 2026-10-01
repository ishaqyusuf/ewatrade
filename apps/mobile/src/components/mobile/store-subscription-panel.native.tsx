import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { publicLegalUrl } from "@/lib/public-legal-url"
import { deepLinkToSubscriptions } from "expo-iap"
import { useRouter } from "expo-router"
import { Linking } from "react-native"
import { useStoreSubscription } from "./store-subscription-provider"

export function StoreSubscriptionPanel() {
  const router = useRouter()
  const billing = useStoreSubscription()
  if (!billing)
    return (
      <Text className="text-muted-foreground">
        Business billing permission is required.
      </Text>
    )
  const {
    catalog,
    verification,
    message,
    setMessage,
    iap,
    productIds,
    priceDescription,
    purchase,
    restore,
    store,
  } = billing
  const hasLegalPages = Boolean(
    publicLegalUrl("terms") && publicLegalUrl("privacy"),
  )
  return (
    <View className="gap-4">
      <Text className="text-lg font-bold text-foreground">
        App subscriptions
      </Text>
      <Text className="text-sm leading-5 text-muted-foreground">
        Software plans renew through your store account. Review the price,
        billing period and renewal terms in the store confirmation before
        subscribing. You can manage or cancel renewal in your store settings.
      </Text>
      {!productIds ? (
        <Text className="text-muted-foreground">
          Store subscriptions are not available yet.
        </Text>
      ) : null}
      {catalog.data?.legalAcceptanceRequired && hasLegalPages ? (
        <View className="gap-2">
          <Text className="text-muted-foreground">
            Review and accept the current Terms and Privacy Notice before
            starting a new software subscription. Existing purchases can still
            be restored.
          </Text>
          <Pressable
            accessibilityRole="button"
            className="min-h-11 justify-center"
            onPress={() => router.push("/account-privacy")}
          >
            <Text className="font-semibold text-primary">
              Review Terms and Privacy
            </Text>
          </Pressable>
        </View>
      ) : productIds && (!catalog.data?.purchaseAvailable || !hasLegalPages) ? (
        <Text className="text-muted-foreground">
          New subscriptions are paused until the public terms and privacy notice
          are available and effective. Existing purchases can still be restored.
        </Text>
      ) : null}
      {iap.subscriptions
        .filter((product) =>
          catalog.data?.products.some(
            (configured) =>
              configured.store === store && configured.productId === product.id,
          ),
        )
        .map((product) => (
          <Pressable
            key={product.id}
            accessibilityRole="button"
            disabled={
              !catalog.data?.purchaseAvailable ||
              !hasLegalPages ||
              verification.isPending ||
              !iap.connected ||
              !priceDescription(product)
            }
            className="min-h-14 justify-center rounded-lg border border-border px-4 py-3 disabled:opacity-50"
            onPress={() => void purchase(product)}
          >
            <Text className="font-semibold text-foreground">
              {product.title}
            </Text>
            <Text className="text-muted-foreground">
              {priceDescription(product) ??
                "Billing terms are unavailable. Purchasing is temporarily disabled."}
            </Text>
            <Text className="text-sm text-muted-foreground">
              {product.description}
            </Text>
          </Pressable>
        ))}
      <View className="gap-1">
        {(
          [
            ["Terms of service", "terms"],
            ["Privacy notice", "privacy"],
          ] as const
        ).map(([label, path]) => (
          <Pressable
            key={path}
            accessibilityRole="link"
            className="min-h-11 justify-center"
            onPress={() => {
              const url = publicLegalUrl(path)
              if (!url) {
                setMessage("The policy page is unavailable in this build.")
                return
              }
              void Linking.openURL(url).catch(() =>
                setMessage("The policy page could not open. Please try again."),
              )
            }}
          >
            <Text className="text-primary">{label}</Text>
          </Pressable>
        ))}
      </View>
      {catalog.error ? (
        <Text className="text-destructive">
          Subscription availability could not load.
        </Text>
      ) : null}
      {message ? (
        <Text accessibilityRole="alert" className="text-muted-foreground">
          {message}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={verification.isPending || !iap.connected}
        className="min-h-11 justify-center"
        onPress={() => void restore()}
      >
        <Text className="font-semibold text-primary">Restore purchases</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        className="min-h-11 justify-center"
        onPress={() =>
          void deepLinkToSubscriptions().catch(() =>
            setMessage("Store subscription settings could not open."),
          )
        }
      >
        <Text className="font-semibold text-primary">
          Manage store subscriptions
        </Text>
      </Pressable>
    </View>
  )
}
