# Email Automation Mock Frontend -> Backend Integration Guide

This repository currently runs as a static mock frontend and stores all state in memory.

- Frontend app: `/Users/axi/Documents/email-automation/mock-frontend`
- Main UI logic: `/Users/axi/Documents/email-automation/mock-frontend/app.js`
- Mock seed data: `/Users/axi/Documents/email-automation/mock-frontend/mock-data.js`

This README documents **all frontend areas that still need backend API integration**.

## Current Product Surface

The UI currently exposes:
1. Audience Setup (contacts + campaign setup)
2. Sequence
3. Campaign Approval
4. Campaigns Hub wizard
5. Campaigns Hub Step 4 Activity audit log

## End-to-End Flows

### Flow 1: Create campaign audience and setup
1. User opens Audience Step 1 and filters/searches contacts.
2. User selects eligible contacts.
3. User continues to Audience Step 2 and sets campaign fields (name, timezone, window, start date).
4. User continues to Sequence.

Backend calls in this flow:
- `GET /api/campaigns/{campaignId}/contacts?...` for table/filtering/pagination
- `PUT /api/campaigns/{campaignId}/audience/selection`
- `PATCH /api/campaigns/{campaignId}`

### Flow 2: Build sequence
1. User edits sequence steps (timing, subject/body, mode).
2. User optionally generates personalized content for a step.
3. User saves sequence and continues to approval.

Backend calls in this flow:
- `GET /api/campaigns/{campaignId}/sequence`
- `PUT /api/campaigns/{campaignId}/sequence`
- `POST /api/campaigns/{campaignId}/sequence/steps/{stepIndex}/generate`

### Flow 3: Approve and start campaign
1. User reviews approval summary and draft readiness.
2. User confirms start.
3. Campaign transitions to active lifecycle.

Backend calls in this flow:
- `GET /api/campaigns/{campaignId}/drafts`
- `POST /api/campaigns/{campaignId}/approve-and-start`

### Flow 4: Operate campaign in Campaigns Hub wizard
1. Step 1 Select Campaign: user picks campaign from list.
2. Step 2 Review Contacts: user filters contacts and sets contact status (`ACTIVE` or `STOPPED`).
3. Step 3 Review KPIs: user reviews campaign metrics.
4. Step 4 Activity: user reviews audit-log events with filter/sort/pagination.

Backend calls in this flow:
- `GET /api/campaigns`
- `GET /api/campaigns/{campaignId}/enrollments?status=...&page=...&pageSize=...`
- `PATCH /api/campaigns/{campaignId}/enrollments/{enrollmentId}/status`
- `PATCH /api/campaigns/{campaignId}/status`
- `GET /api/campaigns/{campaignId}/metrics`
- `GET /api/campaigns/{campaignId}/events?type=&sortBy=&sortDir=&page=&pageSize=...`

### Flow 5: Contact safety and draft queue operations
1. User removes, undoes removal, or re-adds contacts in campaign lifecycle.
2. User approves/rejects/regenerates drafts (single or bulk due approvals).

Backend calls in this flow:
- `POST /api/campaigns/{campaignId}/enrollments/{enrollmentId}/remove`
- `POST /api/campaigns/{campaignId}/enrollments/{enrollmentId}/undo-remove`
- `POST /api/campaigns/{campaignId}/enrollments/{enrollmentId}/readd`
- `POST /api/campaigns/{campaignId}/drafts/bulk-approve-due`
- `PATCH /api/drafts/{draftId}`
- `POST /api/drafts/{draftId}/regenerate`

## What Is Still Mocked (Must Move to Backend)

All items below currently use in-memory state and must call backend APIs.

### 1) App bootstrap and hydration
Replace `window.MockData` bootstrap in `buildInitialState()` with API hydration.

Required reads:
- `GET /api/campaigns`
- `GET /api/campaigns/{campaignId}` (active editable campaign)
- `GET /api/campaigns/{campaignId}/contacts`
- `GET /api/campaigns/{campaignId}/sequence`
- `GET /api/campaigns/{campaignId}/enrollments`
- `GET /api/campaigns/{campaignId}/drafts`
- `GET /api/campaigns/{campaignId}/events`
- `GET /api/timezones`

### 2) Audience Setup
#### Reads
Contact table currently filters in JS. Move filtering/searching to backend query params.

Required read:
- `GET /api/campaigns/{campaignId}/contacts?search=&field=&source=&status=`

#### Writes
Audience contact selection and campaign setup fields are currently local mutations.

Required writes:
- `PUT /api/campaigns/{campaignId}/audience/selection`
  - body: `{ "contactIds": ["ct_001", "ct_002"] }`
- `PATCH /api/campaigns/{campaignId}`
  - body: `{ "name": "...", "timezone": "...", "sendWindowStart": "09:00", "sendWindowEnd": "17:00", "startDate": "YYYY-MM-DD" }`

