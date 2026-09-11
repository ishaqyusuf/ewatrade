import {
  DashboardHomeHeader,
  DashboardStoreSetup,
  DashboardStoreSnapshot,
  EmptyState,
  MobileAppShell,
} from "@/components/mobile"
import { AdminCreateActionSheet } from "@/components/mobile/admin-tabs/admin-create-action-sheet"
import {
  AdminBusinessWorkspaceCard,
  AdminMoreHeader,
  AdminMoreMenuRow,
} from "@/components/mobile/admin-tabs/admin-more-screen"
import { CatalogFirstItemGate } from "@/components/mobile/catalog-items-sheet"
import { CatalogSetupHelperPicker } from "@/components/mobile/catalog-setup-helper-picker"
import {
  type CatalogVariantDraft,
  CatalogVariantManager,
} from "@/components/mobile/catalog-variant-manager"
import {
  CommerceFirstOrderGate,
  CommercePageHeader,
} from "@/components/mobile/commerce"
import { FormField } from "@/components/mobile/form-field"
import {
  KeyboardInlineComposer,
  type KeyboardInlineComposerPill,
} from "@/components/mobile/keyboard-inline-composer"
import { SetupCheckboxRow } from "@/components/mobile/setup-flow"
import {
  CatalogEssentialsFields,
  EmptyServiceChoiceGroupActions,
  OptionalDetailAction,
  ProductFirstOptionAction,
  ProductFirstOptionValueAction,
  ProductOptionsSectionHeader,
  ProductUseOnePriceAction,
  SellingUnitEditorQaFixture,
  ServiceAuthorizationOption,
  ServiceChoicesSectionHeader,
  ServiceDetailAction,
  ServiceWorkTrackingSwitch,
} from "@/components/mobile/simple-catalog-item-screen"
import { Icon } from "@/components/ui/icon"
import { useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { useColorScheme } from "@/hooks/use-color"
import { buildAdminMoreSections } from "@/lib/admin-navigation"
import type { BusinessLargeTextQaState } from "@/lib/business-large-text-qa"
import { useEffect, useLayoutEffect, useState } from "react"
import { KeyboardAwareScrollView } from "react-native-keyboard-controller"

const inert = () => undefined

export function BusinessLargeTextQaScreen({
  qaState,
  theme,
}: {
  qaState: BusinessLargeTextQaState
  theme: "dark" | "light"
}) {
  const { setColorScheme } = useColorScheme()

  useEffect(() => {
    setColorScheme(theme)
  }, [setColorScheme, theme])

  if (qaState === "b001") return <BusinessHomeQaScreen />
  if (qaState === "b002") return <BusinessOrdersQaScreen />
  if (qaState === "b003") return <BusinessCatalogQaScreen />
  if (qaState === "b004") return <BusinessMoreQaScreen />
  if (qaState === "b005") return <BusinessCreateQaScreen />
  if (qaState === "b006") return <BusinessProductSetupQaScreen />
  if (qaState === "b007") return <BusinessServiceSetupQaScreen />
  if (qaState === "b008") return <BusinessQuickSetupQaScreen />
  if (qaState === "b009") return <BusinessServiceWorkQaScreen />
  if (qaState === "b010") return <BusinessServicePackagesComposerQaScreen />
  if (qaState === "b011") return <BusinessServiceChoicesEmptyQaScreen />
  if (qaState === "b012") return <BusinessServiceChoicePricingQaScreen />
  if (qaState === "b013") return <BusinessServiceChoicePricingQaScreen />
  if (qaState === "b014")
    return <BusinessServiceChoicePricingQaScreen includeStore />
  if (qaState === "b015")
    return <BusinessProductSetupQaScreen showOptionalActions />
  if (qaState === "b016")
    return (
      <>
        <BusinessProductSetupQaScreen />
        <SellingUnitEditorQaFixture />
      </>
    )
  if (qaState === "b017") return <BusinessProductOptionsEmptyQaScreen />
  if (qaState === "b018") return <BusinessProductOptionsEmptySizeQaScreen />
  if (qaState === "b019") return <BusinessProductStockPricingQaScreen />

  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <Text className="text-center text-lg font-bold text-foreground">
        {qaState.toUpperCase()} fixture is queued for the next Business slice.
      </Text>
    </View>
  )
}

