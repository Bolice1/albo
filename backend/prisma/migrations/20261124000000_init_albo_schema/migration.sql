-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- EnableExtensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateEnum
CREATE TYPE "IdentitySubjectStatus" AS ENUM ('active', 'suspended', 'deleted');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('active', 'suspended', 'pending_deletion', 'deleted');

-- CreateEnum
CREATE TYPE "RoleCode" AS ENUM ('citizen', 'provider', 'facility_user', 'community_health_worker', 'platform_admin');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'ended', 'suspended');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('active', 'ended', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "ConsentPurposeStatus" AS ENUM ('draft', 'active', 'retired');

-- CreateEnum
CREATE TYPE "ConsentRecordStatus" AS ENUM ('granted', 'withdrawn', 'expired', 'rejected');

-- CreateEnum
CREATE TYPE "HealthInputCategory" AS ENUM ('lifestyle', 'activity', 'diet', 'sleep', 'health_history', 'environmental_exposure');

-- CreateEnum
CREATE TYPE "DataSourceType" AS ENUM ('self_reported', 'imported', 'provider_recorded', 'generated', 'verified_environmental_adapter', 'verified_facility_registry');

-- CreateEnum
CREATE TYPE "HealthInputStatus" AS ENUM ('active', 'corrected', 'superseded', 'retracted');

-- CreateEnum
CREATE TYPE "CheckInSafetyStatus" AS ENUM ('normal', 'needs_review', 'escalated');

-- CreateEnum
CREATE TYPE "ObservationQualityStatus" AS ENUM ('verified', 'observed', 'forecast', 'estimated', 'stale', 'failed', 'unverified');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('scheduled', 'running', 'succeeded', 'partial', 'stale', 'failed');

-- CreateEnum
CREATE TYPE "UseCaseStatus" AS ENUM ('draft', 'approved', 'retired');

-- CreateEnum
CREATE TYPE "ClinicalReviewStatus" AS ENUM ('draft', 'under_review', 'approved', 'retired');

-- CreateEnum
CREATE TYPE "ImplementationType" AS ENUM ('rule', 'weighted_score', 'assistant_adapter', 'ml_model');

-- CreateEnum
CREATE TYPE "RiskAssessmentStatus" AS ENUM ('queued', 'processing', 'complete', 'limited', 'failed', 'superseded');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('low', 'moderate', 'high');

-- CreateEnum
CREATE TYPE "FacilityType" AS ENUM ('hospital', 'health_center', 'clinic', 'pharmacy', 'mental_health_center', 'community_health_post');

-- CreateEnum
CREATE TYPE "FacilityStatus" AS ENUM ('active', 'temporarily_closed', 'unverified', 'inactive');

-- CreateEnum
CREATE TYPE "ReferralType" AS ENUM ('facility_referral', 'provider_contact', 'community_follow_up');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('requested', 'accepted', 'completed', 'cancelled', 'declined');

-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('requested', 'scheduled', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('in_app', 'email', 'sms', 'push');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'delivered', 'suppressed', 'failed', 'read');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('requested', 'queued', 'generating', 'ready', 'failed', 'expired');

-- CreateEnum
CREATE TYPE "DeletionRequestStatus" AS ENUM ('requested', 'grace_period', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "ExportRequestStatus" AS ENUM ('requested', 'ready', 'expired', 'failed');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('user', 'service', 'system', 'anonymous');

-- CreateEnum
CREATE TYPE "AuditOutcome" AS ENUM ('allowed', 'denied', 'succeeded', 'failed', 'limited', 'escalated');

-- CreateTable
CREATE TABLE "identity_subjects" (
    "id" UUID NOT NULL,
    "external_subject_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "IdentitySubjectStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6),

    CONSTRAINT "identity_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_accounts" (
    "id" UUID NOT NULL,
    "identity_subject_id" UUID NOT NULL,
    "account_status" "AccountStatus" NOT NULL DEFAULT 'active',
    "preferred_language" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Kigali',
    "onboarding_completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "display_name" TEXT,
    "birth_year" INTEGER,
    "administrative_area_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" "RoleCode" NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "organization_type" TEXT NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "role_code" "RoleCode" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'active',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_profiles" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "specialty_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "license_verified_at" TIMESTAMPTZ(6),
    "public_directory_visible" BOOLEAN NOT NULL DEFAULT false,
    "organization_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "provider_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_assignments" (
    "id" UUID NOT NULL,
    "provider_user_id" UUID NOT NULL,
    "citizen_user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "allowed_scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "AssignmentStatus" NOT NULL DEFAULT 'active',
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "provider_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_follow_ups" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "provider_user_id" UUID NOT NULL,
    "citizen_user_id" UUID NOT NULL,
    "referenced_assessment_id" UUID,
    "action_type" TEXT NOT NULL,
    "structured_notes" JSONB NOT NULL,
    "recommended_follow_up_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_purposes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "data_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_required_for_onboarding" BOOLEAN NOT NULL DEFAULT false,
    "status" "ConsentPurposeStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_purposes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "consent_purpose_id" UUID NOT NULL,
    "status" "ConsentRecordStatus" NOT NULL DEFAULT 'granted',
    "granted_at" TIMESTAMPTZ(6),
    "withdrawn_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "recorded_by_id" UUID NOT NULL,
    "policy_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_inputs" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "category" "HealthInputCategory" NOT NULL,
    "field_code" TEXT NOT NULL,
    "numeric_value" DOUBLE PRECISION,
    "text_value" TEXT,
    "unit" TEXT,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "source_type" "DataSourceType" NOT NULL,
    "source_reference" TEXT,
    "valid_from" TIMESTAMPTZ(6),
    "valid_until" TIMESTAMPTZ(6),
    "status" "HealthInputStatus" NOT NULL DEFAULT 'active',
    "supersedes_input_id" UUID,
    "consent_record_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "health_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wellbeing_check_ins" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "questionnaire_version" TEXT NOT NULL,
    "responses" JSONB NOT NULL,
    "completed_at" TIMESTAMPTZ(6) NOT NULL,
    "source_type" "DataSourceType" NOT NULL,
    "safety_status" "CheckInSafetyStatus" NOT NULL DEFAULT 'normal',
    "escalation_required" BOOLEAN NOT NULL DEFAULT false,
    "escalation_category" TEXT,
    "consent_record_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wellbeing_check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_sources" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source_type" "DataSourceType" NOT NULL,
    "owner" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "trust_status" TEXT NOT NULL,
    "is_calculation_approved" BOOLEAN NOT NULL DEFAULT false,
    "terms_reference" TEXT,
    "last_reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_records" (
    "id" UUID NOT NULL,
    "data_source_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "status" "IngestionStatus" NOT NULL DEFAULT 'scheduled',
    "items_received" INTEGER NOT NULL DEFAULT 0,
    "items_accepted" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "error_summary" TEXT,
    "source_cursor" TEXT,
    "idempotency_key" TEXT,

    CONSTRAINT "ingestion_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "environmental_observations" (
    "id" UUID NOT NULL,
    "data_source_id" UUID NOT NULL,
    "ingestion_record_id" UUID,
    "observation_type" TEXT NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "location_area_id" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "quality_status" "ObservationQualityStatus" NOT NULL,
    "source_timestamp" TIMESTAMPTZ(6) NOT NULL,
    "ingested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "environmental_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_use_cases" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "intended_use" TEXT NOT NULL,
    "excluded_use" TEXT NOT NULL,
    "required_input_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "UseCaseStatus" NOT NULL DEFAULT 'draft',
    "clinical_review_status" "ClinicalReviewStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "risk_use_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_model_versions" (
    "id" UUID NOT NULL,
    "risk_use_case_id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "implementation_type" "ImplementationType" NOT NULL,
    "configuration_reference" TEXT NOT NULL,
    "effective_from" TIMESTAMPTZ(6),
    "retired_at" TIMESTAMPTZ(6),
    "approval_status" "ClinicalReviewStatus" NOT NULL DEFAULT 'draft',
    "limitations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evaluation_reference" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_model_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "input_snapshots" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "risk_use_case_id" UUID NOT NULL,
    "consent_record_id" UUID NOT NULL,
    "calculated_for_timestamp" TIMESTAMPTZ(6) NOT NULL,
    "input_payload" JSONB NOT NULL,
    "payload_sha256" TEXT NOT NULL,
    "data_quality_status" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "input_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_assessments" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "risk_use_case_id" UUID NOT NULL,
    "rule_model_version_id" UUID NOT NULL,
    "input_snapshot_id" UUID NOT NULL,
    "status" "RiskAssessmentStatus" NOT NULL DEFAULT 'queued',
    "level" "RiskLevel",
    "calculated_at" TIMESTAMPTZ(6),
    "contributing_factors" JSONB NOT NULL DEFAULT '[]',
    "limitations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recommended_next_steps" JSONB NOT NULL DEFAULT '[]',
    "safety_metadata" JSONB NOT NULL DEFAULT '{}',
    "superseded_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facilities" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "facility_type" "FacilityType" NOT NULL,
    "status" "FacilityStatus" NOT NULL DEFAULT 'active',
    "address" TEXT NOT NULL,
    "administrative_area_code" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "opening_hours_summary" TEXT,
    "data_source_id" UUID NOT NULL,
    "source_reference" TEXT NOT NULL,
    "last_verified_at" TIMESTAMPTZ(6) NOT NULL,
    "verification_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facility_services" (
    "id" UUID NOT NULL,
    "facility_id" UUID NOT NULL,
    "service_code" TEXT NOT NULL,
    "service_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_verified_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facility_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" UUID NOT NULL,
    "citizen_user_id" UUID NOT NULL,
    "provider_user_id" UUID,
    "facility_id" UUID,
    "created_by_id" UUID NOT NULL,
    "type" "ReferralType" NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'requested',
    "purpose" TEXT NOT NULL,
    "consent_record_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMPTZ(6),
    "notes_summary" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultations" (
    "id" UUID NOT NULL,
    "citizen_user_id" UUID NOT NULL,
    "provider_user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "assignment_id" UUID,
    "created_by_id" UUID NOT NULL,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'requested',
    "purpose" TEXT NOT NULL,
    "consent_record_id" UUID NOT NULL,
    "requested_for_at" TIMESTAMPTZ(6),
    "scheduled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "consultations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT false,
    "sms_enabled" BOOLEAN NOT NULL DEFAULT false,
    "push_enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabled_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "quiet_hours_start" TEXT,
    "quiet_hours_end" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'in_app',
    "title_key" TEXT NOT NULL,
    "body_key" TEXT NOT NULL,
    "in_app_target_path" TEXT,
    "source_reference" TEXT,
    "content_template_version" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "read_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "failure_code" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "provider_message_id" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'requested',
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "period_end" TIMESTAMPTZ(6) NOT NULL,
    "included_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source_summary" JSONB NOT NULL DEFAULT '{}',
    "template_version" TEXT NOT NULL,
    "object_storage_key" TEXT,
    "content_sha256" TEXT,
    "failure_code" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_accesses" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "granted_to_user_id" UUID NOT NULL,
    "granted_by_user_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_conversations" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "consent_record_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "topic_category" TEXT,
    "turn_count" INTEGER NOT NULL DEFAULT 0,
    "last_message_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assistant_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_turns" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "response_type" TEXT,
    "referenced_assessment_id" UUID,
    "adapter_version" TEXT,
    "escalation_triggered" BOOLEAN NOT NULL DEFAULT false,
    "safety_reason_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bounded_summary_text" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_turns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_deletion_requests" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "status" "DeletionRequestStatus" NOT NULL DEFAULT 'requested',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grace_period_ends_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),

    CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_export_requests" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "status" "ExportRequestStatus" NOT NULL DEFAULT 'requested',
    "object_storage_key" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "data_export_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "user_account_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "route_key" TEXT NOT NULL,
    "request_sha256" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" TEXT,
    "actor_type" "ActorType" NOT NULL,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "outcome" "AuditOutcome" NOT NULL,
    "request_id" TEXT NOT NULL,
    "organization_id" UUID,
    "purpose_code" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "identity_subjects_status_idx" ON "identity_subjects"("status");

-- CreateIndex
CREATE UNIQUE INDEX "identity_subjects_provider_external_subject_id_key" ON "identity_subjects"("provider", "external_subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_accounts_identity_subject_id_key" ON "user_accounts"("identity_subject_id");

-- CreateIndex
CREATE INDEX "user_accounts_account_status_idx" ON "user_accounts"("account_status");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_account_id_key" ON "user_profiles"("user_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "user_roles_user_account_id_revoked_at_idx" ON "user_roles"("user_account_id", "revoked_at");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "organizations_status_idx" ON "organizations"("status");

-- CreateIndex
CREATE INDEX "organization_memberships_organization_id_user_account_id_st_idx" ON "organization_memberships"("organization_id", "user_account_id", "status");

-- CreateIndex
CREATE INDEX "organization_memberships_user_account_id_status_idx" ON "organization_memberships"("user_account_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "provider_profiles_user_account_id_key" ON "provider_profiles"("user_account_id");

-- CreateIndex
CREATE INDEX "provider_profiles_public_directory_visible_idx" ON "provider_profiles"("public_directory_visible");

-- CreateIndex
CREATE INDEX "provider_profiles_organization_id_idx" ON "provider_profiles"("organization_id");

-- CreateIndex
CREATE INDEX "provider_assignments_provider_user_id_citizen_user_id_statu_idx" ON "provider_assignments"("provider_user_id", "citizen_user_id", "status");

-- CreateIndex
CREATE INDEX "provider_assignments_citizen_user_id_status_idx" ON "provider_assignments"("citizen_user_id", "status");

-- CreateIndex
CREATE INDEX "provider_assignments_organization_id_status_idx" ON "provider_assignments"("organization_id", "status");

-- CreateIndex
CREATE INDEX "provider_follow_ups_citizen_user_id_created_at_idx" ON "provider_follow_ups"("citizen_user_id", "created_at");

-- CreateIndex
CREATE INDEX "provider_follow_ups_provider_user_id_created_at_idx" ON "provider_follow_ups"("provider_user_id", "created_at");

-- CreateIndex
CREATE INDEX "provider_follow_ups_assignment_id_idx" ON "provider_follow_ups"("assignment_id");

-- CreateIndex
CREATE INDEX "consent_purposes_status_idx" ON "consent_purposes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "consent_purposes_code_version_key" ON "consent_purposes"("code", "version");

-- CreateIndex
CREATE INDEX "consent_records_user_account_id_consent_purpose_id_status_idx" ON "consent_records"("user_account_id", "consent_purpose_id", "status");

-- CreateIndex
CREATE INDEX "consent_records_user_account_id_created_at_idx" ON "consent_records"("user_account_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "health_inputs_supersedes_input_id_key" ON "health_inputs"("supersedes_input_id");

-- CreateIndex
CREATE INDEX "health_inputs_user_account_id_field_code_status_observed_at_idx" ON "health_inputs"("user_account_id", "field_code", "status", "observed_at");

-- CreateIndex
CREATE INDEX "health_inputs_user_account_id_observed_at_idx" ON "health_inputs"("user_account_id", "observed_at");

-- CreateIndex
CREATE INDEX "wellbeing_check_ins_user_account_id_completed_at_idx" ON "wellbeing_check_ins"("user_account_id", "completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "data_sources_code_key" ON "data_sources"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ingestion_records_idempotency_key_key" ON "ingestion_records"("idempotency_key");

-- CreateIndex
CREATE INDEX "ingestion_records_data_source_id_started_at_idx" ON "ingestion_records"("data_source_id", "started_at");

-- CreateIndex
CREATE INDEX "environmental_observations_location_area_id_observation_typ_idx" ON "environmental_observations"("location_area_id", "observation_type", "observed_at");

-- CreateIndex
CREATE INDEX "environmental_observations_data_source_id_observed_at_idx" ON "environmental_observations"("data_source_id", "observed_at");

-- CreateIndex
CREATE UNIQUE INDEX "risk_use_cases_code_key" ON "risk_use_cases"("code");

-- CreateIndex
CREATE INDEX "risk_use_cases_status_idx" ON "risk_use_cases"("status");

-- CreateIndex
CREATE UNIQUE INDEX "rule_model_versions_risk_use_case_id_version_key" ON "rule_model_versions"("risk_use_case_id", "version");

-- CreateIndex
CREATE INDEX "input_snapshots_user_account_id_risk_use_case_id_created_at_idx" ON "input_snapshots"("user_account_id", "risk_use_case_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "risk_assessments_input_snapshot_id_key" ON "risk_assessments"("input_snapshot_id");

-- CreateIndex
CREATE INDEX "risk_assessments_user_account_id_risk_use_case_id_calculate_idx" ON "risk_assessments"("user_account_id", "risk_use_case_id", "calculated_at");

-- CreateIndex
CREATE INDEX "risk_assessments_user_account_id_created_at_idx" ON "risk_assessments"("user_account_id", "created_at");

-- CreateIndex
CREATE INDEX "risk_assessments_rule_model_version_id_idx" ON "risk_assessments"("rule_model_version_id");

-- CreateIndex
CREATE INDEX "facilities_administrative_area_code_facility_type_status_idx" ON "facilities"("administrative_area_code", "facility_type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "facilities_data_source_id_source_reference_key" ON "facilities"("data_source_id", "source_reference");

-- CreateIndex
CREATE INDEX "facility_services_service_code_status_idx" ON "facility_services"("service_code", "status");

-- CreateIndex
CREATE UNIQUE INDEX "facility_services_facility_id_service_code_key" ON "facility_services"("facility_id", "service_code");

-- CreateIndex
CREATE INDEX "referrals_citizen_user_id_status_created_at_idx" ON "referrals"("citizen_user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "referrals_provider_user_id_status_idx" ON "referrals"("provider_user_id", "status");

-- CreateIndex
CREATE INDEX "referrals_facility_id_status_idx" ON "referrals"("facility_id", "status");

-- CreateIndex
CREATE INDEX "consultations_citizen_user_id_status_created_at_idx" ON "consultations"("citizen_user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "consultations_provider_user_id_status_idx" ON "consultations"("provider_user_id", "status");

-- CreateIndex
CREATE INDEX "consultations_organization_id_status_idx" ON "consultations"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_account_id_key" ON "notification_preferences"("user_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_idempotency_key_key" ON "notifications"("idempotency_key");

-- CreateIndex
CREATE INDEX "notifications_user_account_id_status_created_at_idx" ON "notifications"("user_account_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "reports_user_account_id_status_created_at_idx" ON "reports"("user_account_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "report_accesses_report_id_granted_to_user_id_idx" ON "report_accesses"("report_id", "granted_to_user_id");

-- CreateIndex
CREATE INDEX "report_accesses_granted_to_user_id_expires_at_idx" ON "report_accesses"("granted_to_user_id", "expires_at");

-- CreateIndex
CREATE INDEX "assistant_conversations_user_account_id_created_at_idx" ON "assistant_conversations"("user_account_id", "created_at");

-- CreateIndex
CREATE INDEX "assistant_turns_conversation_id_created_at_idx" ON "assistant_turns"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "account_deletion_requests_user_account_id_status_idx" ON "account_deletion_requests"("user_account_id", "status");

-- CreateIndex
CREATE INDEX "data_export_requests_user_account_id_status_idx" ON "data_export_requests"("user_account_id", "status");

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_user_account_id_route_key_idempotency_k_key" ON "idempotency_records"("user_account_id", "route_key", "idempotency_key");

-- CreateIndex
CREATE INDEX "audit_events_actor_id_occurred_at_idx" ON "audit_events"("actor_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_resource_type_resource_id_occurred_at_idx" ON "audit_events"("resource_type", "resource_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_request_id_idx" ON "audit_events"("request_id");

-- CreateIndex
CREATE INDEX "audit_events_occurred_at_idx" ON "audit_events"("occurred_at");

-- AddForeignKey
ALTER TABLE "user_accounts" ADD CONSTRAINT "user_accounts_identity_subject_id_fkey" FOREIGN KEY ("identity_subject_id") REFERENCES "identity_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_assignments" ADD CONSTRAINT "provider_assignments_provider_user_id_fkey" FOREIGN KEY ("provider_user_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_assignments" ADD CONSTRAINT "provider_assignments_citizen_user_id_fkey" FOREIGN KEY ("citizen_user_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_assignments" ADD CONSTRAINT "provider_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_assignments" ADD CONSTRAINT "provider_assignments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_follow_ups" ADD CONSTRAINT "provider_follow_ups_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "provider_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_follow_ups" ADD CONSTRAINT "provider_follow_ups_provider_user_id_fkey" FOREIGN KEY ("provider_user_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_follow_ups" ADD CONSTRAINT "provider_follow_ups_citizen_user_id_fkey" FOREIGN KEY ("citizen_user_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_follow_ups" ADD CONSTRAINT "provider_follow_ups_referenced_assessment_id_fkey" FOREIGN KEY ("referenced_assessment_id") REFERENCES "risk_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_consent_purpose_id_fkey" FOREIGN KEY ("consent_purpose_id") REFERENCES "consent_purposes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_inputs" ADD CONSTRAINT "health_inputs_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_inputs" ADD CONSTRAINT "health_inputs_consent_record_id_fkey" FOREIGN KEY ("consent_record_id") REFERENCES "consent_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_inputs" ADD CONSTRAINT "health_inputs_supersedes_input_id_fkey" FOREIGN KEY ("supersedes_input_id") REFERENCES "health_inputs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wellbeing_check_ins" ADD CONSTRAINT "wellbeing_check_ins_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wellbeing_check_ins" ADD CONSTRAINT "wellbeing_check_ins_consent_record_id_fkey" FOREIGN KEY ("consent_record_id") REFERENCES "consent_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_records" ADD CONSTRAINT "ingestion_records_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environmental_observations" ADD CONSTRAINT "environmental_observations_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "environmental_observations" ADD CONSTRAINT "environmental_observations_ingestion_record_id_fkey" FOREIGN KEY ("ingestion_record_id") REFERENCES "ingestion_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_model_versions" ADD CONSTRAINT "rule_model_versions_risk_use_case_id_fkey" FOREIGN KEY ("risk_use_case_id") REFERENCES "risk_use_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "input_snapshots" ADD CONSTRAINT "input_snapshots_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "input_snapshots" ADD CONSTRAINT "input_snapshots_risk_use_case_id_fkey" FOREIGN KEY ("risk_use_case_id") REFERENCES "risk_use_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "input_snapshots" ADD CONSTRAINT "input_snapshots_consent_record_id_fkey" FOREIGN KEY ("consent_record_id") REFERENCES "consent_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_risk_use_case_id_fkey" FOREIGN KEY ("risk_use_case_id") REFERENCES "risk_use_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_rule_model_version_id_fkey" FOREIGN KEY ("rule_model_version_id") REFERENCES "rule_model_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_input_snapshot_id_fkey" FOREIGN KEY ("input_snapshot_id") REFERENCES "input_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "risk_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facility_services" ADD CONSTRAINT "facility_services_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_citizen_user_id_fkey" FOREIGN KEY ("citizen_user_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_provider_user_id_fkey" FOREIGN KEY ("provider_user_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_consent_record_id_fkey" FOREIGN KEY ("consent_record_id") REFERENCES "consent_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_citizen_user_id_fkey" FOREIGN KEY ("citizen_user_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_provider_user_id_fkey" FOREIGN KEY ("provider_user_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "provider_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_consent_record_id_fkey" FOREIGN KEY ("consent_record_id") REFERENCES "consent_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_accesses" ADD CONSTRAINT "report_accesses_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_accesses" ADD CONSTRAINT "report_accesses_granted_to_user_id_fkey" FOREIGN KEY ("granted_to_user_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_accesses" ADD CONSTRAINT "report_accesses_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_consent_record_id_fkey" FOREIGN KEY ("consent_record_id") REFERENCES "consent_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_turns" ADD CONSTRAINT "assistant_turns_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "assistant_conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_turns" ADD CONSTRAINT "assistant_turns_referenced_assessment_id_fkey" FOREIGN KEY ("referenced_assessment_id") REFERENCES "risk_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_account_id_fkey" FOREIGN KEY ("user_account_id") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PostGIS Stored Generated Geography Column & GIST Index (ADR-008, DATABASE_SCHEMA.md §9.1 & §14)
ALTER TABLE "facilities"
  ADD COLUMN "location" geography(Point, 4326)
  GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography) STORED;

CREATE INDEX "facilities_location_gist_idx" ON "facilities" USING GIST ("location");

-- Partial Unique Index for Active User Roles (DATABASE_SCHEMA.md §4.3)
CREATE UNIQUE INDEX "user_roles_active_unique_idx"
  ON "user_roles" ("user_account_id", "role_id")
  WHERE "revoked_at" IS NULL;

-- Non-Diagnostic & Safe-Degradation Check Constraint (ADR-003, ADR-014, DATABASE_SCHEMA.md §13)
ALTER TABLE "risk_assessments"
  ADD CONSTRAINT "risk_assessments_status_level_chk"
  CHECK ((status = 'complete' AND level IS NOT NULL) OR (status <> 'complete' AND level IS NULL));

-- Assistant Turn Role Check Constraint
ALTER TABLE "assistant_turns"
  ADD CONSTRAINT "assistant_turns_role_chk"
  CHECK ("role" IN ('user', 'assistant'));

-- Append-Only Immutability Trigger on audit_events (T-021, DATABASE_SCHEMA.md §11 & §13)
CREATE OR REPLACE FUNCTION prevent_audit_events_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only; % operations are prohibited', TG_OP
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "audit_events_prevent_mutation_trg"
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_events_mutation();


