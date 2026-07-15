import { ActionButton } from "@/components/mobile/action-button"
import { AuthHeader } from "@/components/mobile/auth-header"
import {
  DashboardMetricCard,
  DashboardPanel,
  DashboardQuickAction,
  DashboardRecordRow,
  DashboardStatTile,
} from "@/components/mobile/dashboard-kit"
import { EmptyState } from "@/components/mobile/empty-state"
import { FormField } from "@/components/mobile/form-field"
import {
  InventoryMovementRow,
  InventoryProductCard,
  InventorySegmentOption,
  InventoryUnitOption,
} from "@/components/mobile/inventory-product-card"
import { MobileAppShell } from "@/components/mobile/app-shell"
import { MobileScreen } from "@/components/mobile/screen"
import { OtpInput } from "@/components/mobile/otp-input"
import { QuantityStepper } from "@/components/mobile/quantity-stepper"
import { ReportMetricTile, ReportSection } from "@/components/mobile/report-flow"
import {
  SaleSegmentOption,
  SaleSelectableRow,
  SaleTotalSummary,
} from "@/components/mobile/sale-flow"
import {
  SecondaryOperationalRow,
  SecondarySheetHeader,
} from "@/components/mobile/secondary-operations"
import {
  SessionSectionHeader,
  SessionSourcePanel,
  SessionStatTile,
  SessionVarianceRow,
} from "@/components/mobile/session-flow"
import {
  SetupChoicePill,
  SetupFlowHeader,
  SetupInlineNotice,
  SetupSection,
  SetupSummaryRow,
} from "@/components/mobile/setup-flow"
import {
  ShareLinkActionButton,
  ShareLinkMetricTile,
  ShareLinkOptionPill,
  ShareLinkPanel,
  ShareLinkRecordRow,
} from "@/components/mobile/share-link-flow"
import { StatusBadge } from "@/components/mobile/status-badge"
import { StatusBanner } from "@/components/mobile/status-banner"
import {
  SyncReliabilityAction,
  SyncReliabilityPanel,
  SyncReliabilityRow,
  SyncReliabilityStat,
  SyncReliabilityToggle,
} from "@/components/mobile/sync-flow"
import { TimelineRow } from "@/components/mobile/timeline-row"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Icon } from "@/components/ui/icon"
import { Modal, useModal } from "@/components/ui/modal"
import { Pressable } from "@/components/ui/pressable"
import { Switch } from "@/components/ui/switch"
import { Text } from "@/components/ui/text"
import { View } from "@/components/ui/view"
import { BottomSheetKeyboardAwareScrollView } from "@/components/ui/bottom-sheet-keyboard-aware-scroll-view"
import { useColorScheme } from "@/hooks/use-color"
import { getAppVariant } from "@/lib/app-variant"
import { setThemeOverride } from "@/lib/theme-preference"
import { cn } from "@/lib/utils"
import { useRouter } from "expo-router"
import { useMemo, useState, type ReactNode } from "react"
import { Image, ScrollView, type ImageSourcePropType } from "react-native"
import { MobileAnalyticsBarChart } from "./analytics-bar-chart"
import {
  DESIGN_SYSTEM_CATALOG_SECTIONS,
  DESIGN_SYSTEM_PATTERNS,
  PLAYGROUND_CHART_DATA,
  PLAYGROUND_METRICS,
  PLAYGROUND_SAMPLE_TOTALS,
  PLAYGROUND_STATUS_EXAMPLES,
  type DesignSystemPattern,
  type DesignSystemPatternId,
} from "./data"

const tokenExamples = [
  { className: "bg-background", label: "Background" },
  { className: "bg-card", label: "Card" },
  { className: "bg-primary", label: "Primary" },
  { className: "bg-success", label: "Success" },
  { className: "bg-warn", label: "Warn" },
  { className: "bg-destructive", label: "Destructive" },
  { className: "bg-muted", label: "Muted" },
  { className: "bg-border", label: "Border" },
]

const brandAssetExamples = [
  {
    description: "Production splash/logo mark for approval surfaces.",
    label: "Splash logo",
    source: require("@assets/icons/splash-logo.png"),
  },
  {
    description: "Production launcher icon shape and color density.",
    label: "App icon",
    source: require("@assets/icons/loading-icon.png"),
  },
  {
    description: "Light-mode iOS icon treatment.",
    label: "iOS light",
    source: require("@assets/icons/ios-light.png"),
  },
  {
    description: "Dark-mode iOS icon treatment.",
    label: "iOS dark",
    source: require("@assets/icons/ios-dark.png"),
  },
]

type DesignReferencePreview = {
  adoption: string
  detail: string
  fullImageClassName?: string
  id: string
  label: string
  source?: ImageSourcePropType
  sourceLabel: string
  title: string
}

const designReferenceImageExamples: DesignReferencePreview[] = [
  {
    adoption: "Home shell",
    detail:
      "Adopt the deep header, integrated search, hero card, category cards, product media rows, and rounded bottom navigation.",
    fullImageClassName: "h-[540px]",
    id: "home-shell",
    label: "Pin 2",
    source: require("@assets/images/design-system/reference-home-shell.jpg"),
    sourceLabel: "reference-pins/pin-2",
    title: "Search, hero, service cards",
  },
  {
    adoption: "Commerce",
    detail:
      "Adopt the product media lead, filter/search controls, variant choices, and sticky commerce action treatment.",
    fullImageClassName: "h-[520px]",
    id: "commerce",
    label: "Pin 3",
    source: require("@assets/images/design-system/reference-commerce.jpg"),
    sourceLabel: "reference-pins/pin-3",
    title: "Product media and sticky CTA",
  },
  {
    adoption: "Detail",
    detail:
      "Adopt the map/detail split as an operational bottom-sheet pattern with progress, metadata, and contact actions.",
    fullImageClassName: "h-[640px]",
    id: "operational-detail",
    label: "Pin 4",
    source: require("@assets/images/design-system/reference-operational-detail.jpg"),
    sourceLabel: "reference-pins/pin-4",
    title: "Status detail sheet",
  },
  {
    adoption: "Lists",
    detail:
      "Adopt the search/filter rhythm, shipment cards, status pills, and visual timeline cadence for Retail Ops records.",
    fullImageClassName: "h-[660px]",
    id: "operational-list",
    label: "Pin 5",
    source: require("@assets/images/design-system/reference-operational-list.jpg"),
    sourceLabel: "reference-pins/pin-5",
    title: "Operational list rhythm",
  },
]