function BusinessProductOptionsEmptySizeQaScreen() {
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerValue, setComposerValue] = useState("")
  const sizePills: KeyboardInlineComposerPill[] = [
    "XS",
    "S",
    "M",
    "L",
    "XL",
  ].map((label) => ({ id: label, label }))

  return (
    <View className="flex-1 bg-background">
      <KeyboardAwareScrollView
        bottomOffset={160}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 240 }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 px-4 pt-8">
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1 gap-2">
              <Text className="text-2xl font-extrabold text-foreground">
                Add product
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                Add the first Size value without saving a Product.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close item setup"
              accessibilityRole="button"
              className="size-11 items-center justify-center rounded-full bg-muted"
              onPress={inert}
            >
              <Icon className="size-sm text-foreground" name="X" />
            </Pressable>
          </View>

          <View className="mt-3 gap-5 border-t border-border pt-7">
            <ProductOptionsSectionHeader hasOptions onAddOption={inert} />

            <View className="border-t border-border">
              <View className="gap-3 border-b border-border py-4">
                <View className="flex-row items-center gap-3">
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="text-base font-extrabold text-foreground">
                      Size
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      0 values
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel="Edit Size name"
                    className="h-11 w-11 items-center justify-center rounded-full bg-muted"
                    haptic
                    onPress={inert}
                    transition
                  >
                    <Icon className="size-sm text-foreground" name="Pencil" />
                  </Pressable>
                </View>
                <ProductFirstOptionValueAction
                  groupName="Size"
                  onPress={() => setComposerOpen(true)}
                />
              </View>
            </View>
          </View>
        </View>
      </KeyboardAwareScrollView>

      <KeyboardInlineComposer
        canSubmit={composerValue.trim().length > 0}
        dismissKeyboardOnSubmit
        helperText="Add one or more customer choices."
        largeTextPlaceholder="Size values"
        onChangeText={setComposerValue}
        onPillPress={(pill) => setComposerValue(pill.label)}
        onSubmit={inert}
        pills={sizePills}
        placeholder="Size values, separated by commas"
        submitAccessibilityLabel="Complete option values"
        submitIconName="Check"
        submitLabel="Done"
        title="Size choices"
        value={composerValue}
        visible={composerOpen}
      />
    </View>
  )
}

function BusinessProductOptionsEmptyQaScreen() {
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerValue, setComposerValue] = useState("")
  const productOptionPills: KeyboardInlineComposerPill[] = [
    "Size",
    "Color",
    "Material",
    "Length",
    "Weight",
  ].map((label) => ({ id: label, label }))

  return (
    <View className="flex-1 bg-background">
      <KeyboardAwareScrollView
        bottomOffset={160}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 144 }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 px-4 pt-8">
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1 gap-2">
              <Text className="text-2xl font-extrabold text-foreground">
                Add product
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                Configure independent prices for customer choices.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close item setup"
              accessibilityRole="button"
              className="size-11 items-center justify-center rounded-full bg-muted"
              onPress={inert}
            >
              <Icon className="size-sm text-foreground" name="X" />
            </Pressable>
          </View>

          <SetupCheckboxRow
            checked
            description="Use this for sizes, colours, or units that need their own prices."
            label="Different prices or options"
            onPress={inert}
          />

          <View className="mt-3 gap-5 border-t border-border pt-7">
            <ProductOptionsSectionHeader
              hasOptions={false}
              onAddOption={inert}
            />
            <View className="border-t border-border">
              <ProductFirstOptionAction onPress={() => setComposerOpen(true)} />
            </View>
            <ProductUseOnePriceAction onPress={inert} />
          </View>
        </View>
      </KeyboardAwareScrollView>

      <KeyboardInlineComposer
        helperText="What changes the price, stock, or customer choice?"
        largeTextPlaceholder="Option name"
        onChangeText={setComposerValue}
        onPillPress={(pill) => setComposerValue(pill.label)}
        onSubmit={inert}
        pills={productOptionPills}
        placeholder="Option name or choose a suggestion"
        submitAccessibilityLabel="Add option"
        submitIconName="Plus"
        submitLabel="Add option"
        title="Add a product option"
        value={composerValue}
        visible={composerOpen}
      />
    </View>
  )
}

