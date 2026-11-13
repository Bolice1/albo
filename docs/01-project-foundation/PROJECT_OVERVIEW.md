# Albo project overview

**Status:** Draft — product source: `Albo_Project_Proposal.docx`  
**Project:** Albo  
**Team:** Apex Phantoms, Rwanda Coding Academy

## 1. Executive summary

Albo is an AI-powered preventive digital health hub. Its purpose is to help people identify possible health risks earlier, understand factors that may influence those risks, receive preventive guidance, and connect with appropriate healthcare services.

Albo combines consent-based information from environmental and climate conditions, lifestyle and behavior, clinical and health history, stress and emotional-wellbeing check-ins, physical activity and diet, location-based exposure, optional connected devices, and optional electronic health records where an authorized integration exists.

The platform is intended to support citizens, families, healthcare providers, hospitals, pharmacies, community health workers, and approved health partners. It supports a shift from reactive healthcare toward earlier prevention and better access to health information.

## 2. Problem being addressed

The proposal identifies a recurring gap: people often seek healthcare only after symptoms become severe. Environmental exposure, lifestyle, mental wellbeing, limited access to guidance, and delayed intervention can increase the impact of preventable conditions.

In Rwanda and other resource-constrained settings, this challenge is made more difficult by limited healthcare capacity and unequal access to timely guidance. The proposal connects this problem to climate-related health risks, air pollution, communicable diseases, non-communicable diseases, and mental-health support gaps.

The problem Albo addresses is:

> People and healthcare workers need accessible, understandable, and consent-aware health intelligence that can support earlier preventive action and connection to care.

Statistics and impact estimates in the original proposal are project context. They must be independently verified before being used as validated product claims or evaluation baselines.

## 3. Product vision

Albo aims to make preventive health support more continuous, understandable, and accessible. A person should be able to:

1. Understand how Albo uses their information.
2. Provide or connect approved health, lifestyle, wellbeing, and environmental information.
3. View a simple picture of relevant trends and risk indicators.
4. Receive explanations and practical preventive recommendations.
5. Find nearby healthcare facilities or providers when additional support is needed.
6. Share permitted information with authorized healthcare professionals.
7. Review health trends over time through reports.

## 4. Intended users and stakeholders

### Citizens and families

Citizens use Albo to manage profiles, complete wellbeing check-ins, view risk indicators, understand environmental exposure, receive notifications, find care, communicate with approved providers, and generate personal reports.

### Healthcare providers

Healthcare providers use approved views of information belonging to people they support. They may monitor trends, review relevant analytics, recommend follow-up, schedule visits, or initiate remote consultations according to authorization and professional responsibilities.

### Hospitals, pharmacies, and consultants

These participants may provide facilities, services, consultations, referrals, or preventive support. Their visibility and actions must be controlled by explicit roles, permissions, consent, and organizational workflows.

### Community health workers and public-health partners

Approved partners may use aggregated or individually authorized information to support community awareness and preventive healthcare. This role does not automatically grant access to identifiable health information.

## 5. Proposed product capabilities

### Landing page and onboarding

The landing page introduces Albo's preventive-health purpose in clear language. Onboarding explains what information may be collected, why it is used, how consent works, how AI outputs should be interpreted, and how users can seek human support.

### Citizen dashboard

The dashboard is the user's main health-intelligence view. It presents simplified summaries of risk indicators, environmental exposure, stress and wellbeing trends, recommendations, and recent activity without requiring users to interpret complex clinical reports.

### Health and lifestyle profile

The profile may include approved information about lifestyle, diet, activity, stress, health history, chronic conditions, environmental exposure, and other relevant inputs. Each category requires clear consent, data minimization, and an appropriate access policy.

### Risk analysis

Albo is intended to analyze environmental, behavioral, clinical, and lifestyle information to generate preventive risk indicators for selected conditions. The proposal names malaria, cholera, respiratory illnesses, mental-wellness concerns, and non-communicable diseases as examples.

The first engineering implementation should use documented rules and weighted scoring. More advanced machine-learning models require reliable data, clinical review, representative evaluation data, fairness assessment, monitoring, and approved governance.

### AI assistant and mental-wellness hub

The assistant supports wellness check-ins, preventive-health questions, explanations, and navigation to appropriate services. The mental-wellness experience helps users reflect on stress, exhaustion, and emotional patterns and receive supportive guidance.