const dribbbleDesignReference: DesignReferencePreview = {
  adoption: "Deep header, integrated search, hero panel, category tiles.",
  detail:
    "Primary mobile reference: sales performance cards, order status, analytics, onboarding, profile/settings, and notifications.",
  id: "dribbble-sales-order",
  label: "Dribbble sales/order app",
  sourceLabel: "dribbble.com/shots/27067100",
  title: "Sales and order management app",
}

const designReferencePreviewExamples: DesignReferencePreview[] = [
  dribbbleDesignReference,
  ...designReferenceImageExamples,
]

const designReferenceExamples = [
  dribbbleDesignReference,
  {
    adoption: "Location header, service cards, soft media cards, bottom nav.",
    detail:
      "Saved Pin 2: deep teal header, integrated search, hero panel, soft service cards, rounded bottom nav.",
    id: "home-shell",
    label: "Home shell reference",
    sourceLabel: "reference-pins/pin-2",
    title: "Search, hero, service cards",
  },
  {
    adoption: "Floating black nav, timeline cards, filters, detail sheet.",
    detail:
      "Saved Pins 4/5: floating black nav, timeline cards, pill filters, shipment/status detail sheets.",
    id: "operational-list",
    label: "Operational flow reference",
    sourceLabel: "reference-pins/pin-4 and pin-5",
    title: "Operational list and detail system",
  },
]

const commerceAssetExamples = [
  {
    label: "Feed campaign",
    source: require("@assets/images/e-shop/banner.jpg"),
  },
  {
    label: "Product card",
    source: require("@assets/images/e-shop/hair/olaplex-1.jpeg"),
  },
]

const reportRows = [
  {
    detail: "Cash and transfer combined",
    id: "sales",
    label: "Today sales",
    tone: "success" as const,
    value: PLAYGROUND_SAMPLE_TOTALS.salesToday,
  },
  {
    detail: "Queued device events awaiting review",
    id: "sync",
    label: "Sync conflicts",
    tone: "warning" as const,
    value: PLAYGROUND_SAMPLE_TOTALS.syncConflicts,
  },
  {
    detail: "Received and adjusted stock movement",
    id: "movement",
    label: "Inventory movement",
    value: PLAYGROUND_SAMPLE_TOTALS.inventoryMovement,
  },
]

function isDesignSystemPlaygroundEnabled() {
  return __DEV__ || getAppVariant() !== "production"
}

function patternForSection(
  sectionId: string,
): DesignSystemPatternId {
  if (sectionId === "analytics" || sectionId === "headers") {
    return sectionId
  }

  if (sectionId === "patterns") {
    return "retail-ops"
  }

  if (sectionId === "tokens" || sectionId === "typography") {
    return "detail"
  }

  if (sectionId === "lists" || sectionId === "status") {
    return "list"
  }

  return "detail"
}