function BusinessHomeQaScreen() {
  return (
    // biome-ignore lint/a11y/useValidAriaRole: MobileAppShell role selects Business permissions; it is not an ARIA role.
    <MobileAppShell
      businessName="Northstar Trading Company"
      centralAction={{ icon: "Plus", label: "Create", onPress: inert }}
      navItems={[
        { icon: "House", isActive: true, label: "Home", onPress: inert },
        { icon: "ReceiptText", label: "Orders", onPress: inert },
        { icon: "Warehouse", label: "Catalog", onPress: inert },
        { icon: "more", label: "More", onPress: inert },
      ]}
      role="owner"
      showHeader={false}
      title="Today"
    >
      <DashboardHomeHeader
        businessName="Northstar Trading Company"
        greetingName="Alexandria"
        onNotificationPress={inert}
        onProfilePress={inert}
        onSearchPress={inert}
      />
      <DashboardStoreSetup
        catalogReady={false}
        onAddItemPress={inert}
        onCreateOrderPress={inert}
        onInviteStaffPress={inert}
      />
      <DashboardStoreSnapshot
        itemValue="0"
        orderValue="0"
        revenueValue="₦0.00"
      />
      <View>
        <Text className="text-xl font-extrabold tracking-tight text-foreground">
          Recent orders
        </Text>
        <EmptyState
          className="mt-2"
          icon="ReceiptText"
          message="Add an item, then create your first order. It will appear here."
          title="No orders yet"
        />
      </View>
    </MobileAppShell>
  )
}

function BusinessOrdersQaScreen() {
  return (
    // biome-ignore lint/a11y/useValidAriaRole: MobileAppShell role selects Business permissions; it is not an ARIA role.
    <MobileAppShell
      businessName="Northstar Trading Company"
      centralAction={{ icon: "Plus", label: "Create", onPress: inert }}
      navItems={[
        { icon: "House", label: "Home", onPress: inert },
        {
          icon: "ReceiptText",
          isActive: true,
          label: "Orders",
          onPress: inert,
        },
        { icon: "Warehouse", label: "Catalog", onPress: inert },
        { icon: "more", label: "More", onPress: inert },
      ]}
      role="owner"
      showHeader={false}
      title="Orders"
    >
      <CommercePageHeader
        action={
          <Pressable
            accessibilityLabel="Open customers"
            accessibilityRole="button"
            className="size-11 items-center justify-center rounded-full bg-card"
            onPress={inert}
          >
            <Icon className="size-base text-foreground" name="Users" />
          </Pressable>
        }
        subtitle="Review payment and fulfilment across every order."
        title="Orders"
      />
      <CommerceFirstOrderGate catalogReady={false} onPrimaryPress={inert} />
    </MobileAppShell>
  )
}

