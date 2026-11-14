# Albo UI/UX specification

**Status:** Draft — product and interaction direction  
**Source:** `Albo_Project_Proposal.docx`, approved scope and requirements, and existing design work  
**Related:** [Project overview](../01-project-foundation/PROJECT_OVERVIEW.md), [Project scope](../01-project-foundation/PROJECT_SCOPE.md), [Requirements](../01-project-foundation/REQUIREMENTS.md), [API documentation](API_DOCUMENTATION.md)

## 1. Purpose

This document describes how people should experience Albo across the first-release web application. It translates product requirements into screens, journeys, interaction rules, safety language, accessibility expectations, and reusable interface behavior.

It does not replace the final Figma design system or usability testing. Visual styling, brand assets, and exact layouts remain open until the design is reviewed and approved.

## 2. Experience goals

Albo should feel:

- Trustworthy when handling personal health information
- Simple enough for people with different levels of health and technology literacy
- Supportive without pretending to be a clinician
- Calm when showing risk or uncertainty
- Actionable when a user needs preventive guidance or healthcare access
- Transparent about data sources, consent, limitations, and freshness
- Accessible on mobile-sized screens and desktop screens

The interface should reduce cognitive load. It should help a user answer: “What does this mean?”, “Why am I seeing it?”, “How recent is it?”, and “What can I do next?”

## 3. Primary user roles

| Role | Main experience | Access principle |
|---|---|---|
| Citizen | Onboarding, profile, dashboard, risk, facilities, reports | Personal data and approved recommendations |
| Family member | Assisted experience where enabled | Only explicitly authorized information |
| Healthcare provider | Assigned citizen or community view | Role, assignment, consent, and purpose limited |
| Facility/pharmacy user | Organization and service workflows | Organization-scoped information |
| Community health worker | Approved community or assigned-person workflows | Minimum necessary access |
| Platform administrator | Configuration and account operations | No automatic unrestricted health access |

## 4. Information architecture

### Citizen navigation

The first-release navigation should remain small:

```text
Home / Dashboard
  ├─ My health inputs
  ├─ Risk indicators
  ├─ Wellbeing check-ins
  ├─ Find care
  ├─ Reports
  └─ Settings
       ├─ Profile
       ├─ Consent and privacy
       ├─ Notifications
       └─ Account
```

The assistant may be a primary action or a dedicated section only after its safety and escalation workflow is approved.

### Provider navigation

```text
Provider home
  ├─ Assigned people / approved community view
  ├─ Person overview
  ├─ Trends and risk indicators
  ├─ Follow-up / referral workflow
  ├─ Consultations, if approved
  └─ Organization settings
```

Provider navigation must not expose people or records merely because the provider is authenticated.

## 5. Screen inventory

### First-release screens

| Screen | Purpose | Required behavior |
|---|---|---|
| Landing page | Explain Albo and its boundaries | Clear purpose, privacy summary, and sign-in/register actions |
| Sign in / account recovery | Authenticate users | Safe errors that do not reveal account existence |
| Onboarding | Establish trust and collect approved setup data | Explain consent, data use, AI limitations, and optional fields |
| Consent center | Manage purposes and data categories | Show status, version, date, purpose, and withdrawal behavior |
| Profile and health inputs | View and edit permitted information | Validate fields, show source and date, support correction |
| Citizen dashboard | Summarize the user's approved information | Show trends, indicators, environmental context, recommendations, and freshness |
| Risk detail | Explain one indicator | Show level, factors, timestamp, rule version where appropriate, limitations, and next step |
| Find care | Search facilities and providers | Show service information, source freshness, location guidance, and safe fallback |
| Notification settings | Control approved notifications | Respect consent, categories, quiet hours, and channel availability |
| Reports | View and request personal reports | Show status, date range, provenance, limitations, and private download |
| Account settings | Manage account and privacy actions | Show deletion, export, correction, and sign-out options according to policy |

### Later or gated screens

- AI assistant conversation
- Dedicated mental-wellness hub
- Provider portal and assigned-person detail
- Referral and consultation workflows
- High-risk-zone and regional health maps
- Device connection management
- EHR/interoperability workflows
- Public-health or organization dashboards

