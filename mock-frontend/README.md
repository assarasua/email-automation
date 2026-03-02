# Mock Frontend: Campaign Manager (n8n + Gmail)

State-of-the-art, static, clickable mock for campaign setup and campaign management.

## Files
- `/Users/axi/Documents/product-repo/mock-frontend/index.html`
- `/Users/axi/Documents/product-repo/mock-frontend/styles.css`
- `/Users/axi/Documents/product-repo/mock-frontend/mock-data.js`
- `/Users/axi/Documents/product-repo/mock-frontend/app.js`
- `/Users/axi/Documents/product-repo/mock-frontend/tailwind.config.ts`
- `/Users/axi/Documents/product-repo/mock-frontend/tailwind.input.css`
- `/Users/axi/Documents/product-repo/mock-frontend/tailwind.output.css`

## Code Organization
- `app.js` is organized by internal sections: state/normalization, helpers, selectors, domain actions, UI handlers, keyboard/navigation, and rendering.
- Click interactions are routed through a centralized action-dispatch map in `handleClick`.

## Run
1. Open `/Users/axi/Documents/product-repo/mock-frontend/index.html` in a browser.
2. No backend/build tool is required.

## Information Architecture
### Setup flow (sequential)
1. `Audience`
2. `Sequence`
3. `Campaign Approval`

### Separate workspace
- `Campaign Status` is outside setup gating and always accessible.

## Core Behavior
- Forward setup navigation is gated; backward is allowed.
- Audience/Sequence edits invalidate approval before campaign start.
- Campaign Status supports campaign selection and per-campaign contact review.
- Current campaign enters `manage` mode when `ACTIVE` or `STOPPED`; others are `review` mode.
- Audience includes an internal 2-step flow:
  - 1. Select Contacts
  - 2. Campaign Setup
- Audience Step 1 contact filtering uses filter icon dropdown with `name`, `email`, `source`, `status`.

## Campaign Status Features
- Status starts with no preselected campaign.
- Internal 3-step status journey:
  - 1. Select Campaign
  - 2. View Contacts
  - 3. Review KPIs
- On continue, prior status steps collapse into compact “Step Complete” summaries.
- Campaign directory table with selected campaign highlighting.
- Campaign directory auto-collapses after campaign selection; manual expand/collapse toggle available.
- Campaign summary strip (status, timezone, send window, start date, contact counts).
- Contact table with quick status filters.
- Campaign and Contact status updates use neutral selector controls (`ACTIVE`, `STOPPED`, `COMPLETED`) with styled confirmation modal before commit.
- Contact action menu in manage mode:
  - simulate human reply
  - simulate OOO reply
  - pause/resume contact
  - remove from sequence (destructive)
  - re-add removed contact
- Step 3 KPI dashboard is campaign-scoped and includes:
  - formula: `qualifying replies / emails sent`
  - core 4 cards: `Response rate`, `Emails sent`, `Qualifying replies`, `OOO ignored`
  - step-level bars + table
  - campaign-scoped recent events feed
- Mock KPI event data is pre-seeded so dashboard cards and charts are populated on first load.

## Remove Guardrail + Undo
- Remove requires a reason in modal.
- On confirm, contact transitions to `MANUALLY_REMOVED` and pending sends stop.
- Undo toast appears for 10 seconds.
- Undo restores prior enrollment snapshot and logs `undo_remove` event.

## Keyboard and Accessibility
- Tab semantics and keyboard navigation for top tabs.
- Sequence shortcuts:
  - `Ctrl/Cmd + Enter`: save sequence
  - `Alt + ArrowDown/ArrowUp`: move subject focus between steps
- Sequence step modes: `Generic` and `Personalized`.
- Personalized mode provides `Generate Personalized Template` plus a single-contact example preview.
- Example preview is only a sample; final drafts are generated per recipient from templates and contact notes context.
- All sequence sends are draft-gated and require approval before delivery.
- Editing sequence mode/templates/personalization instructions invalidates approval and marks non-sent drafts stale.
- Campaign Approval uses a single `Start Campaign` action with confirmation modal (no separate approve checkbox/button).
- Modal focus trap + Escape close + focus return.
- Reduced-motion support.

## Tailwind
- Tokens/components are authored in `/Users/axi/Documents/product-repo/mock-frontend/tailwind.input.css`.
- Generated CSS output is `/Users/axi/Documents/product-repo/mock-frontend/tailwind.output.css`.

Optional rebuild:
1. `cd /Users/axi/Documents/product-repo/mock-frontend`
2. `npm run build:css`

## QA Checklist
1. Cannot open Sequence before valid Audience.
2. Cannot open Approval before valid Sequence.
3. Can always open Campaign Status.
4. Selecting campaign updates visible contacts.
5. Selecting campaign auto-collapses `All Campaigns`.
6. Expand button restores full campaigns table.
7. Campaign row shows status selector with confirmation modal.
8. Contact row shows status selector with confirmation modal.
9. Remove blocks without reason.
10. Remove succeeds with reason and shows undo toast.
11. Undo within 10s restores status/scheduling.
12. Undo expires after 10s.
13. Re-add appears only for removed contacts.
14. Status actions are read-only in review mode.
15. Step 3 KPI values are scoped to the selected campaign only.
16. Mobile view keeps campaign selection and contact actions reachable.

## Limitations
- No real Gmail, n8n, or OpenAI calls.
- No persistence beyond browser session.
- Mock actor is `demo.user@local`.
