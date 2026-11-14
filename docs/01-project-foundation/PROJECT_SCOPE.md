# Project scope

**Status:** Proposed — requires approval by the project team  
**Source:** `Albo_Project_Proposal.docx`, project conversation, and current requirements

## 1. Scope purpose

This document defines what Albo will pursue, what it will postpone, and what it will not become. It prevents the proposal's broad vision from turning into an unmanageable first release.

The scope is intentionally progressive. A capability may appear in the product vision without being part of the first implementation.

## 2. Product boundary

Albo is a preventive digital-health platform for health information, risk indication, wellbeing support, environmental awareness, healthcare navigation, and authorized provider communication.

Albo is not an autonomous doctor, diagnostic authority, emergency-response service, replacement for clinical care, or unrestricted social-media platform.

## 3. First release scope

The first release should establish a safe, usable foundation and prove a small number of complete user journeys.

### 3.1 Platform foundation

- Responsive web application
- User registration, authentication, and account recovery
- User profiles and role foundations
- Consent capture and consent-aware access
- Basic authorization and audit events
- Secure configuration and environment separation
- Documentation, testing, and synthetic development data

### 3.2 Citizen journey

- Landing page explaining Albo's purpose and limitations
- Privacy-aware onboarding
- Health and lifestyle profile using a deliberately limited set of approved fields
- Citizen dashboard with understandable summaries
- Wellbeing or stress check-ins where the safety workflow is ready
- View of personal recommendations and risk indicators
- Access to relevant facilities and providers
- Basic notification preferences

### 3.3 Preventive intelligence

- Rule-based and weighted risk indicators
- A small, explicitly approved set of health-risk use cases
- Display of contributing factors, source data, timestamp, limitations, and next steps
- Clear distinction between a risk indicator and a medical diagnosis
- Synthetic-data evaluation before any production health-data workflow

### 3.4 Healthcare access

- Facility and provider directory
- Location-aware facility discovery with privacy controls
- Basic map and direction experience
- Defined referral or contact workflow
- Provider access only after roles, consent, and permissions are approved

### 3.5 Reporting

- Basic personal trend view
- Printable report for approved information
- Provenance showing whether data is self-reported, imported, or generated

## 4. Deliberately limited in the first release

These capabilities may be represented in the design, but should not expand the first release without an approved requirement and owner:

- Multiple disease-risk models beyond the initial validated use cases
- Continuous monitoring from many external devices
- Full electronic health-record exchange
- Live video consultations and complex provider operations
- Community-wide outbreak intelligence using identifiable records
- Automated recommendations that require clinical judgment
- Multilingual support beyond the first agreed language set
- Large-scale data ingestion from many environmental providers

## 5. Later phases

### Phase 2 — Expanded platform services

- Additional approved health and environmental data sources
- More facility, pharmacy, consultant, and community-health workflows
- Contextual notifications and alert configuration
- Expanded reports and longitudinal analytics
- Mental-wellness hub with reviewed escalation and referral procedures
- Improved maps and regional health visualizations

### Phase 3 — Advanced intelligence and integration

- Machine-learning models only after data quality and clinical validation
- Model monitoring, fairness evaluation, versioning, and rollback
- Connected-device integrations such as Apple Health, Google Fit, or Fitbit where access and consent are available
- Electronic health-record interoperability such as FHIR after partner requirements are defined
- Multilingual and accessibility improvements
- Organization and public-health reporting using properly aggregated or authorized data

### Phase 4 — Scale and ecosystem integration

- Native mobile applications if mobile-specific requirements justify them
- Independent service extraction where scale, isolation, or ownership requires it
- Broader healthcare partnerships and regional expansion
- Production optimization, disaster recovery, and mature governance

## 6. Explicitly out of scope

The following are not part of the current Albo scope:

- Autonomous diagnosis, prescribing, or treatment decisions
- Presenting model output as confirmed disease status
- Replacing emergency services or qualified healthcare professionals
- Training and operating a proprietary large language model as the initial approach
- Using real patient records in local development, demonstrations, fixtures, or prompts
- Selling or sharing personal health data without an approved legal, consent, and governance basis
- Exposing `auth.users` or other private identity data directly to clients
- A general worldwide news, Google Trends, or social-media content-creation product
- Scraping TikTok, Instagram, X, or other platforms outside their permitted APIs and terms
- Kubernetes or a large microservice fleet before operational requirements justify it
- Multiple primary databases without a documented need

General news or environmental feeds may later support public-health context, but they must not automatically become clinical evidence or risk-score input. Any content-creation or trend-monitoring feature would require a separate product decision.

## 7. Scope controls

Every new feature must answer:

1. Which user and problem does it serve?
2. Is it first release, later phase, or out of scope?
3. What data does it require and who may access it?
4. Does it affect clinical safety, privacy, consent, or provider responsibility?
5. What external dependency, cost, and operational burden does it add?
6. How will it be tested and measured?
7. Which requirements, architecture documents, and decisions must change?

No feature should enter implementation only because it is technically interesting or present in the original vision.

## 8. Scope completion criteria

The initial scope is complete only when:

- The first user journeys are approved and documented.
- The selected risk indicators have defined inputs, rules, limitations, and evaluation plans.
- Consent, authorization, audit, and data-retention behavior are reviewed.
- APIs, data structures, and integrations have documented contracts.
- Synthetic-data tests cover critical behavior and safety boundaries.
- The team agrees which later capabilities remain postponed.

## 9. Decisions required before implementation

- First release geography, language, and target users
- First release risk use cases and clinical reviewers
- Approved environmental, facility, and health-data sources
- Whether the first release includes provider access or only facility discovery
- Mental-wellness support and emergency/self-harm escalation process
- Retention, deletion, export, and consent withdrawal behavior
- Applicable legal, regulatory, and institutional requirements
- Success metrics, baseline, and evaluation population
