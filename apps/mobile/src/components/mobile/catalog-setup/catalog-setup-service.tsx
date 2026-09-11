import { FormField } from "@/components/mobile/form-field"
import { Text } from "@/components/ui/text"
import { View } from "react-native"
import { catalogSetupClassName } from "./catalog-setup-presentation"
import * as Classic from "@/components/mobile/appearances/classic/catalog-setup"
import * as Market from "@/components/mobile/appearances/market-day/catalog-setup"
import type { CatalogSetupModel } from "./use-catalog-setup"

export function CatalogSetupService({
  model,
  market,
}: { model: CatalogSetupModel; market: boolean }) {
  const {
    kind,
    showDescription,
    setShowDescription,
    showAdvanced,
    trackServiceWork,
    setTrackServiceWork,
    serviceAuthorization,
    setServiceAuthorization,
    serviceGuidance,
    setServiceGuidance,
    openVariantComposer,
  } = model
  const {
    ServiceDetailAction,
    ServiceAuthorizationOption,
    ServiceWorkTrackingSwitch,
  } = market ? Market : Classic
  if (!kind) return null
  return (
    <>
      {kind === "service" && trackServiceWork ? (
        <View
          className={catalogSetupClassName(
            "mt-1 border-t border-border pt-4",
            market,
          )}
        >
          <Text
            className={catalogSetupClassName(
              "text-lg font-extrabold text-foreground",
              market,
            )}
          >
            Work handoff
          </Text>
          <Text
            className={catalogSetupClassName(
              "mb-1 text-xs text-muted-foreground",
              market,
            )}
          >
            Choose whether an order should create work for your team.
          </Text>
          <ServiceWorkTrackingSwitch
            onPress={() => setTrackServiceWork(false)}
          />
          <Text
            className={catalogSetupClassName(
              "mt-4 text-xs font-bold uppercase tracking-[1.4px] text-muted-foreground",
              market,
            )}
          >
            Work can start
          </Text>
          <View
            className={catalogSetupClassName(
              "mt-1 border-t border-border",
              market,
            )}
          >
            <ServiceAuthorizationOption
              description="Use when payment is not required before work begins."
              label="When the order is confirmed"
              onPress={() => setServiceAuthorization("on_order_confirmation")}
              selected={serviceAuthorization === "on_order_confirmation"}
            />
            <ServiceAuthorizationOption
              description="Hold the job until its required payment is received."
              label="After required payment"
              onPress={() => setServiceAuthorization("after_required_payment")}
              selected={serviceAuthorization === "after_required_payment"}
            />
            <ServiceAuthorizationOption
              description="A manager decides when the team can begin."
              label="After manager release"
              onPress={() => setServiceAuthorization("manual_release")}
              selected={serviceAuthorization === "manual_release"}
            />
          </View>
          <View className={catalogSetupClassName("mt-4", market)}>
            <FormField
              label="Customer guidance (optional)"
              inputClassName={
                market ? "bg-market-field text-market-ink" : undefined
              }
              maxLength={2000}
              multiline
              onChangeText={setServiceGuidance}
              placeholder="Information shown with this service"
              value={serviceGuidance}
            />
          </View>
        </View>
      ) : null}

      {kind === "service" &&
      (!showDescription || !showAdvanced || !trackServiceWork) ? (
        <View
          className={catalogSetupClassName(
            "mt-1 border-t border-border pt-4",
            market,
          )}
        >
          <Text
            className={catalogSetupClassName(
              "text-lg font-extrabold text-foreground",
              market,
            )}
          >
            Service details
          </Text>
          <Text
            className={catalogSetupClassName(
              "mb-1 text-xs text-muted-foreground",
              market,
            )}
          >
            Add only what this service needs.
          </Text>
          {!showDescription ? (
            <ServiceDetailAction
              description="Explain what customers receive."
              icon="FileText"
              label="Description"
              onPress={() => setShowDescription(true)}
            />
          ) : null}
          {!showAdvanced ? (
            <ServiceDetailAction
              description="Offer service levels or turnaround choices."
              icon="LayoutGrid"
              label="Packages or options"
              onPress={openVariantComposer}
            />
          ) : null}
          {!trackServiceWork ? (
            <ServiceDetailAction
              description="Create a job and control when work can begin."
              icon="Briefcase"
              label="Track work after order"
              onPress={() => setTrackServiceWork(true)}
            />
          ) : null}
        </View>
      ) : null}
    </>
  )
}
