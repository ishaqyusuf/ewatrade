
# Multi Tenant Model

Each merchant and dispatch company is a tenant.

All business data must contain:

tenantId

Examples:

Store → merchant tenant
Product → store tenant
DeliveryBid → dispatch tenant

Rules:
- tenants cannot access other tenant data
- marketplace browsing remains public
- public reads must be limited to explicitly published data