function Section({
  children,
  description,
  title,
}: {
  children: ReactNode
  description?: string
  title: string
}) {
  return (
    <View className="gap-4 py-5">
      <View className="gap-1">
        <Text className="text-lg font-extrabold text-foreground">{title}</Text>
        {description ? (
          <Text className="text-sm leading-5 text-muted-foreground">
            {description}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  )
}

function CatalogCard({
  description,
  icon,
  onPress,
  title,
}: {
  description: string
  icon: DesignSystemPattern["icon"]
  onPress: () => void
  title: string
}) {
  return (
    <Pressable
      className="gap-3 rounded-2xl px-1 py-4 active:bg-accent"
      haptic
      onPress={onPress}
      transition
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-start gap-3">
          <View className="size-10 items-center justify-center rounded-full bg-primary/10">
            <Icon className="size-sm text-primary" name={icon} />
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <Text className="font-extrabold text-foreground">{title}</Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              {description}
            </Text>
          </View>
        </View>
        <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
      </View>
    </Pressable>
  )
}

function ProductionGuardNotice() {
  const appVariant = getAppVariant()
  const isEnabled = isDesignSystemPlaygroundEnabled()

  return (
    <StatusBanner
      icon={isEnabled ? "ShieldCheck" : "Lock"}
      message={
        isEnabled
          ? `Visible in ${appVariant} mode for design review and QA.`
          : "Hidden from production builds until explicitly enabled for internal review."
      }
      title="Production visibility guard"
      tone={isEnabled ? "success" : "warning"}
    />
  )
}

function BrandAndReferenceFoundation() {
  const referenceModal = useModal()
  const [selectedReference, setSelectedReference] =
    useState<DesignReferencePreview>(
      designReferenceImageExamples[0] ?? dribbbleDesignReference,
    )

  function openReference(referenceId: string) {
    const reference =
      designReferencePreviewExamples.find((item) => item.id === referenceId) ??
      dribbbleDesignReference

    setSelectedReference(reference)
    referenceModal.present()
  }

  return (
    <>
      <Section
        description="The first approval pass now shows the source images and the exact mobile patterns we are adopting from them."
        title="Image-Led Foundation"
      >
        <ReferenceImageRail onReferencePress={openReference} />
        <EwaTradeReferenceHero onReferencePress={() => openReference("home-shell")} />
        <ReferenceOperationalSystem
          onReferencePress={() => openReference("operational-list")}
        />
        <ReferenceCommerceDetail onReferencePress={() => openReference("commerce")} />
      </Section>

      <Section
        description="Each reference is translated into a reusable mobile primitive or screen family."
        title="Reference Decisions"
      >
        <View className="gap-3">
          {designReferenceExamples.map((reference) => (
            <Pressable
              accessibilityLabel={`Open full design reference for ${reference.label}`}
              accessibilityRole="button"
              className="gap-3 rounded-[24px] bg-card p-4 active:bg-accent"
              key={reference.label}
              onPress={() => openReference(reference.id)}
              transition
            >
              <View className="flex-row items-center gap-3">
                <View className="size-10 items-center justify-center rounded-full bg-primary/10">
                  <Icon className="size-sm text-primary" name="Eye" />
                </View>
                <View className="min-w-0 flex-1 gap-1">
                  <Text className="font-extrabold">{reference.label}</Text>
                  <Text className="text-xs font-bold uppercase tracking-[1px] text-primary">
                    {reference.sourceLabel}
                  </Text>
                </View>
                <Icon
                  className="size-sm text-muted-foreground"
                  name="ChevronRight"
                />
              </View>
              <View className="gap-2">
                <Text className="text-sm leading-5 text-muted-foreground">
                  {reference.detail}
                </Text>
                <Text className="text-sm font-bold leading-5 text-foreground">
                  Adopted: {reference.adoption}
                </Text>
                <Text className="text-xs font-bold uppercase tracking-[1px] text-muted-foreground">
                  Open full design reference
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </Section>

      <ReferencePreviewModal
        modal={referenceModal}
        reference={selectedReference}
      />
    </>
  )
}

function ReferenceImageRail({
  onReferencePress,
}: {
  onReferencePress: (referenceId: string) => void
}) {
  return (
    <ScrollView
      className="-mx-6"
      contentContainerClassName="gap-3 px-6"
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {designReferenceImageExamples.map((reference) => (
        <Pressable
          accessibilityLabel={`Open full design reference for ${reference.label}`}
          accessibilityRole="button"
          className="w-52 gap-3 active:opacity-90"
          key={reference.label}
          onPress={() => onReferencePress(reference.id)}
          transition
        >
          <View className="h-72 overflow-hidden rounded-[28px] bg-muted">
            <Image
              accessibilityLabel={`${reference.label} ${reference.title}`}
              className="h-full w-full"
              resizeMode="cover"
              source={reference.source}
            />
          </View>
          <View className="gap-1">
            <Text className="text-xs font-bold uppercase tracking-[1px] text-primary">
              {reference.label} / {reference.adoption}
            </Text>
            <Text className="text-sm font-extrabold leading-5 text-foreground">
              {reference.title}
            </Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  )
}

function ReferencePreviewModal({
  modal,
  reference,
}: {
  modal: ReturnType<typeof useModal>
  reference: DesignReferencePreview
}) {
  return (
    <Modal
      ref={modal.ref}
      snapPoints={["92%"]}
      title={reference.label}
    >
      <BottomSheetKeyboardAwareScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-5 px-5 pb-8">
          {reference.source ? (
            <View className="overflow-hidden rounded-[28px] bg-muted">
              <Image
                accessibilityLabel={`Full design reference for ${reference.label}`}
                className={cn("w-full", reference.fullImageClassName)}
                resizeMode="contain"
                source={reference.source}
              />
            </View>
          ) : (
            <View className="gap-4 rounded-[28px] bg-muted/70 p-5">
              <View className="size-12 items-center justify-center rounded-full bg-primary/10">
                <Icon className="size-base text-primary" name="Globe" />
              </View>
              <View className="gap-2">
                <Text className="text-xl font-extrabold text-foreground">
                  External design source
                </Text>
                <Text className="text-sm leading-5 text-muted-foreground">
                  This reference is tracked by source URL and adoption notes.
                  Bundle a screenshot here when the final Dribbble image is
                  approved for local review.
                </Text>
              </View>
            </View>
          )}

          <View className="gap-3">
            <Text className="text-xs font-bold uppercase tracking-[1px] text-primary">
              {reference.sourceLabel}
            </Text>
            <Text className="text-2xl font-extrabold leading-8 text-foreground">
              {reference.title}
            </Text>
            <Text className="text-sm leading-5 text-muted-foreground">
              {reference.detail}
            </Text>
            <View className="rounded-[24px] bg-primary/10 p-4">
              <Text className="text-sm font-bold leading-5 text-primary">
                Adopted into EwaTrade: {reference.adoption}
              </Text>
            </View>
          </View>

          <ActionButton icon="CheckCircle2" onPress={modal.dismiss}>
            Close reference
          </ActionButton>
        </View>
      </BottomSheetKeyboardAwareScrollView>
    </Modal>
  )
}

function EwaTradeReferenceHero({
  onReferencePress,
}: {
  onReferencePress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel="Open full design reference for home shell"
      accessibilityRole="button"
      className="overflow-hidden rounded-[32px] bg-card active:opacity-95"
      onPress={onReferencePress}
      transition
    >
      <View className="gap-5 bg-primary px-5 pb-6 pt-5">
        <View className="flex-row items-center justify-between gap-4">
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-xs font-bold uppercase tracking-[1px] text-primary-foreground/70">
              EwaTrade base
            </Text>
            <Text className="text-2xl font-extrabold leading-8 text-primary-foreground">
              Rabi Feed Store
            </Text>
          </View>
          <View className="size-12 items-center justify-center rounded-full bg-primary-foreground/15">
            <Image
              accessibilityLabel="EwaTrade splash logo"
              className="size-8"
              resizeMode="contain"
              source={brandAssetExamples[0].source}
            />
          </View>
        </View>

        <View className="h-12 flex-row items-center gap-3 rounded-full bg-background px-4">
          <Icon className="size-sm text-muted-foreground" name="Search" />
          <Text className="text-sm font-semibold text-muted-foreground">
            Search products, sales, customers
          </Text>
        </View>

        <View className="flex-row items-center gap-4 rounded-[28px] bg-primary-foreground/12 p-4">
          <View className="min-w-0 flex-1 gap-2">
            <Text className="text-xs font-bold uppercase tracking-[1px] text-primary-foreground/70">
              Today
            </Text>
            <Text className="text-3xl font-extrabold leading-9 text-primary-foreground">
              NGN 284k
            </Text>
            <Text className="text-sm leading-5 text-primary-foreground/80">
              Sales, stock, and staff status in one compact hero.
            </Text>
          </View>
          <View className="size-20 items-center justify-center rounded-[26px] bg-primary-foreground">
            <Icon className="size-2xl text-primary" name="BarChart3" />
          </View>
        </View>
      </View>

      <View className="gap-5 p-5">
        <View className="flex-row gap-3">
          <ReferenceCategoryCard icon="Receipt" label="Sale" />
          <ReferenceCategoryCard icon="Warehouse" label="Stock" />
          <ReferenceCategoryCard icon="Users" label="Staff" />
        </View>
        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="font-extrabold text-foreground">
              Popular products
            </Text>
            <Text className="text-xs font-bold text-primary">View all</Text>
          </View>
          <View className="flex-row gap-3">
            {commerceAssetExamples.map((asset) => (
              <View className="min-w-0 flex-1 gap-2" key={asset.label}>
                <View className="h-24 overflow-hidden rounded-2xl bg-muted">
                  <Image
                    accessibilityLabel={asset.label}
                    className="h-full w-full"
                    resizeMode="cover"
                    source={asset.source}
                  />
                </View>
                <Text
                  className="text-xs font-bold text-foreground"
                  numberOfLines={1}
                >
                  {asset.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
        <ReferenceFloatingNav />
      </View>
    </Pressable>
  )
}

function ReferenceCategoryCard({
  icon,
  label,
}: {
  icon: "Receipt" | "Users" | "Warehouse"
  label: string
}) {
  return (
    <View className="min-h-20 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl bg-muted/70 px-2 py-3">
      <View className="size-9 items-center justify-center rounded-full bg-background">
        <Icon className="size-sm text-primary" name={icon} />
      </View>
      <Text className="text-center text-xs font-bold text-foreground">
        {label}
      </Text>
    </View>
  )
}

function ReferenceFloatingNav() {
  return (
    <View className="min-h-16 flex-row items-center gap-2 rounded-full bg-primary px-3 py-2">
      <ReferenceNavItem active icon="House" label="Home" />
      <ReferenceNavItem icon="Warehouse" label="Stock" />
      <View className="size-12 items-center justify-center rounded-full bg-background">
        <Icon className="size-base text-primary" name="Plus" />
      </View>
      <ReferenceNavItem icon="BarChart3" label="Report" />
      <ReferenceNavItem icon="Settings" label="More" />
    </View>
  )
}

function ReferenceNavItem({
  active,
  icon,
  label,
}: {
  active?: boolean
  icon: "BarChart3" | "House" | "Settings" | "Warehouse"
  label: string
}) {
  return (
    <View
      className={cn(
        "flex-1 items-center justify-center gap-1 rounded-full py-2",
        active && "bg-primary-foreground/15",
      )}
    >
      <Icon
        className={cn(
          "size-sm",
          active ? "text-primary-foreground" : "text-primary-foreground/65",
        )}
        name={icon}
      />
      <Text
        className={cn(
          "text-[10px] font-bold",
          active ? "text-primary-foreground" : "text-primary-foreground/65",
        )}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  )
}

function ReferenceOperationalSystem({
  onReferencePress,
}: {
  onReferencePress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel="Open full design reference for operational flow"
      accessibilityRole="button"
      className="gap-4 rounded-[32px] bg-card p-5 active:opacity-95"
      onPress={onReferencePress}
      transition
    >
      <View className="flex-row items-center justify-between gap-4">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-xs font-bold uppercase tracking-[1px] text-primary">
            Pins 4/5 adoption
          </Text>
          <Text className="text-xl font-extrabold text-foreground">
            Operational list rhythm
          </Text>
        </View>
        <View className="size-11 items-center justify-center rounded-full bg-foreground">
          <Icon className="size-base text-background" name="SlidersHorizontal" />
        </View>
      </View>

      <View className="h-11 flex-row items-center gap-3 rounded-full bg-muted px-4">
        <Icon className="size-sm text-muted-foreground" name="Search" />
        <Text className="text-sm font-semibold text-muted-foreground">
          Search sales, movements, links
        </Text>
      </View>

      <View className="flex-row gap-2">
        {["All", "Pending", "Synced", "Conflict"].map((label, index) => (
          <View
            className={cn(
              "rounded-full px-4 py-2",
              index === 0 ? "bg-foreground" : "bg-muted",
            )}
            key={label}
          >
            <Text
              className={cn(
                "text-xs font-bold",
                index === 0 ? "text-background" : "text-muted-foreground",
              )}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>

      <View className="gap-3">
        <ReferenceTimelineCard
          destination="Counter sale"
          icon="Receipt"
          meta="NGN 48,000"
          origin="Rabbit feed"
          status="Synced"
          title="Sale 1024"
          tone="success"
        />
        <ReferenceTimelineCard
          destination="Manager review"
          icon="Warehouse"
          meta="+42 bags"
          origin="Supplier intake"
          status="Pending"
          title="Stock movement"
          tone="warning"
        />
      </View>

      <View className="gap-4 rounded-[28px] bg-muted/70 p-5">
        <View className="h-1 w-12 self-center rounded-full bg-muted-foreground/30" />
        <View className="flex-row items-start justify-between gap-4">
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-xs font-bold uppercase tracking-[1px] text-muted-foreground">
              Detail sheet
            </Text>
            <Text className="text-2xl font-extrabold text-foreground">
              Order 1024
            </Text>
          </View>
          <StatusBadge label="Transit" tone="primary" />
        </View>
        <ReferenceProgressLine />
        <View className="flex-row gap-4">
          <ReferenceDetailStat label="From" value="Storefront" />
          <ReferenceDetailStat label="To" value="Dispatch" />
        </View>
        <View className="flex-row items-center gap-3 rounded-full bg-background p-2">
          <View className="size-10 items-center justify-center rounded-full bg-primary/10">
            <Icon className="size-sm text-primary" name="Phone" />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-bold text-foreground">
              Customer follow-up
            </Text>
            <Text className="text-xs text-muted-foreground">
              Call or message
            </Text>
          </View>
          <Icon className="size-sm text-muted-foreground" name="ChevronRight" />
        </View>
      </View>
    </Pressable>
  )
}

function ReferenceTimelineCard({
  destination,
  icon,
  meta,
  origin,
  status,
  title,
  tone,
}: {
  destination: string
  icon: "Receipt" | "Warehouse"
  meta: string
  origin: string
  status: string
  title: string
  tone: "success" | "warning"
}) {
  return (
    <View className="gap-3 rounded-[24px] bg-muted/70 p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-center gap-3">
          <View className="size-11 items-center justify-center rounded-2xl bg-background">
            <Icon className="size-base text-primary" name={icon} />
          </View>
          <View className="min-w-0 flex-1">
            <Text className="font-extrabold text-foreground">{title}</Text>
            <Text className="text-xs font-bold text-muted-foreground">
              {meta}
            </Text>
          </View>
        </View>
        <StatusBadge label={status} tone={tone} />
      </View>
      <ReferenceProgressLine />
      <View className="flex-row gap-4">
        <ReferenceDetailStat label="Start" value={origin} />
        <ReferenceDetailStat label="Next" value={destination} />
      </View>
    </View>
  )
}

function ReferenceProgressLine() {
  return (
    <View className="flex-row items-center gap-2">
      <View className="size-3 rounded-full bg-primary" />
      <View className="h-0.5 flex-1 rounded-full bg-primary/40" />
      <View className="size-3 rounded-full bg-primary/70" />
      <View className="h-0.5 flex-1 rounded-full bg-muted-foreground/30" />
      <View className="size-3 rounded-full bg-muted-foreground/40" />
    </View>
  )
}

function ReferenceDetailStat({
  inverted,
  label,
  value,
}: {
  inverted?: boolean
  label: string
  value: string
}) {
  return (
    <View className="min-w-0 flex-1 gap-1">
      <Text
        className={cn(
          "text-xs font-bold uppercase tracking-[1px]",
          inverted ? "text-primary-foreground/65" : "text-muted-foreground",
        )}
      >
        {label}
      </Text>
      <Text
        className={cn(
          "text-sm font-extrabold",
          inverted ? "text-primary-foreground" : "text-foreground",
        )}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  )
}

function ReferenceCommerceDetail({
  onReferencePress,
}: {
  onReferencePress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel="Open full design reference for commerce detail"
      accessibilityRole="button"
      className="gap-4 rounded-[32px] bg-card p-5 active:opacity-95"
      onPress={onReferencePress}
      transition
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-bold uppercase tracking-[1px] text-primary">
          Pin 3 adoption
        </Text>
        <Icon className="size-sm text-muted-foreground" name="Eye" />
      </View>
      <View className="h-44 overflow-hidden rounded-[28px] bg-muted">
        <Image
          accessibilityLabel="Product media treatment"
          className="h-full w-full"
          resizeMode="cover"
          source={commerceAssetExamples[0].source}
        />
      </View>
      <View className="gap-2">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-sm text-muted-foreground">Product detail</Text>
            <Text className="text-2xl font-extrabold text-foreground">
              Premium feed bundle
            </Text>
          </View>
          <StatusBadge label="In stock" tone="success" />
        </View>
        <Text className="text-sm leading-5 text-muted-foreground">
          Product pages use a media-first top, compact details, variant pills,
          and a sticky purchase/share action.
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {["Full bag", "Half bag", "Quarter"].map((label, index) => (
          <View
            className={cn(
              "rounded-full px-4 py-2",
              index === 0 ? "bg-primary" : "bg-muted",
            )}
            key={label}
          >
            <Text
              className={cn(
                "text-xs font-bold",
                index === 0 ? "text-primary-foreground" : "text-foreground",
              )}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>
      <View className="flex-row items-center gap-4 rounded-full bg-primary p-2 pl-5">
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-bold uppercase tracking-[1px] text-primary-foreground/65">
            Total
          </Text>
          <Text className="text-lg font-extrabold text-primary-foreground">
            NGN 48,000
          </Text>
        </View>
        <View className="min-h-12 flex-row items-center gap-2 rounded-full bg-primary-foreground px-5">
          <Icon className="size-sm text-primary" name="Share" />
          <Text className="font-extrabold text-primary">
            Share link
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

function PlaygroundThemeControl() {
  const { colorScheme, setColorScheme } = useColorScheme()
  const isDark = colorScheme === "dark"

  async function handleThemeChange(checked: boolean) {
    const nextTheme = checked ? "dark" : "light"

    setColorScheme(nextTheme)
    await setThemeOverride(nextTheme)
  }

  return (
    <View variant="card" className="gap-4 p-4">
      <View className="gap-1">
        <Text className="font-extrabold text-foreground">
          Light / dark review
        </Text>
        <Text className="text-sm leading-5 text-muted-foreground">
          Toggle the playground theme without covering catalog content.
        </Text>
      </View>
      <View className="flex-row rounded-full bg-muted p-1">
        <ThemeModeOption
          active={!isDark}
          icon="Eye"
          label="Light"
          onPress={() => handleThemeChange(false)}
        />
        <ThemeModeOption
          active={isDark}
          icon="EyeOff"
          label="Dark"
          onPress={() => handleThemeChange(true)}
        />
      </View>
    </View>
  )
}

function ThemeModeOption({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean
  icon: "Eye" | "EyeOff"
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      className={cn(
        "h-10 flex-1 flex-row items-center justify-center gap-2 rounded-full",
        active ? "bg-background" : "bg-transparent",
      )}
      haptic
      onPress={onPress}
      transition
    >
      <Icon
        className={cn(
          "size-sm",
          active ? "text-primary" : "text-muted-foreground",
        )}
        name={icon}
      />
      <Text
        className={cn(
          "text-sm font-bold",
          active ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  )
}

function ModalAndSheetExamples() {
  const formSheet = useModal()
  const actionSheet = useModal()

  return (
    <Section
      description="Interactive checks for confirmation modals, destructive modals, keyboard-aware sheets, and action sheets."
      title="Modals/Sheets"
    >
      <View className="gap-3">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <ActionButton icon="CheckCircle2" variant="outline">
              Open confirmation modal
            </ActionButton>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Approve this visual system?</AlertDialogTitle>
              <AlertDialogDescription>
                This neutral confirmation shows the standard modal spacing,
                text hierarchy, and two-action footer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                <Text>Keep reviewing</Text>
              </AlertDialogCancel>
              <AlertDialogAction>
                <Text>Looks good</Text>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <ActionButton icon="Trash" variant="destructive">
              Destructive confirmation
            </ActionButton>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Deactivate generated link?</AlertDialogTitle>
              <AlertDialogDescription>
                This careful destructive confirmation should stand apart without
                relying on color alone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                <Text>Cancel</Text>
              </AlertDialogCancel>
              <AlertDialogAction className="bg-destructive">
                <Text>Deactivate</Text>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <View className="flex-row gap-3">
          <ShareLinkActionButton
            icon="FilePenLine"
            label="Keyboard-aware sheet"
            onPress={formSheet.present}
          />
          <ShareLinkActionButton
            icon="SlidersHorizontal"
            label="Action sheet"
            onPress={actionSheet.present}
          />
        </View>
      </View>

      <Modal ref={formSheet.ref} snapPoints={["78%"]} title="Keyboard-aware sheet">
        <BottomSheetKeyboardAwareScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-5 px-5 pb-8">
            <SecondarySheetHeader
              description="Fields stay reachable while the keyboard is open."
              icon="FilePenLine"
              title="Stock intake form"
            />
            <FormField
              helper="Prompt copy, no fake samples."
              label="Product name"
              leadingIcon="Warehouse"
              placeholder="Enter product name"
              value="Premium rabbit feed"
            />
            <QuantityStepper
              helper="Whole-number inventory input"
              onChangeText={() => {}}
              value="24"
            />
            <ActionButton icon="CheckCircle2" onPress={formSheet.dismiss}>
              Save sheet example
            </ActionButton>
          </View>
        </BottomSheetKeyboardAwareScrollView>
      </Modal>

      <Modal ref={actionSheet.ref} snapPoints={["48%"]} title="Action sheet">
        <View className="gap-4 px-5 pb-8">
          <SecondarySheetHeader
            description="Compact action sheets use haptic rows and semantic tones."
            icon="SlidersHorizontal"
            title="Generated link actions"
          />
          <ShareLinkActionButton
            icon="Share"
            label="Share"
            onPress={actionSheet.dismiss}
          />
          <ShareLinkActionButton
            icon="Trash"
            label="Deactivate"
            destructive
            onPress={actionSheet.dismiss}
          />
        </View>
      </Modal>
    </Section>
  )
}

function TokensAndTypography() {
  return (
    <>
      <Section
        description="Semantic color tokens should carry the UI before any custom color is considered."
        title="Tokens"
      >
        <View className="flex-row flex-wrap gap-3">
          {tokenExamples.map((token) => (
            <View className="w-[47%] gap-2" key={token.label}>
              <View
                className={cn(
                  "h-14 rounded-2xl",
                  token.className,
                )}
              />
              <Text className="text-xs font-bold uppercase tracking-[1px] text-muted-foreground">
                {token.label}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      <Section
        description="Review text scale, density, helper copy, and large operational totals."
        title="Typography"
      >
        <View className="gap-3">
          <Text className="text-[34px] font-bold leading-[39px] text-foreground">
            Dashboard
          </Text>
          <Text className="text-4xl font-extrabold leading-[44px] text-foreground">
            NGN 284,000
          </Text>
          <Text className="text-base leading-6 text-muted-foreground">
            Primary body copy should be readable in light and dark mode without
            turning the app into a marketing page.
          </Text>
          <Text className="text-xs font-bold uppercase tracking-[1px] text-muted-foreground">
            Section label
          </Text>
          <Text className="text-xs font-medium text-destructive">
            Error text remains direct and actionable.
          </Text>
        </View>
      </Section>
    </>
  )
}

function HeaderActionsAndForms() {
  const [checked, setChecked] = useState(true)
  const [quantity, setQuantity] = useState("3")
  const [otp, setOtp] = useState("248")

  return (
    <>
      <Section
        description="Auth, dashboard, sheet, and detail headers keep one visual rhythm."
        title="Headers"
      >
        <View className="gap-5">
          <AuthHeader
            badge="Design system"
            icon="Wallet"
            subtitle="A focused approval surface for the mobile component system."
            title="Mobile Design System"
          />
          <SecondarySheetHeader
            description="A compact sheet header for operational flows."
            icon="Warehouse"
            title="Inventory sheet header"
          />
          <SessionSectionHeader icon="Receipt" title="Detail section header" />
        </View>
      </Section>

      <Section
        description="Buttons and icon buttons show loading, destructive, secondary, selected, and disabled states."
        title="Actions"
      >
        <View className="gap-3">
          <ActionButton icon="Plus">Primary action</ActionButton>
          <ActionButton icon="Clock" isLoading loadingLabel="Saving state">
            Loading action
          </ActionButton>
          <ActionButton icon="Settings" variant="outline">
            Secondary action
          </ActionButton>
          <ActionButton disabled icon="CheckCircle2">
            Disabled action
          </ActionButton>
          <View className="flex-row gap-3">
            <ShareLinkActionButton icon="Share" label="Share" onPress={() => {}} />
            <ShareLinkActionButton
              destructive
              icon="Trash"
              label="Delete"
              onPress={() => {}}
            />
          </View>
        </View>
      </Section>

      <Section
        description="Form examples use shared fields, semantic focus/error states, and keyboard-ready controls."
        title="Forms"
      >
        <View className="gap-4">
          <FormField
            helper="Uses standard helper copy and semantic tokens."
            label="Business name"
            leadingIcon="Building2"
            placeholder="Enter business name"
            value="Rabi Feed Store"
          />
          <FormField
            error="Use a valid email address."
            label="Email address"
            leadingIcon="Mail"
            placeholder="Enter email address"
            value="owner@"
          />
          <FormField
            label="Search catalog"
            leadingIcon="Search"
            placeholder="Search products, customers, links"
            value=""
          />
          <OtpInput onChange={setOtp} value={otp} />
          <QuantityStepper onChangeText={setQuantity} value={quantity} />
          <View className="flex-row items-center justify-between gap-3 py-4">
            <View className="min-w-0 flex-1 gap-1">
              <Text className="font-extrabold text-foreground">
                Offline toggle
              </Text>
              <Text className="text-sm leading-5 text-muted-foreground">
                Binary settings should use switches, not text buttons.
              </Text>
            </View>
            <Switch checked={checked} onCheckedChange={setChecked} />
          </View>
          <View className="flex-row gap-3">
            <SaleSegmentOption
              icon="Wallet"
              label="Cash"
              onPress={() => {}}
              selected
            />
            <SaleSegmentOption
              icon="CreditCard"
              label="Transfer"
              onPress={() => {}}
              selected={false}
            />
          </View>
        </View>
      </Section>
    </>
  )
}

function StatusAndLists() {
  return (
    <>
      <Section
        description="State meaning must be visible through text, icons, and semantic tone."
        title="Status"
      >
        <View className="flex-row flex-wrap gap-2">
          {PLAYGROUND_STATUS_EXAMPLES.map((item) => (
            <StatusBadge
              icon={item.icon}
              key={item.label}
              label={item.label}
              tone={item.tone}
            />
          ))}
        </View>
        <StatusBanner
          actionLabel="Review sync"
          icon="TriangleAlert"
          message="Two records need manager review before they can be marked synced."
          onActionPress={() => {}}
          title="Conflict review"
          tone="warning"
        />
        <EmptyState
          icon="Info"
          message="New stores should see a calm first-use state with a direct next action."
          title="Nothing to show"
        />
      </Section>

      <Section
        description="Divider-based rows keep dense Retail Ops information readable."
        title="Lists"
      >
        <View>
          <InventoryProductCard
            icon="Warehouse"
            priceLabel="NGN 24,000"
            selected
            stockLabel="Low stock"
            stockTone="warning"
            subtitle="Primary unit: bag - 6 variants"
            title="Premium rabbit feed"
          />
          <SaleSelectableRow
            meta="Available: 42 bags"
            onPress={() => {}}
            selected
            title="Full bag"
            value="NGN 24,000"
          />
          <SecondaryOperationalRow
            detail="Cashier - invited today"
            icon="UserPlus"
            metadata="Pending invite"
            title="Amina Yusuf"
          >
            <StatusBadge label="Pending" tone="warning" />
          </SecondaryOperationalRow>
          <ShareLinkRecordRow
            detail="https://ewa.trade/p/rabbit-feed"
            meta="1,284 views - 18 orders"
            title="Rabbit feed campaign"
          >
            <View className="flex-row gap-2">
              <StatusBadge label="Active" tone="success" />
              <StatusBadge label="Shared" tone="primary" />
            </View>
          </ShareLinkRecordRow>
          <TimelineRow
            detail="Customer order notification queued for delivery."
            icon="Clock"
            title="Pending follow-up"
            tone="warning"
          />
        </View>
      </Section>
    </>
  )
}

function NavigationAndFooters() {
  const router = useRouter()

  return (
    <Section
      description="Review sticky bottom actions, two-action footers, passive helper copy, and drill-in pattern screens."
      title="Navigation/Footers"
    >
      <View className="gap-4">
        <View variant="card" className="gap-3 p-4">
          <Text className="font-extrabold text-foreground">
            Sticky bottom action
          </Text>
          <ActionButton icon="CheckCircle2">Approve selected style</ActionButton>
        </View>
        <View className="flex-row gap-3">
          <ActionButton className="flex-1" icon="ArrowLeft" variant="outline">
            Back
          </ActionButton>
          <ActionButton className="flex-1" trailingIcon="ArrowRight">
            Next
          </ActionButton>
        </View>
        <Text className="text-center text-xs leading-5 text-muted-foreground">
          Passive footer text explains a boundary without becoming a visible
          instruction block inside production workflows.
        </Text>
        <View className="gap-1">
          {DESIGN_SYSTEM_PATTERNS.map((pattern) => (
            <CatalogCard
              description={pattern.description}
              icon={pattern.icon}
              key={pattern.id}
              onPress={() =>
                router.push({
                  pathname: "/design-system-pattern",
                  params: { pattern: pattern.id },
                })
              }
              title={pattern.title}
            />
          ))}
        </View>
      </View>
    </Section>
  )
}

function AnalyticsExamples() {
  return (
    <Section
      description="Mobile reports stay compact, theme-aware, and operational."
      title="Analytics"
    >
      <View className="flex-row flex-wrap gap-x-4">
        {PLAYGROUND_METRICS.map((metric) => (
          <DashboardMetricCard
            detail={metric.detail}
            key={metric.label}
            label={metric.label}
            tone={metric.tone}
            value={metric.value}
          />
        ))}
      </View>
      <View className="flex-row gap-3">
        <ShareLinkOptionPill
          icon="Calendar"
          label="Today"
          onPress={() => {}}
          selected
        />
        <ShareLinkOptionPill
          icon="SlidersHorizontal"
          label="By store"
          onPress={() => {}}
        />
      </View>
      <MobileAnalyticsBarChart data={PLAYGROUND_CHART_DATA} />
      <View className="gap-3">
        <MobileAnalyticsBarChart data={PLAYGROUND_CHART_DATA} state="loading" />
        <MobileAnalyticsBarChart data={[]} state="empty" />
        <MobileAnalyticsBarChart data={[]} state="error" />
      </View>
      <View className="flex-row gap-4">
        <ReportMetricTile
          label="Share views"
          tone="success"
          value={PLAYGROUND_SAMPLE_TOTALS.shareLinkViews}
        />
        <ReportMetricTile
          label="Sync conflicts"
          tone="warning"
          value={PLAYGROUND_SAMPLE_TOTALS.syncConflicts}
        />
      </View>
      <ReportSection
        empty="No report rows yet."
        rows={reportRows}
        title="Report rows"
      />
    </Section>
  )
}

function RetailOpsPatterns() {
  const [syncActive, setSyncActive] = useState(false)

  return (
    <Section
      description="Domain-specific primitives prove the system can carry real Retail Ops workflows."
      title="Retail Ops Patterns"
    >
      <View className="gap-5">
        <DashboardPanel
          description="Owner dashboard panel with bounded preview content."
          icon="LayoutDashboard"
          title="Dashboard panel"
          tone="primary"
        >
          <View className="flex-row gap-4">
            <DashboardStatTile label="Open sessions" tone="success" value="4" />
            <DashboardStatTile label="Low stock" tone="warning" value="6" />
          </View>
          <DashboardRecordRow
            detail="Cash sale - synced"
            icon="Receipt"
            metadata="NGN 18,000"
            title="Order 1024"
          />
        </DashboardPanel>

        <View className="flex-row gap-3">
          <DashboardQuickAction
            description="Fast POS entry"
            icon="Plus"
            label="Sale"
          />
          <DashboardQuickAction
            description="Restock units"
            icon="Warehouse"
            label="Stock"
          />
        </View>

        <SetupFlowHeader
          badgeIcon="Warehouse"
          badgeLabel="Inventory setup"
          currentStep={1}
          description="Setup flows stay staged, flat, and keyboard-safe."
          steps={["Details", "Stock"]}
          title="First product setup"
        />
        <SetupSection title="Unit template">
          <View className="flex-row flex-wrap gap-2">
            <SetupChoicePill onPress={() => {}} selected>
              Full bag
            </SetupChoicePill>
            <SetupChoicePill onPress={() => {}}>Half bag</SetupChoicePill>
            <SetupChoicePill onPress={() => {}}>Quarter bag</SetupChoicePill>
          </View>
          <SetupInlineNotice
            icon="Info"
            text="Starting stock creates the first inventory movement."
            tone="primary"
          />
          <SetupSummaryRow label="Starting stock" value="42 bags" />
        </SetupSection>

        <View>
          <InventorySegmentOption
            label="Stock intake"
            onPress={() => {}}
            selected
          />
          <InventoryUnitOption
            label="Half bag"
            onPress={() => {}}
            selected
            stockLabel="21 available"
            stockTone="success"
          />
          <InventoryMovementRow
            detail="Received from supplier"
            quantityLabel="+42"
            quantityTone="success"
            statusLabel="Posted"
            statusTone="success"
            title="Stock movement"
          />
        </View>

        <SaleTotalSummary
          helper="Cash payment"
          label="Sale total"
          value="NGN 48,000"
        />

        <SessionSourcePanel
          detail="Local device has no pending session changes."
          label="Synced"
          title="Session source"
          tone="success"
        />
        <View className="flex-row gap-4">
          <SessionStatTile label="Cash" value="NGN 168,000" />
          <SessionStatTile label="Variance" tone="warning" value="NGN 2,000" />
        </View>
        <SessionVarianceRow
          label="Closing stock variance"
          tone="warning"
          value="-2 bags"
        />

        <ShareLinkPanel
          description="Generated links, views, orders, and follow-up share one compact language."
          icon="Share"
          title="Share link analytics"
        >
          <View className="flex-row gap-4">
            <ShareLinkMetricTile icon="Eye" label="Views" value="1,284" />
            <ShareLinkMetricTile icon="Receipt" label="Orders" value="18" />
          </View>
        </ShareLinkPanel>

        <SyncReliabilityPanel
          description="Server conflict state is visible without blocking sales."
          icon="Activity"
          statusIcon="TriangleAlert"
          statusLabel="Conflict"
          statusTone="warning"
          title="Sync reliability"
        >
          <View className="flex-row gap-4">
            <SyncReliabilityStat label="Queued" tone="warning" value="3" />
            <SyncReliabilityStat label="Synced" tone="success" value="128" />
          </View>
          <SyncReliabilityToggle
            active={syncActive}
            description="Use this to review offline toggle treatment."
            label="Simulate offline mode"
            onPress={() => setSyncActive((value) => !value)}
          />
          <SyncReliabilityRow
            detail="Order 1024 needs inventory review"
            statusIcon="Clock"
            statusLabel="Pending"
            statusTone="warning"
            title="Dependency blocked"
          >
            <View className="flex-row gap-2">
              <SyncReliabilityAction icon="Clock" label="Retry" />
              <SyncReliabilityAction icon="Eye" label="Review" tone="muted" />
            </View>
          </SyncReliabilityRow>
        </SyncReliabilityPanel>
      </View>
    </Section>
  )
}

function ModelReviewAndApprovalGate() {
  return (
    <Section
      description="Model critique is advisory. Project-owner approval remains the release gate."
      title="Model Review And Approval"
    >
      <View className="gap-3">
        <StatusBanner
          icon="Globe"
          message="Gemini CLI is available locally and should review screenshots or a walkthrough before approval."
          title="Gemini advisory review"
          tone="primary"
        />
        <StatusBanner
          icon="Search"
          message="Gravity was not found on PATH during planning; implementation QA should document the discovery result or capture critique when available."
          title="Gravity discovery"
          tone="warning"
        />
        <StatusBanner
          icon="ShieldCheck"
          message="Existing mobile screens remain out of scope until this playground is explicitly approved."
          title="Approval gate"
          tone="success"
        />
      </View>
    </Section>
  )
}

export function DesignSystemPlaygroundScreen() {
  const router = useRouter()

  if (!isDesignSystemPlaygroundEnabled()) {
    return (
      <MobileScreen contentClassName="gap-4" keyboardBottomOffset={132} scroll>
        <AuthHeader
          badge="Internal"
          icon="Lock"
          subtitle="This approval surface is hidden from production customer workflows."
          title="Mobile Design System"
        />
        <ProductionGuardNotice />
      </MobileScreen>
    )
  }

  return (
    <MobileScreen
      contentClassName="gap-2"
      keyboardBottomOffset={132}
      scroll
    >
      <View className="gap-4" testID="design-system-playground">
        <AuthHeader
          badge="Internal"
          icon="SlidersHorizontal"
          subtitle="Approve the mobile component system before existing screens are refactored."
          title="Mobile Design System"
        />
        <ProductionGuardNotice />
        <PlaygroundThemeControl />
        <BrandAndReferenceFoundation />

        <Section
          description="Catalog sections map directly to the approved Wayfinder spec."
          title="Catalog"
        >
          <View>
            {DESIGN_SYSTEM_CATALOG_SECTIONS.map((section) => (
              <CatalogCard
                description={section.description}
                icon={section.icon}
                key={section.id}
                onPress={() =>
                  router.push({
                    pathname: "/design-system-pattern",
                    params: { pattern: patternForSection(section.id) },
                  })
                }
                title={section.title}
              />
            ))}
          </View>
        </Section>

        <TokensAndTypography />
        <HeaderActionsAndForms />
        <StatusAndLists />
        <ModalAndSheetExamples />
        <NavigationAndFooters />
        <AnalyticsExamples />
        <RetailOpsPatterns />
        <ModelReviewAndApprovalGate />
      </View>
    </MobileScreen>
  )
}

function PatternHeader({ pattern }: { pattern: DesignSystemPattern }) {
  return (
    <View className="gap-4" testID="design-system-pattern-screen">
      <AuthHeader
        badge="Pattern"
        icon={pattern.icon}
        subtitle={pattern.description}
        title={pattern.title}
      />
      <StatusBanner
        icon="Info"
        message="This drill-in screen gives the project owner a focused review path beyond the catalog home."
        title="Pattern preview"
        tone="primary"
      />
    </View>
  )
}

export function DesignSystemPatternScreen({
  patternId,
}: {
  patternId?: string | string[]
}) {
  const id = Array.isArray(patternId) ? patternId[0] : patternId
  const pattern = useMemo(
    () =>
      DESIGN_SYSTEM_PATTERNS.find((item) => item.id === id) ??
      DESIGN_SYSTEM_PATTERNS[0],
    [id],
  )
  const resolvedPatternId = pattern.id as DesignSystemPatternId

  return (
    <MobileScreen contentClassName="gap-5" keyboardBottomOffset={132} scroll>
      <PatternHeader pattern={pattern} />

      {resolvedPatternId === "headers" ? (
        <HeaderActionsAndForms />
      ) : resolvedPatternId === "detail" ? (
        <View className="gap-5">
          <StatusAndLists />
          <ModalAndSheetExamples />
        </View>
      ) : resolvedPatternId === "retail-ops" ? (
        <RetailOpsPatterns />
      ) : resolvedPatternId === "analytics" ? (
        <AnalyticsExamples />
      ) : (
        <View className="gap-5">
          <StatusAndLists />
          <NavigationAndFooters />
        </View>
      )}

      <Section
        description="This bottom area previews an approval footer without turning it into production instructions."
        title="Approval Footer"
      >
        <ActionButton icon="CheckCircle2">Mark pattern reviewed</ActionButton>
      </Section>
    </MobileScreen>
  )
}

export function DesignSystemPlaygroundShellPreview() {
  return (
    <MobileAppShell
      businessName="Rabi Feed Store"
      centralAction={{
        icon: "Plus",
        label: "Sale",
        onPress: () => {},
      }}
      navItems={[
        {
          icon: "LayoutDashboard",
          isActive: true,
          label: "Home",
          onPress: () => {},
        },
        {
          icon: "Warehouse",
          label: "Stock",
          onPress: () => {},
        },
        {
          icon: "BarChart3",
          label: "Reports",
          onPress: () => {},
        },
        {
          icon: "Settings",
          label: "Settings",
          onPress: () => {},
          ownerOnly: true,
        },
      ]}
      role="owner"
      syncBanner={
        <StatusBanner
          icon="CheckCircle2"
          message="All local events are synced."
          tone="success"
        />
      }
      title="Playground"
    >
      <DashboardPanel
        description="Floating shell preview for bottom navigation approval."
        icon="House"
        title="Shell preview"
      />
    </MobileAppShell>
  )
}
