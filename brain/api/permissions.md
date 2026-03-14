# API Permissions

## Purpose
Define authorization and visibility rules for APIs.

## How To Use
- Update when auth roles, tenant checks, or public/private boundaries change.

## Baseline Rules
- Authenticated users may only access data for tenants they belong to.
- Dispatch providers may only manage delivery data tied to their tenant scope.
- Public marketplace and storefront endpoints expose only explicitly published data.
- Admin or internal tooling permissions are TODO until roles are formalized.
