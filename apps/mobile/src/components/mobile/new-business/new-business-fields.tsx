import { CurrencySelector } from "@/components/mobile/currency-selector"
import { FormField } from "@/components/mobile/form-field"
import { Text } from "@/components/ui/text"
import { View } from "react-native"
import { useLargeTextLayout } from "@/hooks/use-large-text-layout"
import {
  BUSINESS_OPERATING_MODELS,
  BUSINESS_ORDER_CHANNELS,
  BUSINESS_TEAM_SIZES,
} from "@ewatrade/utils"
import * as Classic from "@/components/mobile/appearances/classic/new-business"
import * as Market from "@/components/mobile/appearances/market-day/new-business"
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
  const { BusinessSection: Section } = market ? Market : Classic
  const { draft, updateDraft, locked } = model
  const large = useLargeTextLayout()
  const inputClassName = market ? "bg-market-field text-market-ink" : undefined
  return (
    <Section
      title="Identity and location"
      description="This information belongs only to the new business."
    >
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
      <View className={large ? "gap-3" : "flex-row gap-3"}>
        <FormField
          variant={market ? "filled" : "auth"}
          containerClassName={large ? undefined : "min-w-0 flex-1"}
          label="City"
          maxLength={120}
          value={draft.city}
          onChangeText={(city) => updateDraft({ city })}
          placeholder="Enter the city"
          inputClassName={inputClassName}
        />
        <FormField
          variant={market ? "filled" : "auth"}
          containerClassName={large ? undefined : "min-w-0 flex-1"}
          label="Phone"
          keyboardType="phone-pad"
          maxLength={40}
          value={draft.phone}
          onChangeText={(phone) => updateDraft({ phone })}
          placeholder="Enter phone"
          inputClassName={inputClassName}
        />
      </View>
      <CurrencySelector
        appearance={market ? "market-day" : "classic"}
        disabled={locked}
        value={draft.currencyCode}
        onChange={(currencyCode) => updateDraft({ currencyCode })}
      />
    </Section>
  )
}
export function NewBusinessReview({ model, market }: FieldsProps) {
  const { BusinessSection: Section, BusinessSummary: Summary } = market
    ? Market
    : Classic
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
          <Summary label="Phone" value={draft.phone.trim()} />
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