function BusinessCatalogQaScreen() {
  return (
    // biome-ignore lint/a11y/useValidAriaRole: MobileAppShell role selects Business permissions; it is not an ARIA role.
    <MobileAppShell
      businessName="Northstar Trading Company"
      centralAction={{ icon: "Plus", label: "Create", onPress: inert }}
      navItems={[
        { icon: "House", label: "Home", onPress: inert },
        { icon: "ReceiptText", label: "Orders", onPress: inert },
        {
          icon: "Warehouse",
          isActive: true,
          label: "Catalog",
          onPress: inert,
        },
        { icon: "more", label: "More", onPress: inert },
      ]}
      role="owner"
      showHeader={false}
      title="Catalog"
    >
      <View className="gap-2 px-4">
        <Text className="text-[11px] font-extrabold uppercase tracking-[1.7px] text-primary">
          Your catalog
        </Text>
        <Text className="text-3xl font-extrabold tracking-tight text-foreground">
          What do you sell?
        </Text>
        <Text className="text-sm leading-5 text-muted-foreground">
          Choose one to build your first listing. You can add the other type
          anytime.
        </Text>
      </View>
      <CatalogFirstItemGate onAddProduct={inert} onAddService={inert} />
    </MobileAppShell>
  )
}

const emptyBusinessAvailability = {
  hasActiveSellableItems: false,
  hasCatalogItems: false,
  hasCustomers: false,
  hasInventoryActivity: false,
  hasOrders: false,
  hasPrescriptionCommerce: false,
  hasProductItems: false,
  hasReportableActivity: false,
  hasServiceItems: false,
  hasServiceJobs: false,
  hasStaff: false,
  storeId: "store_qa",
}

const businessMoreSections = buildAdminMoreSections({
  availability: emptyBusinessAvailability,
  role: "OWNER",
})

function BusinessMoreQaScreen() {
  return (
    // biome-ignore lint/a11y/useValidAriaRole: MobileAppShell role selects Business permissions; it is not an ARIA role.
    <MobileAppShell
      businessName="Northstar Trading Company"
      centralAction={{ icon: "Plus", label: "Create", onPress: inert }}
      navItems={[
        { icon: "House", label: "Home", onPress: inert },
        { icon: "ReceiptText", label: "Orders", onPress: inert },
        { icon: "Warehouse", label: "Catalog", onPress: inert },
        { icon: "more", isActive: true, label: "More", onPress: inert },
      ]}
      role="owner"
      showHeader={false}
      title="More"
    >
      <AdminMoreHeader onSyncPress={inert} syncAlertCount={12} />
      <AdminBusinessWorkspaceCard
        businessName="Northstar Trading Company"
        onPress={inert}
        roleLabel="Owner"
      />
      {businessMoreSections.map((section) => (
        <View className="mb-6" key={section.id}>
          <Text className="mb-1 text-[11px] font-extrabold uppercase tracking-[1.5px] text-muted-foreground">
            {section.title}
          </Text>
          {section.items.map((item) => (
            <AdminMoreMenuRow
              detail={
                item.id === "inventory" && item.disabled
                  ? "Add a Product to enable inventory"
                  : item.id === "sync-offline"
                    ? "Staff approval on · 12 waiting"
                    : undefined
              }
              item={item}
              key={item.id}
              onPress={inert}
            />
          ))}
        </View>
      ))}
    </MobileAppShell>
  )
}

function BusinessCreateQaScreen() {
  const modal = useModal()

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => modal.present())
    return () => cancelAnimationFrame(frame)
  }, [modal.present])

  return (
    <>
      <BusinessHomeQaScreen />
      <AdminCreateActionSheet
        availability={emptyBusinessAvailability}
        isOffline={false}
        modal={modal}
      />
    </>
  )
}

