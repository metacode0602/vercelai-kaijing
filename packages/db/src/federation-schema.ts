/**
 * Den federation tables: trusted issuer, per-org client binding, identity links,
 * org consent, replay protection, and audit.
 *
 * @see docs/design/open-shop-federated-auth-plan.md §7.2
 */
import { createId } from "@paralleldrive/cuid2"
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core"
import { organization, user } from "./auth-schema"
import { oauthClient } from "./oauth-schema"

const federationTimestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}

export const federationProvider = pgTable(
  "federation_provider",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    issuer: text("issuer").notNull(),
    jwksUri: text("jwks_uri").notNull(),
    claimsJson: jsonb("claims_json").notNull().default({}),
    allowedScopes: text("allowed_scopes").array().notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    ...federationTimestamps,
  },
  (table) => [
    uniqueIndex("federation_provider_issuer_uidx").on(table.issuer),
    index("federation_provider_status_idx").on(table.status),
  ]
)

export const federationOrgBinding = pgTable(
  "federation_org_binding",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    providerId: text("provider_id")
      .notNull()
      .references(() => federationProvider.id, { onDelete: "cascade" }),
    externalOrgId: text("external_org_id").notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId),
    denIssuer: text("den_issuer").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    jitEnabled: boolean("jit_enabled").notNull().default(false),
    roleMappingJson: jsonb("role_mapping_json").notNull().default({}),
    ...federationTimestamps,
  },
  (table) => [
    uniqueIndex("federation_org_binding_provider_external_org_uidx").on(
      table.providerId,
      table.externalOrgId
    ),
    uniqueIndex("federation_org_binding_provider_org_uidx").on(
      table.providerId,
      table.organizationId
    ),
    index("federation_org_binding_organization_idx").on(table.organizationId),
    index("federation_org_binding_client_idx").on(table.clientId),
  ]
)

export const federationIdentity = pgTable(
  "federation_identity",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    providerId: text("provider_id")
      .notNull()
      .references(() => federationProvider.id, { onDelete: "cascade" }),
    externalOrgId: text("external_org_id").notNull(),
    externalUserId: text("external_user_id").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }),
    emailVerified: boolean("email_verified").notNull().default(false),
    linkedAt: timestamp("linked_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("federation_identity_provider_external_user_uidx").on(
      table.providerId,
      table.externalOrgId,
      table.externalUserId
    ),
    index("federation_identity_organization_idx").on(table.organizationId),
    index("federation_identity_user_idx").on(table.userId),
  ]
)

export const federationConsent = pgTable(
  "federation_consent",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    providerId: text("provider_id")
      .notNull()
      .references(() => federationProvider.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId),
    scopes: text("scopes").array().notNull(),
    consentedBy: text("consented_by")
      .notNull()
      .references(() => user.id),
    consentedAt: timestamp("consented_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("federation_consent_provider_org_client_uidx").on(
      table.providerId,
      table.organizationId,
      table.clientId
    ),
    index("federation_consent_organization_idx").on(table.organizationId),
  ]
)

export const oauthTokenExchange = pgTable(
  "oauth_token_exchange",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    providerId: text("provider_id")
      .notNull()
      .references(() => federationProvider.id, { onDelete: "cascade" }),
    subjectJti: text("subject_jti").notNull(),
    actorJti: text("actor_jti"),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    scopes: text("scopes").array().notNull(),
    result: varchar("result", { length: 16 }).notNull(),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("oauth_token_exchange_subject_jti_uidx").on(table.subjectJti),
    index("oauth_token_exchange_organization_idx").on(table.organizationId),
    index("oauth_token_exchange_provider_created_idx").on(
      table.providerId,
      table.createdAt
    ),
  ]
)

export const federationAudit = pgTable(
  "federation_audit",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    providerId: text("provider_id")
      .notNull()
      .references(() => federationProvider.id, { onDelete: "cascade" }),
    event: varchar("event", { length: 64 }).notNull(),
    actor: text("actor"),
    subject: text("subject"),
    requestId: text("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("federation_audit_organization_created_idx").on(
      table.organizationId,
      table.createdAt
    ),
    index("federation_audit_provider_created_idx").on(
      table.providerId,
      table.createdAt
    ),
  ]
)

export type FederationProvider = typeof federationProvider.$inferSelect
export type FederationOrgBinding = typeof federationOrgBinding.$inferSelect
export type FederationIdentity = typeof federationIdentity.$inferSelect
export type FederationConsent = typeof federationConsent.$inferSelect
export type OAuthTokenExchange = typeof oauthTokenExchange.$inferSelect
export type FederationAudit = typeof federationAudit.$inferSelect
