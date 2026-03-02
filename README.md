# Campaign Manager Mock Frontend (n8n + Gmail)

This project is a static frontend prototype. It currently uses `window.MockData` (from `mock-data.js`) and in-memory state mutations in `app.js`.

This README is now an implementation guide for replacing every mock call/state mutation with real backend API calls.

## Scope
- Frontend path: `/Users/axi/Documents/email-automation/mock-frontend`
- Data source today: `/Users/axi/Documents/email-automation/mock-frontend/mock-data.js`
- Behavior today: local-only in-memory state in `/Users/axi/Documents/email-automation/mock-frontend/app.js`

## Current Mock Data Contract (Source of Truth Today)
`window.MockData` is initialized in `mock-data.js` and consumed in `buildInitialState()`.

Current object keys:
- `campaign`
- `campaigns`
- `campaignEnrollments`
- `events`
- `contacts`
- `defaultSequence`
- `timezoneOptions`

## Backend Replacement Strategy
Create a thin API client layer (for example `api.js`) and move all reads/writes out of UI handlers.

Recommended client responsibilities:
- Handle auth headers and base URL
- Normalize response shapes
- Convert network errors into user-safe messages
- Provide idempotency key support for write operations

## Exhaustive List: What Must Be Replaced By Backend API Calls

### 1) Initial app bootstrap reads
Replace `window.MockData` ingestion in:
- `buildInitialState()` (`app.js:66`)

With API calls:
1. `GET /api/campaigns?include=enrollmentCounts`
2. `GET /api/campaigns/{campaignId}` for active editing campaign
3. `GET /api/campaigns/{campaignId}/contacts?eligible=true`
4. `GET /api/campaigns/{campaignId}/sequence`
5. `GET /api/timezones`
6. `GET /api/campaigns/{campaignId}/enrollments`
7. `GET /api/campaigns/{campaignId}/events?limit=200`
8. `GET /api/campaigns/{campaignId}/drafts?status=pending,approved,rejected,sent`

### 2) Audience step (contacts + campaign setup)
#### Reads
Replace local filters against `state.contacts` in:
- `getFilteredContacts()` (`app.js:619`)
- `getVisibleEligibleContacts()` (`app.js:673`)

Use server-side query support:
- `GET /api/campaigns/{campaignId}/contacts?search=&field=&source=&eligibility=&suppressed=`

#### Writes
Replace local selection/campaign updates in:
- `selectAllVisibleEligible()` (`app.js:1094`)
- `clearVisibleSelection()` (`app.js:1111`)
- contact toggle branch in `handleChange()` (`app.js:2664`)
- campaign field branch in `handleInput()` (`app.js:2491`)

With API calls:
- `PUT /api/campaigns/{campaignId}/audience/selection`
  - body: `{ contactIds: string[] }`
- `PATCH /api/campaigns/{campaignId}`
  - body: `{ name?, timezone?, sendWindowStart?, sendWindowEnd?, startDate? }`

### 3) Sequence builder
#### Writes
Replace in-memory sequence changes in:
- `saveSequence()` (`app.js:1235`)
- `addStep()` (`app.js:1279`)
- `removeStep()` (`app.js:1313`)
- `setStepComposeMode()` (`app.js:1361`)
- sequence field branch in `handleInput()` (`app.js:2491`)

With API calls:
- `PUT /api/campaigns/{campaignId}/sequence`
  - body: `{ steps: SequenceStep[] }`
- optional granular endpoints if preferred:
  - `POST /api/campaigns/{campaignId}/sequence/steps`
  - `PATCH /api/campaigns/{campaignId}/sequence/steps/{stepIndex}`
  - `DELETE /api/campaigns/{campaignId}/sequence/steps/{stepIndex}`

#### Personalized generation
Replace deterministic mock generation in:
- `generatePersonalizedTemplate()` (`app.js:1386`)
- `buildPersonalizedTemplateFromPrompt()` (`app.js:558`)

With API call:
- `POST /api/campaigns/{campaignId}/sequence/steps/{stepIndex}/generate`
  - body: `{ personalizationPrompt: string, previewContactId?: string }`
  - response: `{ subject: string, body: string, generationMeta: { strategy, model, rewrittenAt, notesSignals[] } }`