function BusinessProductSetupQaScreen({
  showOptionalActions = false,
}: {
  showOptionalActions?: boolean
}) {
  const [name, setName] = useState("")
  const [price, setPrice] = useState("")
  const [unitName, setUnitName] = useState("")

  return (
    <View className="flex-1 bg-background">
      <KeyboardAwareScrollView
        bottomOffset={160}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 144 }}
        disableScrollOnKeyboardHide
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 px-4 pt-8">
          <View className="mb-1 flex-row items-center justify-between gap-3">
            <Text className="min-w-0 flex-1 text-2xl font-extrabold text-foreground">
              Add product
            </Text>
            <Pressable
              accessibilityLabel="Close item setup"
              accessibilityRole="button"
              className="size-11 items-center justify-center rounded-full bg-muted"
              onPress={inert}
            >
              <Icon className="size-sm text-foreground" name="X" />
            </Pressable>
          </View>
          <Text className="text-sm leading-5 text-muted-foreground">
            Start with the essentials. Add details anytime.
          </Text>
          <Pressable
            accessibilityHint="Apply a common setup pattern to this item."
            accessibilityLabel="Choose a quick setup"
            accessibilityRole="button"
            className="min-h-11 flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4"
            onPress={inert}
          >
            <Icon className="size-sm text-primary" name="LayoutGrid" />
            <Text className="min-w-0 flex-1 text-sm font-bold text-foreground">
              Quick setup
            </Text>
            <Text className="text-xs font-bold text-primary">Optional</Text>
            <Icon
              className="size-sm text-muted-foreground"
              name="ChevronRight"
            />
          </Pressable>

          <CatalogEssentialsFields
            currencyCode="NGN"
            defaultQuoteRequired={false}
            kind="product"
            multiplePriceOptions={false}
            name={name}
            onNameChange={setName}
            onPriceChange={setPrice}
            onUnitNameChange={setUnitName}
            price={price}
            showProductEssentials
            unitName={unitName}
          />

          <View className="mt-1 border-t border-border pt-4">
            <Text className="text-lg font-extrabold text-foreground">
              Optional product details
            </Text>
            <Text className="mb-1 text-xs leading-5 text-muted-foreground">
              Add starting quantity or customer-facing context only when needed.
            </Text>
            {showOptionalActions ? (
              <>
                <OptionalDetailAction
                  description="Record the quantity available when this Product is saved."
                  icon="Warehouse"
                  label="Opening stock"
                  onPress={inert}
                />
                <OptionalDetailAction
                  description="Explain what customers should know."
                  icon="FileText"
                  label="Description"
                  onPress={inert}
                />
              </>
            ) : null}
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  )
}

function BusinessServiceSetupQaScreen() {
  const [name, setName] = useState("")
  const [price, setPrice] = useState("")

  return (
    <View className="flex-1 bg-background">
      <KeyboardAwareScrollView
        bottomOffset={160}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 144 }}
        disableScrollOnKeyboardHide
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 px-4 pt-8">
          <View className="mb-1 flex-row items-center justify-between gap-3">
            <Text className="min-w-0 flex-1 text-2xl font-extrabold text-foreground">
              Add service
            </Text>
            <Pressable
              accessibilityLabel="Close item setup"
              accessibilityRole="button"
              className="size-11 items-center justify-center rounded-full bg-muted"
              onPress={inert}
            >
              <Icon className="size-sm text-foreground" name="X" />
            </Pressable>
          </View>
          <Text className="text-sm leading-5 text-muted-foreground">
            Name the work. Set a price now, or quote each order later.
          </Text>
          <Pressable
            accessibilityHint="Apply a common setup pattern to this item."
            accessibilityLabel="Choose a quick setup"
            accessibilityRole="button"
            className="min-h-11 flex-row items-center gap-3 rounded-2xl border border-border bg-card px-4"
            onPress={inert}
          >
            <Icon className="size-sm text-primary" name="LayoutGrid" />
            <Text className="min-w-0 flex-1 text-sm font-bold text-foreground">
              Quick setup
            </Text>
            <Text className="text-xs font-bold text-primary">Optional</Text>
            <Icon
              className="size-sm text-muted-foreground"
              name="ChevronRight"
            />
          </Pressable>

          <CatalogEssentialsFields
            currencyCode="NGN"
            defaultQuoteRequired={false}
            kind="service"
            multiplePriceOptions={false}
            name={name}
            onNameChange={setName}
            onPriceChange={setPrice}
            onUnitNameChange={inert}
            price={price}
            showProductEssentials={false}
            unitName=""
          />

          <View className="mt-1 border-t border-border pt-4">
            <Text className="text-lg font-extrabold text-foreground">
              Service details
            </Text>
            <Text className="mb-1 text-xs text-muted-foreground">
              Add only what this service needs.
            </Text>
            <ServiceDetailAction
              description="Explain what customers receive."
              icon="FileText"
              label="Description"
              onPress={inert}
            />
            <ServiceDetailAction
              description="Offer service levels or turnaround choices."
              icon="LayoutGrid"
              label="Packages or options"
              onPress={inert}
            />
            <ServiceDetailAction
              description="Create a job and control when work can begin."
              icon="Briefcase"
              label="Track work after order"
              onPress={inert}
            />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  )
}

