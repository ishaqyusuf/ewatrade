import * as Classic from "@/components/mobile/appearances/classic/new-business"
import * as Market from "@/components/mobile/appearances/market-day/new-business"
import { CurrencySelector } from "@/components/mobile/currency-selector"
import { FormField } from "@/components/mobile/form-field"
import { Pressable } from "@/components/ui/pressable"
import { Text } from "@/components/ui/text"
import { useCurrentAddress } from "@/hooks/use-current-address"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import {
  BUSINESS_OPERATING_MODELS,
  BUSINESS_ORDER_CHANNELS,
  BUSINESS_TEAM_SIZES,
} from "@ewatrade/utils"
import {
  getCountry,
  toInternationalPhone,
  toLocalPhone,
} from "@ewatrade/utils/countries"
import { View } from "react-native"
import { CountrySelect } from "../country-select"
import { CurrentLocationCard } from "../current-location-card"
import { ListCard } from "../green-till/kit"
import { PhoneField } from "../phone-field"
import { newBusinessPhoneDialCode } from "./new-business-model"
import type { NewBusinessModel } from "./use-new-business"

type FieldsProps = { model: NewBusinessModel; market: boolean }

export function NewBusinessProfile({ model, market }: FieldsProps) {
  const { BusinessSection: Section, BusinessChoice: Choice } = market
    ? Market
    : Classic
  const { draft, updateDraft, locked } = model
  return (
    <View className="gap-7">
      <Section
        title="Selected business type"
        description={`${model.selectedProfile?.title ?? "Your selection"} suggestions will appear first when you add Products or Services.`}
      >
        {draft.businessProfileKey === "other-mixed-business" ? (
          <FormField
            variant={market ? "filled" : "auth"}
            label="What does this business do?"
            maxLength={240}
            value={draft.otherBusinessDescription}
            onChangeText={(otherBusinessDescription) =>
              updateDraft({ otherBusinessDescription })
            }
            placeholder="Describe the products or services"
            inputClassName={
              market ? "bg-market-field text-market-ink" : undefined
            }
          />
        ) : null}
      </Section>
      <Section title="What will you manage?">
        <View
          accessibilityRole="radiogroup"
          className="flex-row flex-wrap gap-2"
        >
          {BUSINESS_OPERATING_MODELS.map((item) => (
            <Choice
              key={item.key}
              label={item.label}
              selected={draft.operatingModel === item.key}
              disabled={locked}
              onPress={() => updateDraft({ operatingModel: item.key })}
            />
          ))}
        </View>
      </Section>
      <Section
        title="How do customers order?"
        description="Choose one or more channels."
      >
        <View className="flex-row flex-wrap gap-2">
          {BUSINESS_ORDER_CHANNELS.map((item) => (
            <Choice
              key={item.key}
              label={item.label}
              multiple
              selected={draft.orderChannels.includes(item.key)}
              disabled={locked}
              onPress={() => model.toggleChannel(item.key)}
            />
          ))}
        </View>
      </Section>
      <Section title="Team size">
        <View
          accessibilityRole="radiogroup"
          className="flex-row flex-wrap gap-2"
        >
          {BUSINESS_TEAM_SIZES.map((item) => (
            <Choice
              key={item.key}
              label={item.label}
              selected={draft.teamSize === item.key}
              disabled={locked}
              onPress={() => updateDraft({ teamSize: item.key })}
            />
          ))}
        </View>
      </Section>
    </View>
  )
}
export function NewBusinessDetails({ model, market }: FieldsProps) {
  const location = useCurrentAddress()
  const { BusinessSection: Section } = market ? Market : Classic
  const { draft, updateDraft, locked } = model
  const large = useLargeTextLayout()
  const inputClassName = market ? "bg-market-field text-market-ink" : undefined
  return (
    <Section title="Identity and location">
      <CountrySelect
        value={draft.countryCode ?? "NG"}
        disabled={locked}
        onChange={(countryCode) =>
          updateDraft({
            countryCode,
            // The phone follows the business country until it is changed.
            ...(draft.phoneCountryCode === draft.countryCode
              ? { phoneCountryCode: countryCode }
              : {}),
          })
        }
      />
      {!locked ? (
        <CurrentLocationCard
          address={location.address}
          error={location.error}
          status={location.status}
          onClear={location.clear}
          onLocate={() => {
            void location.locate().then((address) => {
              if (address)
                updateDraft({
                  addressLine1: address.addressLine1,
                  city: address.city,
                  countryCode: address.countryCode,
                })
            })
          }}
        />
      ) : null}
      <FormField
        variant={market ? "filled" : "auth"}
        label="Business name"
        leadingIcon="Building2"
        maxLength={120}
        value={draft.businessName}
        onChangeText={(businessName) => updateDraft({ businessName })}
        placeholder="Enter your business name"
        inputClassName={inputClassName}
      />
      <FormField
        variant={market ? "filled" : "auth"}
        label="Business address"
        leadingIcon="MapPin"
        maxLength={200}
        value={draft.addressLine1}
        onChangeText={(addressLine1) => updateDraft({ addressLine1 })}
        placeholder="Enter the street address"
        inputClassName={inputClassName}
      />
      <FormField
        variant={market ? "filled" : "auth"}
        label="City"
        maxLength={120}
        value={draft.city}
        onChangeText={(city) => updateDraft({ city })}
        placeholder="Enter the city"
        inputClassName={inputClassName}
      />
      <PhoneField
        countryCode={draft.phoneCountryCode ?? draft.countryCode ?? "NG"}
        editable={!locked}
        label="Phone"
        onChangeText={(phone) => updateDraft({ phone })}
        onCountryChange={(phoneCountryCode) =>
          updateDraft({ phoneCountryCode })
        }
        value={draft.phone}
        variant={market ? "filled" : "auth"}
      />
      <CurrencySelector
        appearance={market ? "market-day" : "classic"}
        disabled={locked}
        value={draft.currencyCode}
        onChange={(currencyCode) => updateDraft({ currencyCode })}
      />
    </Section>
  )
}
/** One review group: a small header with Edit, then the values. */
function ReviewCard({
  title,
  lines,
  onEdit,
  disabled,
}: {
  title: string
  lines: { main: string; sub?: string }[]
  onEdit: () => void
  disabled: boolean
}) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between px-0.5">
        <Text className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
          {title}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${title.toLowerCase()}`}
          className="min-h-9 justify-center px-1"
          disabled={disabled}
          hitSlop={8}
          onPress={onEdit}
        >
          <Text className="text-[13px] font-bold text-primary">Edit</Text>
        </Pressable>
      </View>
      <ListCard>
        {lines.map((line) => (
          <View key={line.main} className="gap-0.5 py-3">
            <Text className="text-[15px] font-bold text-foreground">
              {line.main}
            </Text>
            {line.sub ? (
              <Text className="text-[13px] text-muted-foreground">
                {line.sub}
              </Text>
            ) : null}
          </View>
        ))}
      </ListCard>
    </View>
  )
}

export function NewBusinessReview({ model, market }: FieldsProps) {
  if (!market) return <ClassicReview model={model} />
  return <MarketReview model={model} market={market} />
}

function ClassicReview({ model }: { model: NewBusinessModel }) {
  const { draft } = model
  const country = getCountry(draft.countryCode)
  const label = <T extends { key: string; label: string }>(
    items: readonly T[],
    key: string,
  ) => items.find((item) => item.key === key)?.label ?? key
  return (
    <View className="gap-5">
      <ReviewCard
        title="Business"
        disabled={model.locked}
        onEdit={() => model.editStep(3)}
        lines={[
          {
            main: draft.businessName.trim(),
            sub: [
              `${draft.addressLine1.trim()}, ${draft.city.trim()}`,
              toInternationalPhone(
                newBusinessPhoneDialCode(draft),
                draft.phone,
              ),
            ]
              .filter(Boolean)
              .join(" · "),
          },
        ]}
      />
      <ReviewCard
        title="Currency"
        disabled={model.locked}
        onEdit={() => model.editStep(3)}
        lines={[{ main: draft.currencyCode, sub: country.name }]}
      />
      <ReviewCard
        title="How it works"
        disabled={model.locked}
        onEdit={() => model.editStep(2)}
        lines={[
          {
            main: model.selectedProfile?.title ?? "Business type not chosen",
            sub:
              draft.businessProfileKey === "other-mixed-business"
                ? draft.otherBusinessDescription.trim()
                : label(BUSINESS_OPERATING_MODELS, draft.operatingModel),
          },
          {
            main: draft.orderChannels
              .map((key) => label(BUSINESS_ORDER_CHANNELS, key))
              .join(", "),
            sub: `Team: ${label(BUSINESS_TEAM_SIZES, draft.teamSize)}`,
          },
        ]}
      />
      <Text className="px-0.5 text-xs text-muted-foreground [-rn-line-height:18]">
        {model.local
          ? "This preview creates a device-local workspace only."
          : "The new business keeps its stock, sales, customers and staff separate."}
      </Text>
    </View>
  )
}

function MarketReview({ model, market }: FieldsProps) {
  const { BusinessSection: Section, BusinessSummary: Summary } = Market
  const { draft } = model
  return (
    <View className="gap-6">
      <Section
        title="Business summary"
        description={
          model.local
            ? "This preview creates a device-local workspace only."
            : "A separate workspace will be created and opened automatically."
        }
      >
        <View>
          <Summary label="Business" value={draft.businessName.trim()} />
          <Summary
            label="Location"
            value={`${draft.addressLine1.trim()}, ${draft.city.trim()}`}
          />
          <Summary
            label="Phone"
            value={toInternationalPhone(
              newBusinessPhoneDialCode(draft),
              draft.phone,
            )}
          />
          <Summary label="Country" value={getCountry(draft.countryCode).name} />
          <Summary label="Currency" value={draft.currencyCode} />
          <Summary
            label="Category"
            value={model.selectedProfile?.title ?? "Not selected"}
          />
          {draft.businessProfileKey === "other-mixed-business" ? (
            <Summary
              label="What you do"
              value={draft.otherBusinessDescription.trim()}
            />
          ) : null}
          <Summary
            label="Operations"
            value={
              BUSINESS_OPERATING_MODELS.find(
                (item) => item.key === draft.operatingModel,
              )?.label ?? draft.operatingModel
            }
          />
          <Summary
            label="Order channels"
            value={draft.orderChannels
              .map(
                (key) =>
                  BUSINESS_ORDER_CHANNELS.find((item) => item.key === key)
                    ?.label ?? key,
              )
              .join(", ")}
          />
          <Summary
            label="Team"
            value={
              BUSINESS_TEAM_SIZES.find((item) => item.key === draft.teamSize)
                ?.label ?? draft.teamSize
            }
          />
        </View>
      </Section>
      <View
        className={
          market
            ? "rounded-xl bg-market-marigold px-4 py-4"
            : "rounded-xl bg-primary/10 px-4 py-4"
        }
      >
        <Text
          className={
            market
              ? "text-sm text-market-on-marigold [-rn-line-height:21]"
              : "text-sm text-primary [-rn-line-height:21]"
          }
        >
          The new business keeps its inventory, sales, customers, staff and
          settings separate.
        </Text>
      </View>
    </View>
  )
}