### 4) Approval + campaign start
Replace local approval/start flow in:
- `confirmStartCampaign()` (`app.js:1159`)
- `startCampaignFromApproval()` (`app.js:1164`)

With API calls:
- `POST /api/campaigns/{campaignId}/approve-and-start`
  - body: `{ approvedBy: string }`
  - response: `{ campaign, enrollmentsCreated, startedAt }`

### 5) Send cycle + scheduler behavior
Replace simulated send engine in:
- `runSendCycle()` (`app.js:1427`)
- `executeSend()` (`app.js:1048`)
- `createDraft()` (`app.js:1004`)
- `getDuePendingDrafts()` (`app.js:1034`)

With backend ownership:
- `POST /api/campaigns/{campaignId}/run-send-cycle` (manual trigger, admin/testing)
- production mode should rely on worker/cron queue rather than frontend-triggered sends
- `GET /api/campaigns/{campaignId}/drafts?due=true`

### 6) Simulation-only controls (for demo/UAT)
Replace or remove in production:
- `advanceDay()` (`app.js:1517`)
- `simulateHumanReply()` (`app.js:1540`)
- `simulateOOOReply()` (`app.js:1563`)

If kept for test environments only:
- `POST /api/test/campaigns/{campaignId}/advance-day`
- `POST /api/test/enrollments/{enrollmentId}/simulate-reply` with `{ type: "human" | "ooo" }`

### 7) Campaign and contact status management
Replace status changes in:
- `setCampaignStatus()` (`app.js:1582`)
- `setContactStatusInCampaign()` (`app.js:1678`)
- `confirmStatusChange()` (`app.js:1983`)

With API calls:
- `PATCH /api/campaigns/{campaignId}/status`
  - body: `{ status: "ACTIVE" | "STOPPED" | "COMPLETED" }`
- `PATCH /api/campaigns/{campaignId}/enrollments/{enrollmentId}/status`
  - body: `{ status: "ACTIVE" | "STOPPED" | "COMPLETED" }`

### 8) Draft approval queue actions
Replace local queue mutations in:
- `confirmBulkApprovalDue()` (`app.js:1849`)
- `approveDraft()` (`app.js:1875`)
- `rejectDraft()` (`app.js:1889`)
- `regenerateDraft()` (`app.js:1903`)

With API calls:
- `POST /api/campaigns/{campaignId}/drafts/bulk-approve-due`
- `PATCH /api/drafts/{draftId}` with `{ approvalStatus: "approved" | "rejected" }`
- `POST /api/drafts/{draftId}/regenerate`

### 9) Remove / undo / re-add contact from campaign
Replace local contact safety actions in:
- `confirmRemoval()` (`app.js:2041`)
- `undoRemoveContact()` (`app.js:2081`)
- `readdContact()` (`app.js:2112`)

With API calls:
- `POST /api/campaigns/{campaignId}/enrollments/{enrollmentId}/remove`
  - body: `{ reason: string }`
  - response includes `undoToken` and `undoExpiresAt`
- `POST /api/campaigns/{campaignId}/enrollments/{enrollmentId}/undo-remove`
  - body: `{ undoToken: string }`
- `POST /api/campaigns/{campaignId}/enrollments/{enrollmentId}/readd`

### 10) Campaign status workspace reads
Replace local campaign/enrollment/event reads in:
- `selectStatusCampaign()` (`app.js:1790`)
- KPI/event derivation in:
  - `getEventsForCampaign()` (`app.js:3625`)
  - `computeCampaignMetrics()` (`app.js:3647`)
  - `computeCampaignRecentEvents()` (`app.js:3682`)
  - `renderKpiSection()` (`app.js:3697`)

With API calls:
- `GET /api/campaigns`
- `GET /api/campaigns/{campaignId}/enrollments?status=`
- `GET /api/campaigns/{campaignId}/metrics`
- `GET /api/campaigns/{campaignId}/events?limit=20`

## Recommended API Surface (Consolidated)

### Campaigns
- `GET /api/campaigns`
- `POST /api/campaigns`
- `GET /api/campaigns/{campaignId}`
- `PATCH /api/campaigns/{campaignId}`
- `PATCH /api/campaigns/{campaignId}/status`
- `POST /api/campaigns/{campaignId}/approve-and-start`