function BusinessQuickSetupQaScreen() {
  return (
    <View className="flex-1 bg-background">
      <CatalogSetupHelperPicker
        businessProfileKey="fashion-apparel"
        kind="product"
        onClose={inert}
        onSelect={inert}
        selectedKey={null}
        visible
      />
    </View>
  )
}

function BusinessServiceWorkQaScreen() {
  const [authorization, setAuthorization] = useState<
    "after_required_payment" | "manual_release" | "on_order_confirmation"
  >("on_order_confirmation")
  const [guidance, setGuidance] = useState("")

  return (
    <View className="flex-1 bg-background">
      <KeyboardAwareScrollView
        bottomOffset={160}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 144 }}
        disableScrollOnKeyboardHide
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 px-4 pt-8">
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1 gap-2">
              <Text className="text-2xl font-extrabold text-foreground">
                Add service
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                Configure the team handoff for each confirmed service order.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close item setup"
              accessibilityRole="button"
              className="size-11 items-center justify-center rounded-full bg-muted"
              onPress={inert}
            >
              <Icon className="size-sm text-foreground" name="X" />
            </Pressable>
          </View>

          <View className="mt-1 border-t border-border pt-4">
            <Text className="text-lg font-extrabold text-foreground">
              Work handoff
            </Text>
            <Text className="mb-1 text-xs text-muted-foreground">
              Choose whether an order should create work for your team.
            </Text>
            <ServiceWorkTrackingSwitch onPress={inert} />
            <Text className="mt-4 text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground">
              Work can start
            </Text>
            <View className="mt-1 border-t border-border">
              <ServiceAuthorizationOption
                description="Use when payment is not required before work begins."
                label="When the order is confirmed"
                onPress={() => setAuthorization("on_order_confirmation")}
                selected={authorization === "on_order_confirmation"}
              />
              <ServiceAuthorizationOption
                description="Hold the job until its required payment is received."
                label="After required payment"
                onPress={() => setAuthorization("after_required_payment")}
                selected={authorization === "after_required_payment"}
              />
              <ServiceAuthorizationOption
                description="A manager decides when the team can begin."
                label="After manager release"
                onPress={() => setAuthorization("manual_release")}
                selected={authorization === "manual_release"}
              />
            </View>
            <View className="mt-4">
              <FormField
                label="Customer guidance (optional)"
                multiline
                onChangeText={setGuidance}
                placeholder="Information shown with this service"
                value={guidance}
              />
            </View>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  )
}