These screens must not be implemented as committed product scope until their requirements, safety, permissions, and data sources are approved.

## 6. Core citizen journey

```text
Landing page
   ↓
Sign up / sign in
   ↓
Privacy and AI explanation
   ↓
Consent selection
   ↓
Limited profile setup
   ↓
Dashboard
   ↓
Add or review inputs
   ↓
View indicator and explanation
   ↓
Find appropriate care or next step
   ↓
Review trends / request report
```

### Journey rules

- The user can understand why information is requested before submitting it.
- Optional fields are visibly optional.
- The user can pause onboarding and return later where technically possible.
- Incomplete data does not silently produce a reassuring result.
- The system tells the user when information is stale, missing, estimated, or unavailable.
- Every important risk result has a visible next step and limitation.

## 7. Dashboard design

The dashboard should prioritize the user's current needs rather than expose every data point at once.

Suggested order:

1. Welcome and current context
2. Important action or safety message, if present
3. Risk-indicator summary
4. Explanation and recommended next step
5. Wellbeing or lifestyle trend summary
6. Environmental context with source and freshness
7. Find-care action
8. Recent activity and report action

The dashboard must not imply that a lack of displayed risk means a person is healthy or safe. Use wording such as “No current indicator available for this use case” when data is insufficient.

## 8. Risk-indicator presentation

Every risk indicator should include:

- A plain-language title
- A clearly defined status or level
- Date and time of calculation
- Data freshness where relevant
- Main contributing factors
- What information was used at a high level
- Limitations and uncertainty
- A preventive next step
- A route to appropriate human or emergency support when required

### Required language boundary

Use:

> “Albo identified an elevated preventive risk indicator based on the available information.”

Do not use:

> “You have this disease.”

The interface must visibly state that a risk indicator is not a diagnosis or a substitute for qualified care.

### Visual rules

- Never use color as the only indication of level.
- Pair color with text, icon, label, and accessible contrast.
- Avoid alarming animation, flashing, or countdowns for ordinary risk information.
- Use neutral styling for unavailable or insufficient data rather than treating it as low risk.
- Use consistent levels across the product only after the risk vocabulary is approved.

## 9. Consent and privacy experience

Consent should be understandable and specific, not hidden in a long generic agreement.

Each consent item should show:

- What information is involved
- Why Albo wants it
- Who may use it
- Whether it is required or optional
- How long it may be retained, where known
- What happens if the user withdraws it
- Current status and version
- A clear withdrawal action

Do not use dark patterns, preselected sensitive permissions, confusing double negatives, or pressure language for optional health data.

## 10. Assistant and wellbeing experience

If enabled, the assistant should:

- Introduce itself as an AI support tool
- State that it is not a doctor or emergency service
- Use plain, calm, non-judgmental language
- Ask only necessary questions
- Avoid pretending to know a user's record when it does not
- Link to the relevant source or dashboard explanation where possible
- Offer human or emergency escalation when safety signals appear
- Avoid displaying private health information in shared-device previews

The assistant must not diagnose, prescribe, fabricate records, guarantee a prediction, or make the user believe that conversation alone provides emergency care.

## 11. Find-care and map experience

Facility cards should show, where available:

- Facility name and type
- Services
- Approximate location or address
- Contact method
- Opening or availability information only when sourced and current
- Source and last-updated time
- Directions action
- Data limitation or verification note

If maps or directions fail, the user should still receive stored facility details. Precise user location must be optional and purpose-limited.

## 12. Provider experience

Provider screens must show the scope of access and avoid presenting AI outputs as clinical conclusions.

A provider person-overview screen should distinguish:

- User-reported information
- Imported information
- Provider-recorded information
- Rule-generated indicators
- Clinically confirmed information, if an approved source exists

Provider actions such as follow-up, referral, or consultation must be explicit and auditable. A provider must not silently overwrite a citizen's source input or alter a historical risk assessment.

## 13. Reports

Reports should include:

- Person and report date, subject to privacy policy
- Selected time range
- Data sources and provenance
- Trends and risk indicators
- Rule/model version where relevant
- Limitations and unavailable data
- Clear distinction between self-reported, imported, generated, and clinically confirmed information
- Appropriate next-step or care disclaimer

