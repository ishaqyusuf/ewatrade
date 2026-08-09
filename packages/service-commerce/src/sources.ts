import type {
  ServiceCommerceSourceKind,
  ServiceCommerceSourceRef,
} from "./schemas"
import { serviceCommerceSourceRefSchema } from "./schemas"

export type ServiceCommerceSourceAdapter<
  TKind extends ServiceCommerceSourceKind,
  TAggregate,
  TProjection,
> = {
  getId: (aggregate: TAggregate) => string
  kind: TKind
  project: (aggregate: TAggregate) => TProjection
}

export type ServiceCommerceSourceRegistry<
  TServiceAggregate,
  TServiceProjection,
  TPrescriptionAggregate,
  TPrescriptionProjection,
  TCommerceInquiryAggregate,
  TCommerceInquiryProjection,
> = {
  commerceInquiry: ServiceCommerceSourceAdapter<
    "commerce_inquiry",
    TCommerceInquiryAggregate,
    TCommerceInquiryProjection
  >
  prescription: ServiceCommerceSourceAdapter<
    "prescription",
    TPrescriptionAggregate,
    TPrescriptionProjection
  >
  service: ServiceCommerceSourceAdapter<
    "service",
    TServiceAggregate,
    TServiceProjection
  >
}

export function createServiceCommerceSourceRegistry<
  TServiceAggregate,
  TServiceProjection,
  TPrescriptionAggregate,
  TPrescriptionProjection,
  TCommerceInquiryAggregate,
  TCommerceInquiryProjection,
>(
  registry: ServiceCommerceSourceRegistry<
    TServiceAggregate,
    TServiceProjection,
    TPrescriptionAggregate,
    TPrescriptionProjection,
    TCommerceInquiryAggregate,
    TCommerceInquiryProjection
  >,
) {
  return registry
}

export function adaptServiceCommerceSource<
  TKind extends ServiceCommerceSourceKind,
  TAggregate,
  TProjection,
>(
  adapter: ServiceCommerceSourceAdapter<TKind, TAggregate, TProjection>,
  aggregate: TAggregate,
): {
  projection: TProjection
  source: ServiceCommerceSourceRef & { kind: TKind }
} {
  const source = serviceCommerceSourceRefSchema.parse({
    id: adapter.getId(aggregate),
    kind: adapter.kind,
  })

  return {
    projection: adapter.project(aggregate),
    source: { id: source.id, kind: adapter.kind },
  }
}
