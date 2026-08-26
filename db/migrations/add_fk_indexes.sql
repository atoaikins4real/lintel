-- Migration: covering indexes for Lintel foreign keys
-- ------------------------------------------------------------
-- Postgres auto-indexes primary keys but NOT the columns that hold foreign
-- keys, so joins/filters on them (a tenant's leases, a unit's payments) and
-- the reference checks a DELETE performs are full table scans. Supabase's
-- performance advisor flagged these; this adds a covering index for each
-- foreign key that wasn't already covered by an existing index.
--
-- Many are composite (fk_col, company_id) because Lintel's FKs are composite
-- with company_id (the multi-tenant isolation keys). Foreign keys whose
-- company_id was already covered by a pre-existing idx_<table>_company /
-- unique index are intentionally NOT listed here (adding them would create a
-- duplicate index).
--
-- Idempotent (IF NOT EXISTS) and additive only — no data is touched, and
-- every object is on the l_ floor. Verified: after applying, Supabase reports
-- zero unindexed foreign keys on l_ tables. Safe to run anytime.
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS l_access_credentials_issued_by_idx ON public.l_access_credentials (issued_by, company_id);
CREATE INDEX IF NOT EXISTS l_access_credentials_property_id_idx ON public.l_access_credentials (property_id, company_id);
CREATE INDEX IF NOT EXISTS l_access_credentials_replaces_id_idx ON public.l_access_credentials (replaces_id, company_id);
CREATE INDEX IF NOT EXISTS l_access_credentials_tenant_id_idx ON public.l_access_credentials (tenant_id, company_id);
CREATE INDEX IF NOT EXISTS l_access_credentials_unit_id_idx ON public.l_access_credentials (unit_id, company_id);
CREATE INDEX IF NOT EXISTS l_access_events_credential_id_idx ON public.l_access_events (credential_id, company_id);
CREATE INDEX IF NOT EXISTS l_access_events_property_id_idx ON public.l_access_events (property_id, company_id);
CREATE INDEX IF NOT EXISTS l_access_events_unit_id_idx ON public.l_access_events (unit_id, company_id);
CREATE INDEX IF NOT EXISTS l_booking_inquiries_unit_id_idx ON public.l_booking_inquiries (unit_id, company_id);
CREATE INDEX IF NOT EXISTS l_documents_lease_idx ON public.l_documents (lease_id, company_id);
CREATE INDEX IF NOT EXISTS l_documents_property_idx ON public.l_documents (property_id, company_id);
CREATE INDEX IF NOT EXISTS l_documents_tenant_idx ON public.l_documents (tenant_id, company_id);
CREATE INDEX IF NOT EXISTS l_documents_unit_idx ON public.l_documents (unit_id, company_id);
CREATE INDEX IF NOT EXISTS l_documents_uploaded_by_idx ON public.l_documents (uploaded_by);
CREATE INDEX IF NOT EXISTS l_expenses_category_idx ON public.l_expenses (category_id, company_id);
CREATE INDEX IF NOT EXISTS l_expenses_unit_id_idx ON public.l_expenses (unit_id, company_id);
CREATE INDEX IF NOT EXISTS l_faults_tenant_id_idx ON public.l_faults (tenant_id, company_id);
CREATE INDEX IF NOT EXISTS l_faults_unit_id_idx ON public.l_faults (unit_id, company_id);
CREATE INDEX IF NOT EXISTS l_leases_tenant_id_idx ON public.l_leases (tenant_id, company_id);
CREATE INDEX IF NOT EXISTS l_leases_unit_id_idx ON public.l_leases (unit_id, company_id);
CREATE INDEX IF NOT EXISTS l_payments_lease_id_idx ON public.l_payments (lease_id, company_id);
CREATE INDEX IF NOT EXISTS l_payments_tenant_id_idx ON public.l_payments (tenant_id, company_id);
CREATE INDEX IF NOT EXISTS l_payments_unit_id_idx ON public.l_payments (unit_id, company_id);
CREATE INDEX IF NOT EXISTS l_payments_utility_type_idx ON public.l_payments (utility_type_id, company_id);
CREATE INDEX IF NOT EXISTS l_renovations_unit_id_idx ON public.l_renovations (unit_id, company_id);
CREATE INDEX IF NOT EXISTS l_rent_reviews_applied_by_idx ON public.l_rent_reviews (applied_by);
CREATE INDEX IF NOT EXISTS l_rent_reviews_company_id_idx ON public.l_rent_reviews (company_id);
CREATE INDEX IF NOT EXISTS l_rent_reviews_lease_idx ON public.l_rent_reviews (lease_id, company_id);
CREATE INDEX IF NOT EXISTS l_subscription_requests_decided_by_idx ON public.l_subscription_requests (decided_by);
CREATE INDEX IF NOT EXISTS l_subscription_requests_requested_by_idx ON public.l_subscription_requests (requested_by);
CREATE INDEX IF NOT EXISTS l_subscription_requests_requested_plan_id_idx ON public.l_subscription_requests (requested_plan_id);
CREATE INDEX IF NOT EXISTS l_subscriptions_plan_id_idx ON public.l_subscriptions (plan_id);
CREATE INDEX IF NOT EXISTS l_subscriptions_updated_by_idx ON public.l_subscriptions (updated_by);
CREATE INDEX IF NOT EXISTS l_tenant_contacts_tenant_id_idx ON public.l_tenant_contacts (tenant_id, company_id);
CREATE INDEX IF NOT EXISTS l_tenant_id_counters_company_id_idx ON public.l_tenant_id_counters (company_id);
CREATE INDEX IF NOT EXISTS l_tenant_occupants_tenant_id_idx ON public.l_tenant_occupants (tenant_id, company_id);
CREATE INDEX IF NOT EXISTS l_tenant_portal_tokens_company_id_idx ON public.l_tenant_portal_tokens (company_id);
CREATE INDEX IF NOT EXISTS l_tenant_portal_tokens_tenant_id_idx ON public.l_tenant_portal_tokens (tenant_id, company_id);
CREATE INDEX IF NOT EXISTS l_tenant_tier_events_company_id_idx ON public.l_tenant_tier_events (company_id);
CREATE INDEX IF NOT EXISTS l_tenant_tier_events_tenant_id_idx ON public.l_tenant_tier_events (tenant_id, company_id);
CREATE INDEX IF NOT EXISTS l_tenant_vehicles_tenant_id_idx ON public.l_tenant_vehicles (tenant_id, company_id);
CREATE INDEX IF NOT EXISTS l_unit_utilities_type_idx ON public.l_unit_utilities (utility_type_id, company_id);
CREATE INDEX IF NOT EXISTS l_unit_utilities_unit_idx ON public.l_unit_utilities (unit_id, company_id);
CREATE INDEX IF NOT EXISTS l_units_property_id_idx ON public.l_units (property_id, company_id);