### 3) Sequence
#### Reads
- `GET /api/campaigns/{campaignId}/sequence`

#### Writes
Sequence step add/remove/edit/save/personalization are still mock-only.

Required writes:
- `PUT /api/campaigns/{campaignId}/sequence`
- `POST /api/campaigns/{campaignId}/sequence/steps/{stepIndex}/generate`
  - body: `{ "personalizationPrompt": "...", "previewContactId": "ct_001" }`

### 4) Campaign Approval / Start
Approval and start are local-only today.

Required write:
- `POST /api/campaigns/{campaignId}/approve-and-start`
  - body: `{ "approvedBy": "user_id_or_email" }`

### 5) Send-cycle and scheduler behaviors
The frontend simulates send-cycle behavior and progression. This must be backend-owned.

Required write/read:
- `POST /api/campaigns/{campaignId}/run-send-cycle` (manual admin trigger only)
- `GET /api/campaigns/{campaignId}/drafts?due=true`

Production note: scheduling/sending should run in backend workers/cron, not browser.

### 6) Campaigns Hub (guided wizard)
Campaign and enrollment records are currently read from local state.

Required reads:
- `GET /api/campaigns`
- `GET /api/campaigns/{campaignId}/enrollments?status=all|active|stopped`
- `GET /api/campaigns/{campaignId}/metrics`

Required writes:
- `PATCH /api/campaigns/{campaignId}/status`
  - allowed: `ACTIVE | STOPPED | COMPLETED`
- `PATCH /api/campaigns/{campaignId}/enrollments/{enrollmentId}/status`
  - allowed in current UI: `ACTIVE | STOPPED`

### 7) Contact safety controls (remove / undo / re-add)
These are local-only right now.

Required writes:
- `POST /api/campaigns/{campaignId}/enrollments/{enrollmentId}/remove`
- `POST /api/campaigns/{campaignId}/enrollments/{enrollmentId}/undo-remove`
- `POST /api/campaigns/{campaignId}/enrollments/{enrollmentId}/readd`

### 8) Draft approval queue
Bulk approve/reject/regenerate is local-only.

Required writes:
- `POST /api/campaigns/{campaignId}/drafts/bulk-approve-due`
- `PATCH /api/drafts/{draftId}`
  - body: `{ "approvalStatus": "approved" | "rejected" }`
- `POST /api/drafts/{draftId}/regenerate`

### 9) Activity audit log (Campaigns Hub Step 4)
Activity table (Name, Email, Last action, Message, Step, Time) currently reads from local events.

Required reads:
- `GET /api/campaigns/{campaignId}/events?type=&sortBy=&sortDir=&page=&pageSize=`

The backend should provide enough data to render:
- contact name
- contact email
- action type
- message
- step index
- timestamp

## Shared Pagination Requirements (Already Implemented in UI)

The frontend now uses a shared pagination model for:
- Audience contacts table
- Campaigns Hub Step 2 contacts table

Backend implications:
- Support `page` and `pageSize` with defaults compatible with UI (`25`, options `25|50|100`)
- Return totals so UI can show `X-Y of Z items`

Recommended response shape for list endpoints:
```json
{
  "items": [],
  "page": 1,
  "pageSize": 25,
  "totalItems": 0,
  "totalPages": 1
}
```

## Event Types Expected by UI

Current UI event handling expects these types (or equivalent canonical mapping):
- `send`
- `qualifying_reply`
- `ooo_reply`
- `campaign_status_changed`
- `contact_status_changed`
- `removed`
- `undo_remove`
- `readded`
- `bulk_approve`
- `status_campaign_switched`

## Minimal Domain Model Needed in Backend

- `Campaign`
- `Contact`
- `CampaignEnrollment` (campaign-scoped contact state)
- `SequenceStep`
- `DraftApprovalItem`
- `CampaignEvent`

## Security and Reliability Requirements

- All write endpoints must be authenticated.
- All write endpoints must be audited (`actor`, `timestamp`, `before`, `after`).
- Send-cycle operations must be idempotent (idempotency key support recommended).
- Frontend must not be source of truth for status progression or send scheduling.

## Suggested Integration Order

1. Bootstrap read APIs (campaign, contacts, sequence, enrollments, drafts, events)
2. Audience + campaign setup writes
3. Sequence save/generate
4. Approval/start
5. Campaigns Hub status writes
6. Activity endpoint + server-side pagination/sort/filter
7. Remove `mock-data.js` and mock fallback paths

## Local Run (Current Mock Mode)

From `/Users/axi/Documents/email-automation/mock-frontend`:

```bash
npm run dev
```

or open `index.html` directly for static preview.

## Done Criteria for Backend Migration

Migration is complete when:
1. `app.js` no longer relies on `window.MockData`.
2. No business mutation is performed in-memory without API roundtrip.
3. Activity, contacts, enrollments, drafts, and metrics are fetched from backend.
4. `mock-data.js` script import is removed from `index.html`.