function BusinessServicePackagesComposerQaScreen() {
  const [mode, setMode] = useState<"type" | "value">("type")
  const [value, setValue] = useState("")
  const typePills: KeyboardInlineComposerPill[] = [
    "Package",
    "Service level",
    "Turnaround",
    "Visit type",
    "Add-on",
  ].map((label) => ({ id: label, label }))
  const valuePills: KeyboardInlineComposerPill[] = [
    "Basic",
    "Standard",
    "Premium",
  ].map((label) => ({ id: label, label }))

  const choosePill = (pill: KeyboardInlineComposerPill) => {
    if (mode === "type") {
      setMode("value")
      setValue("")
      return
    }

    setValue((current) =>
      current.trim().length > 0 ? `${current}, ${pill.label}` : pill.label,
    )
  }

  return (
    <View className="flex-1 bg-background">
      <KeyboardAwareScrollView
        bottomOffset={160}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 320 }}
        disableScrollOnKeyboardHide
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 px-4 pt-8">
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1 gap-2">
              <Text className="text-2xl font-extrabold text-foreground">
                Add service
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                Add customer choices without saving a service.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close item setup"
              accessibilityRole="button"
              className="size-11 items-center justify-center rounded-full bg-muted"
              onPress={inert}
            >
              <Icon className="size-sm text-foreground" name="X" />
            </Pressable>
          </View>

          <View className="mt-1 gap-3 border-t border-border pt-4">
            <Text className="text-lg font-extrabold text-foreground">
              Service choices
            </Text>
            <Text className="text-xs leading-5 text-muted-foreground">
              Add a Package, Service level, Turnaround, Visit type, or Add-on.
            </Text>
            <View className="border-l-2 border-primary bg-muted px-3 py-3">
              <Text className="text-xs leading-5 text-muted-foreground">
                The composer below changes only this local QA fixture. Nothing
                is saved.
              </Text>
            </View>
          </View>
        </View>
      </KeyboardAwareScrollView>

      <KeyboardInlineComposer
        canSubmit={mode === "value" ? value.trim().length > 0 : undefined}
        dismissKeyboardOnSubmit={mode === "value"}
        helperText={
          mode === "value"
            ? "Add one or more customer choices."
            : "What changes the price, delivery, or experience?"
        }
        largeTextPlaceholder={
          mode === "value" ? "Package values" : "Option name"
        }
        onChangeText={setValue}
        onPillPress={choosePill}
        onSubmit={() => {
          if (mode === "type") {
            setMode("value")
            setValue("")
          }
        }}
        pills={mode === "value" ? valuePills : typePills}
        placeholder={
          mode === "value"
            ? "Package values, separated by commas"
            : "Option name or choose a suggestion"
        }
        submitAccessibilityLabel={
          mode === "value" ? "Complete option values" : "Add option"
        }
        submitIconName={mode === "value" ? "Check" : "Plus"}
        submitLabel={mode === "value" ? "Done" : "Add option"}
        title={mode === "value" ? "Package choices" : "Add a service option"}
        value={value}
        visible
      />
    </View>
  )
}

function BusinessServiceChoicesEmptyQaScreen() {
  return (
    <View className="flex-1 bg-background">
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 144 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 px-4 pt-8">
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1 gap-2">
              <Text className="text-2xl font-extrabold text-foreground">
                Add service
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                Configure customer-facing choices without saving a service.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close item setup"
              accessibilityRole="button"
              className="size-11 items-center justify-center rounded-full bg-muted"
              onPress={inert}
            >
              <Icon className="size-sm text-foreground" name="X" />
            </Pressable>
          </View>

          <View className="mt-3 gap-5 border-t border-border pt-7">
            <ServiceChoicesSectionHeader onAddOption={inert} />

            <View className="border-t border-border">
              <View className="gap-3 border-b border-border py-4">
                <View className="flex-row items-center gap-3">
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="text-base font-extrabold text-foreground">
                      Package
                    </Text>
                    <Text className="text-xs text-muted-foreground">
                      0 choices
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel="Edit Package name"
                    className="h-11 w-11 items-center justify-center rounded-full bg-muted"
                    haptic
                    onPress={inert}
                    transition
                  >
                    <Icon className="size-sm text-foreground" name="Pencil" />
                  </Pressable>
                </View>
                <EmptyServiceChoiceGroupActions
                  groupName="Package"
                  onAddFirstChoice={inert}
                />
              </View>
            </View>

            <Pressable
              accessibilityLabel="Remove all service choices"
              className="-mx-2 min-h-16 flex-row items-center gap-3 rounded-2xl px-3 py-3 active:bg-destructive/10"
              haptic
              onPress={inert}
            >
              <View className="min-w-0 flex-1 gap-1">
                <Text className="text-xs font-extrabold text-destructive">
                  Remove all service choices
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  )
}

