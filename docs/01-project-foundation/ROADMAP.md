# Albo roadmap

**Status:** Proposed — sequence, ownership, dates, and release targets require team agreement  
**Related documents:** [Project scope](PROJECT_SCOPE.md), [Requirements](REQUIREMENTS.md), [Project overview](PROJECT_OVERVIEW.md)

## 1. How to use this roadmap

This roadmap describes the order in which Albo should reduce uncertainty, establish safety, and deliver value. It is not a promise of dates or a commitment to build every capability in the proposal.

Each phase has:

- A purpose
- Expected outputs
- A completion gate
- Dependencies and risks

Work should move to the next phase only when its gate is reviewed and accepted. A feature that is not required for the current phase remains documented as future scope rather than entering implementation informally.

## 2. Current position

**Phase 0 — Documentation and product foundation**

The repository currently contains the initial product overview, scope, requirements, and architecture direction. The next work is to review these documents with the team, resolve open decisions, and convert approved requirements into implementation-ready work.

## 3. Roadmap phases

### Phase 0 — Product foundation and agreement

**Purpose:** Establish a shared understanding before implementation.

**Outputs:**

- Approved product overview
- Approved first-release scope and exclusions
- Prioritized requirements with owners and acceptance tests
- Confirmed actors and first user journeys
- Initial success measures and evaluation approach
- List of legal, clinical, privacy, and operational questions

**Completion gate:** The team agrees what the first release is, who it serves, what it must not do, and how success and safety will be evaluated.

**Dependency:** Proposal review by the project team and appropriate health stakeholders.

### Phase 1 — Architecture and engineering foundation

**Purpose:** Turn approved product requirements into a buildable technical design.

**Outputs:**

- Approved modular-monolith and AI-service boundaries
- Confirmed technology stack and repository structure
- Conceptual database model and migration approach
- API conventions and initial contracts
- Authentication, authorization, consent, and audit design
- External integration inventory and failure strategy
- Local development and environment-configuration approach
- Initial testing and deployment approach

**Completion gate:** A developer can implement the first vertical slice without inventing core architecture, data ownership, security behavior, or API conventions.

**Dependency:** Phase 0 approval.

### Phase 2 — Core platform foundations

**Purpose:** Build the secure platform capabilities required by every later feature.

**Outputs:**

- Responsive web application shell
- Authentication and account recovery
- User profile and role foundations
- Consent capture, review, and withdrawal foundations
- Authorization middleware and protected routes
- Audit-event foundations
- Secure configuration and environment separation
- Database migrations, seed strategy, and synthetic fixtures
- Automated tests for identity and access boundaries

**Completion gate:** A citizen can safely create and access an account, manage permitted profile data, and demonstrate that unauthorized users cannot access protected information.

**Dependency:** Approved architecture, security design, and identity provider configuration.

### Phase 3 — First preventive-health release

**Purpose:** Deliver a small, complete citizen journey using transparent and bounded functionality.

**Outputs:**

- Privacy-aware onboarding
- Limited approved health, lifestyle, and wellbeing profile
- Citizen dashboard
- Initial rule-based or weighted risk indicators
- Risk explanations, provenance, timestamps, limitations, and next steps
- Facility and provider directory
- Location-aware discovery with privacy controls
- Basic notification preferences
- Personal trend view and printable report

**Completion gate:** A representative user can complete the approved journey from onboarding to a risk indicator, understand its limitations, find appropriate services, and generate a report using synthetic or approved test data.

**Dependencies:** Approved first-release use cases, data fields, risk rules, facility data, safety review, and acceptance tests.

### Phase 4 — Validation and production readiness

**Purpose:** Establish evidence that the first release is safe, reliable, usable, and supportable.

**Outputs:**

- Functional, integration, contract, and end-to-end test results
- Authorization and privacy testing
- Usability and accessibility findings
- Risk-rule evaluation and limitations report
- AI safety evaluation if assistant functionality is included
- Performance and failure-recovery results
- Monitoring, alerting, backup, restoration, and incident procedures
- Data-retention and consent-withdrawal verification
- Release checklist and rollback plan

**Completion gate:** The team can explain known risks, limitations, operational responsibilities, and rollback procedures, and an authorized reviewer accepts the release evidence.

**Dependency:** A working first-release implementation and approved security/privacy review.

### Phase 5 — Expanded platform services

**Purpose:** Extend the product only after the first release is validated.

**Possible outputs:**

- Additional approved environmental and health-data sources
- Contextual notifications and alert configuration
- Expanded facility, pharmacy, consultant, and community-health workflows
- Mental-wellness hub with reviewed escalation and referral procedures
- AI assistant for approved preventive-health and wellbeing interactions
- Improved maps and regional health visualizations
- Expanded longitudinal reports

**Completion gate:** Each added service has an approved requirement, data-protection review, safety behavior, owner, test plan, and operational cost assessment.

### Phase 6 — Advanced intelligence and interoperability

**Purpose:** Introduce more complex data and models only when evidence supports them.

**Possible outputs:**

- Machine-learning models for approved use cases
- Model monitoring, calibration, fairness evaluation, versioning, and rollback
- Connected-device integrations such as Apple Health, Google Fit, or Fitbit
- Electronic health-record interoperability such as FHIR
- Multilingual and expanded accessibility support
- Aggregated public-health reporting

**Completion gate:** Clinical and technical reviewers approve the model or integration based on representative data, documented limitations, privacy controls, and monitoring evidence.

### Phase 7 — Scale and ecosystem integration

**Purpose:** Expand Albo's operational reach after product-market, safety, and reliability evidence exists.

**Possible outputs:**

- Native mobile applications where mobile requirements justify them
- Broader partnerships with hospitals, pharmacies, community health workers, and public-health organizations
- Regional expansion beyond the first geography
- Independent service extraction where scale, isolation, or ownership requires it
- Mature disaster recovery, governance, and service-level practices

**Completion gate:** Expansion has an identified operating model, support ownership, funding/cost plan, legal and clinical governance, and measurable benefit.

## 4. Cross-phase workstreams

These activities continue throughout the roadmap:

- Documentation and decision records
- Security, privacy, and threat review
- Consent and access-control review
- Synthetic-data and test-fixture management
- Usability and accessibility testing
- Observability without sensitive payload logging
- Clinical and public-health stakeholder review where relevant
- Cost, dependency, and operational-risk review

## 5. Roadmap rules

1. Documentation, implementation, and tests must evolve together.
2. No AI feature enters production without safety evaluation and an escalation path.
3. No advanced model replaces the initial explainable risk engine without evidence and approval.
4. No external data source becomes a clinical input merely because it is available.
5. Real patient data is not used in development or demonstrations.
6. A phase may be split into smaller increments; scope may not expand without a recorded decision.
7. Dates should be added only after effort, ownership, dependencies, and review capacity are known.

## 6. Decisions required to schedule the roadmap

- First-release target users, geography, and language
- First-release risk use cases and clinical reviewers
- Team capacity and ownership per phase
- Approved identity, map, environmental, facility, and messaging providers
- Clinical, privacy, regulatory, and institutional review path
- Definition of first-release success and minimum evidence for expansion
- Hosting, budget, support, and operational constraints