Downloads must use private, authorized access. Report links should expire where appropriate.

## 14. Reusable interface states

Every data-dependent component must define these states:

| State | User-facing behavior |
|---|---|
| Loading | Explain what is being loaded; avoid indefinite spinner |
| Empty | Explain why no data exists and offer a useful next action |
| Incomplete | Identify missing information and its effect |
| Stale | Show last-updated time and avoid implying current accuracy |
| Limited | Explain that an output is constrained by available information |
| Unavailable | State that the service or source is unavailable; never fabricate data |
| Unauthorized | Show a safe denial without confirming another person's record |
| Error | Give a safe recovery action and request ID where useful |
| Success | Confirm the action and explain what happens next |
| Offline/degraded | Preserve local form safety and clearly mark unsent or unavailable data |

## 15. Accessibility and responsive behavior

- Use semantic HTML and meaningful heading order.
- Support keyboard navigation and visible focus states.
- Meet an agreed accessibility target before release.
- Provide labels and instructions for every form field.
- Associate validation errors with the relevant fields.
- Ensure text and controls have sufficient contrast.
- Do not communicate meaning through color, position, or animation alone.
- Support zoom and small-screen layouts without hiding critical warnings.
- Use plain language and explain domain terms.
- Provide alternatives for maps, charts, icons, and non-text content.
- Test with representative users and assistive technologies where possible.

## 16. Responsive layout guidance

The first release is a responsive web application:

- Mobile layouts prioritize one main action per section.
- Desktop layouts may use two-column summaries, but critical warnings remain prominent.
- Tables should become readable cards or horizontal scroll regions on small screens.
- Maps must have a list alternative.
- Reports and long explanations must remain readable without horizontal scrolling.
- Touch targets must be large enough for reliable use.

## 17. Design-system guidance

The final design system should define:

- Color tokens and semantic status colors
- Typography scale
- Spacing and layout tokens
- Buttons, links, inputs, selects, dialogs, cards, alerts, tables, tabs, and navigation
- Risk-indicator components
- Consent and privacy components
- Source, freshness, and limitation badges
- Empty, loading, stale, and error states
- Responsive breakpoints
- Accessibility behavior

Components should be implemented once and reused. A component may not hide important health limitations or authorization information.

## 18. Privacy-preserving UI telemetry

Product analytics may measure navigation, performance, feature use, and errors only when approved. Do not send raw health inputs, risk details, assistant messages, precise location, email addresses, or consent text to analytics tools by default.

Useful events should use opaque IDs and broad categories, for example:

- `onboarding_completed`
- `risk_detail_viewed` with approved use-case category only
- `facility_search_started`
- `report_requested`
- `notification_preference_updated`

Every event requires a privacy review before implementation.

## 19. Figma-to-implementation handoff

For each approved screen, design handoff should include:

- User role and journey
- Linked requirement IDs
- Screen states and edge cases
- Responsive layouts
- Accessibility annotations
- Content and safety language
- Data fields and API resource mapping
- Loading, empty, stale, unavailable, and error states
- Permission and consent behavior
- Prototype acceptance notes

The external design folder referenced in the proposal is a design input, not an API or engineering contract. It must be reviewed and reconciled with this documentation before implementation.

## 20. UI/UX acceptance criteria

The first-release design is ready for implementation when:

- Citizen and provider roles have approved journeys.
- Every first-release screen maps to approved requirements.
- Consent and data-use explanations are approved.
- Risk-indicator language and visual levels are approved.
- All required states are designed.
- Accessibility and responsive behavior are specified.
- API data, authorization, and empty/error behavior are mapped.
- Usability review identifies no unresolved critical safety or privacy issue.

## 21. Open design decisions

- Final visual identity, color palette, and typography
- First-release language and localization approach
- Exact dashboard information hierarchy
- First-release risk-level vocabulary and wording
- Whether the assistant is included in the first release
- Whether provider screens are included in the first release
- Map provider and map interaction design
- Emergency and self-harm escalation content
- Accessibility target and testing tools
- Approved analytics and telemetry approach