function makeEmptyServiceVariantDraft(): CatalogVariantDraft {
  return {
    barcode: "",
    description: "",
    enabled: true,
    imageUrl: "",
    price: "",
    quantity: "",
    quoteRequired: false,
    sku: "",
    storeIds: [],
    unitPrices: {},
  }
}

function BusinessProductStockPricingQaScreen() {
  const [drafts, setDrafts] = useState<Record<string, CatalogVariantDraft>>({
    xs: makeEmptyServiceVariantDraft(),
  })

  return (
    <View className="flex-1 bg-background">
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 144 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 px-4 pt-8">
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1 gap-2">
              <Text className="text-2xl font-extrabold text-foreground">
                Add product
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                Configure the generated XS combination without saving.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close item setup"
              accessibilityRole="button"
              className="size-11 items-center justify-center rounded-full bg-muted"
              onPress={inert}
            >
              <Icon className="size-sm text-foreground" name="X" />
            </Pressable>
          </View>

          <View className="mt-3 gap-5 border-t border-border pt-7">
            <View className="gap-1">
              <Text className="text-lg font-extrabold text-foreground">
                Product stock &amp; pricing
              </Text>
              <Text className="text-xs leading-5 text-muted-foreground">
                Open XS to set its stock-unit quantity and price.
              </Text>
            </View>
            <CatalogVariantManager
              basePrice=""
              canonicalTransactionScale={2}
              combinations={[{ key: "xs", name: "XS" }]}
              currencyCode="NGN"
              drafts={drafts}
              kind="product"
              makeDefaultDraft={makeEmptyServiceVariantDraft}
              onChangeDraft={(key, draft) =>
                setDrafts((current) => ({ ...current, [key]: draft }))
              }
              optionPricingOnly
              stores={[]}
              unitName=""
              units={[]}
            />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  )
}

function BusinessServiceChoicePricingQaScreen({
  includeStore = false,
}: {
  includeStore?: boolean
}) {
  const [drafts, setDrafts] = useState<Record<string, CatalogVariantDraft>>({
    basic: makeEmptyServiceVariantDraft(),
  })

  return (
    <View className="flex-1 bg-background">
      <KeyboardAwareScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 144 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5 px-4 pt-8">
          <View className="flex-row items-start justify-between gap-3">
            <View className="min-w-0 flex-1 gap-2">
              <Text className="text-2xl font-extrabold text-foreground">
                Add service
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                Configure Package pricing without saving a service.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close item setup"
              accessibilityRole="button"
              className="size-11 items-center justify-center rounded-full bg-muted"
              onPress={inert}
            >
              <Icon className="size-sm text-foreground" name="X" />
            </Pressable>
          </View>

          <View className="mt-3 gap-5 border-t border-border pt-7">
            <View className="gap-1">
              <Text className="text-lg font-extrabold text-foreground">
                Price each choice
              </Text>
              <Text className="text-xs leading-5 text-muted-foreground">
                Set a fixed price, request a quote, or add customer-facing
                details for each choice.
              </Text>
            </View>
            <CatalogVariantManager
              basePrice=""
              canonicalTransactionScale={2}
              combinations={[{ key: "basic", name: "Basic" }]}
              currencyCode="NGN"
              drafts={drafts}
              kind="service"
              makeDefaultDraft={makeEmptyServiceVariantDraft}
              onChangeDraft={(key, draft) =>
                setDrafts((current) => ({ ...current, [key]: draft }))
              }
              optionPricingOnly
              stores={
                includeStore
                  ? [{ id: "store_qa", name: "Northstar Main Store" }]
                  : []
              }
              unitName="service"
              units={[]}
            />
            <View className="border-l-2 border-primary bg-muted px-3 py-3">
              <Text className="text-xs leading-5 text-muted-foreground">
                A fixed price is optional. Use Quote when the final amount
                depends on the customer request.
              </Text>
            </View>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  )
}