### Audience / Contacts
- `GET /api/campaigns/{campaignId}/contacts`
- `PUT /api/campaigns/{campaignId}/audience/selection`

### Sequence
- `GET /api/campaigns/{campaignId}/sequence`
- `PUT /api/campaigns/{campaignId}/sequence`
- `POST /api/campaigns/{campaignId}/sequence/steps/{stepIndex}/generate`

### Enrollments
- `GET /api/campaigns/{campaignId}/enrollments`
- `PATCH /api/campaigns/{campaignId}/enrollments/{enrollmentId}/status`
- `POST /api/campaigns/{campaignId}/enrollments/{enrollmentId}/remove`
- `POST /api/campaigns/{campaignId}/enrollments/{enrollmentId}/undo-remove`
- `POST /api/campaigns/{campaignId}/enrollments/{enrollmentId}/readd`

### Drafts
- `GET /api/campaigns/{campaignId}/drafts`
- `PATCH /api/drafts/{draftId}`
- `POST /api/drafts/{draftId}/regenerate`
- `POST /api/campaigns/{campaignId}/drafts/bulk-approve-due`

### Events & Metrics
- `GET /api/campaigns/{campaignId}/events`
- `GET /api/campaigns/{campaignId}/metrics`

### Timezone metadata
- `GET /api/timezones`

## Required Backend Domain Entities
- `Campaign`
- `Contact`
- `CampaignEnrollment` (campaign-scoped contact state)
- `SequenceStep`
- `DraftApprovalItem`
- `CampaignEvent`

## Minimum Response Shape Expectations

### Campaign
```json
{
  "id": "cmp_001",
  "name": "Q2 Pipeline Expansion",
  "timezone": "Europe/Madrid",
  "sendWindowStart": "09:00",
  "sendWindowEnd": "17:00",
  "startDate": "2026-03-02",
  "status": "DRAFT",
  "startedAt": null
}
```

### Enrollment
```json
{
  "id": "enr_001",
  "campaignId": "cmp_001",
  "contactId": "ct_001",
  "status": "ACTIVE",
  "currentStep": 1,
  "nextSendDay": 0,
  "nextSendAt": "2026-03-02T09:00:00.000Z",
  "gmailThreadId": "thread_ct_001",
  "threadState": "Not sent yet",
  "lastSentStep": 0,
  "removedReason": null,
  "removedBy": null,
  "removedAt": null
}
```

### Draft
```json
{
  "id": "drf_001",
  "enrollmentId": "enr_001",
  "contactId": "ct_001",
  "stepIndex": 1,
  "sourceMode": "generic",
  "isStale": false,
  "subjectDraft": "Quick idea for Acme",
  "bodyDraft": "Hi ...",
  "approvalStatus": "pending",
  "createdAt": "2026-03-02T09:00:00.000Z",
  "updatedAt": "2026-03-02T09:00:00.000Z"
}
```

## Frontend Refactor Checklist
1. Add `api.js` and centralize all HTTP requests.
2. Replace `window.MockData` bootstrap with `Promise.all` API bootstrap reads.
3. Replace every mutation function listed above to call backend first, then update UI from response.
4. Remove direct event synthesis via `recordEvent()` from frontend; event creation should come from backend side effects.
5. Keep UI-only state local (`expanded panels`, `selected tab`, `modal open/closed`).
6. Add loading and retry states for each async action.
7. Add optimistic updates only for low-risk actions (filters/tabs), not for destructive actions (remove/status changes).

## Production Rules
- Frontend must never send email directly.
- Frontend must never be source of truth for campaign status transitions.
- Send scheduling and progression must be backend-controlled and idempotent.
- Every write endpoint should be authenticated and audited (`actor`, timestamp, change set).

## Local Run (Current Mock)
1. Open `/Users/axi/Documents/email-automation/mock-frontend/index.html` in a browser.
2. No backend is required for current mock mode.

## Known Gap After Backend Integration
When you migrate fully to backend APIs, remove `mock-data.js` script inclusion from `index.html` and delete all fallback behavior in `buildInitialState()` that assumes `window.MockData`.
