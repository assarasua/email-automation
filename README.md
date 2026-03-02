# Email Automation Repository

This repository contains the Campaign Manager mock frontend and its backend-integration specification.

## Project Structure
- `/Users/axi/Documents/email-automation/mock-frontend` - static frontend prototype (`index.html`, `app.js`, `styles.css`, `mock-data.js`)
- `/Users/axi/Documents/email-automation/mock-frontend/README.md` - exhaustive backend API replacement guide

## Primary Integration Document
For the complete, detailed mapping of every mock/in-memory call that must be replaced with backend API calls, read:

- `/Users/axi/Documents/email-automation/mock-frontend/README.md`

That document includes:
- Full function-by-function replacement map from `app.js`
- Recommended endpoint catalog
- Request/response contract examples
- Refactor checklist and production rules

## Quick Start (Current Mock Mode)
1. Open `/Users/axi/Documents/email-automation/mock-frontend/index.html` in a browser.
2. No backend is required for mock mode.

## Migration Goal
Migrate from `window.MockData` and frontend-only state mutations to backend-owned data, scheduling, draft approval, and status transitions.