The assistant is not a doctor, emergency service, or replacement for qualified care. High-risk, emergency, or self-harm situations require clear escalation to appropriate human or emergency support.

### Environmental and high-risk-zone maps

Albo may combine environmental conditions, weather patterns, public-health information, and facility data to present geographic health intelligence. Maps should help users understand exposure and available services without exposing unnecessary precise location or identifying health information.

### Alerts and notifications

The notification system provides contextual preventive reminders and alerts based on approved inputs, user preferences, consent, and configured thresholds. Notifications should inform and encourage appropriate action without creating panic or presenting uncertain results as facts.

### Healthcare access and provider portal

When additional support is needed, Albo may recommend nearby hospitals, pharmacies, community health workers, or consultants and provide directions. Authorized providers may access permitted information, communicate with users, initiate consultations, and schedule follow-up actions.

### Reports and longitudinal analytics

Users may generate printable reports showing lifestyle patterns, environmental exposure, health trends, and risk indicators over a selected period. Reports must identify their source, time range, limitations, and whether information is self-reported, imported, rule-generated, or clinically confirmed.

## 6. Core user journey

```text
Discover Albo
      ↓
Understand privacy, consent, and limitations
      ↓
Create account and complete health/lifestyle setup
      ↓
View citizen dashboard
      ↓
Complete check-ins and connect approved data sources
      ↓
Receive risk indicators, explanations, and preventive guidance
      ↓
Explore environmental information and nearby services
      ↓
Connect with an authorized provider when needed
      ↓
Review trends and generate reports
```

The provider journey is permission-specific: a provider signs in, views only authorized people or community information, reviews relevant trends, chooses an appropriate professional follow-up, and records permitted actions.

## 7. Information used by Albo

| Domain | Examples from the proposal | Required control |
|---|---|---|
| Environmental | Weather, air quality, rainfall, location-based exposure | Source provenance and location minimization |
| Behavioral and lifestyle | Activity, diet, habits, stress check-ins | Consent and user control |
| Clinical | Health history, chronic conditions, electronic records | Strong authorization and clinical governance |
| Device and external data | Connected-health devices and approved integrations | Explicit connection and revocation |

Albo should record where information came from, when it was collected, whether it was user-provided or imported, and whether it is suitable for a particular risk calculation.

## 8. Development direction

The proposal describes a progressive delivery plan:

1. **Research and design:** define the problem, requirements, workflows, data structures, and UI/UX prototypes.
2. **Core infrastructure:** build authentication, database foundations, APIs, geolocation, maps, and environmental integrations.
3. **Health analytics:** implement rule-based and weighted risk indicators first, then evaluate whether machine learning is justified.
4. **Advanced services:** add the assistant, mental-wellness support, hotspot mapping, notifications, and provider recommendations.
5. **Optimization and ecosystem integration:** improve performance, privacy, multilingual access, scalability, and collaboration with healthcare organizations.

The repository's initial engineering direction is a modular monolith for core application workflows with a separate AI and analytics service. This is a proposed implementation approach, not a requirement to build every service immediately.

## 9. Expected impact

The proposal expects Albo to contribute to earlier awareness of possible health risks, better preventive-health behavior and health literacy, easier access to nearby healthcare services, improved communication between citizens and providers, better visibility of environmental and community health conditions, mental-wellbeing support, and a scalable preventive-health model for Rwanda and other resource-constrained settings.

Numerical impact targets must be treated as hypotheses until Albo defines a measurement plan, baseline, population, timeframe, and ethical evaluation process.

## 10. Product boundaries and safety commitments

- Albo provides preventive information and risk indicators, not confirmed diagnoses.
- AI output must not be the sole basis for treatment, denial of care, or emergency response.
- Users must be shown uncertainty, limitations, contributing factors, and appropriate next steps.
- Sensitive information must be collected only for a documented purpose and with appropriate consent.
- Healthcare-provider access must be authorized, scoped, and auditable.
- Real patient records, credentials, and private operational details must never appear in source code, documentation, fixtures, prompts, or logs.
- Development and evaluation must use synthetic or properly de-identified data.

## 11. Decisions still required

- First-release geography, language, and user groups
- First-release conditions and risk indicators
- Approved and available data sources in Rwanda
- Whether each source is used for health decisions, general context, or content creation
- Consent, retention, deletion, and export requirements
- Provider roles, responsibilities, and clinical governance
- Emergency and self-harm escalation partners and procedures
- Applicable legal, regulatory, and institutional requirements
- Success measures and validation methods
