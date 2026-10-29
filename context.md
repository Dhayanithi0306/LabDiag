# Project context

## What this project is

LabDiag is a browser-based lab computer diagnostics dashboard. It helps a lab technician upload a diagnostic dataset, inspect device health, review detected faults, and follow suggested repair steps. The app has no bundled sample devices: dashboard and diagnostics remain empty until a dataset is uploaded, then use the uploaded data parsed and diagnosed locally in the browser.

## Stack and run commands

- React 19 with JSX, bundled and served by Vite 8.
- React Router handles the page routes.
- Recharts renders dashboard and device metric visualisations.
- Lucide React supplies icons; `xlsx` supports spreadsheet parsing.
- `npm run dev` starts the development server; `npm run build` creates `dist`; `npm run lint` runs Oxlint.

## Main user flow

1. The dashboard summarises device counts, recent events, fault categories, and a device metric trend after a dataset is loaded. Before then it links to upload.
2. Upload Dataset accepts a CSV or spreadsheet, previews and validates its contents, then runs browser-side diagnosis.
3. Diagnostic results list the analysed devices and link to device details.
4. Device details show health metrics, logs, and detected faults; a fault can lead to step-by-step repair guidance.
5. Settings explains that backend configuration is not available and points to the appearance control.

## Routes

- `/` — `src/pages/Dashboard.jsx`
- `/upload` — `src/pages/UploadPage.jsx`
- `/results` — `src/pages/ResultsPage.jsx`
- `/device/:id` — `src/pages/DeviceDetail.jsx`
- `/repair/:deviceId/:faultId` — `src/pages/RepairPage.jsx`
- `/settings` — `src/pages/SettingsPage.jsx`

`src/App.jsx` declares routes. `src/components/Layout.jsx` composes the shared sidebar, top bar, and page content. Shared UI components live in `src/components/`.

## Data and diagnosis

- `src/context/DataContext.jsx` holds the current uploaded file metadata, diagnosed devices, and summary in React state. It is in-memory state and does not persist across reloads.
- `src/engine/diagnose.js` maps likely dataset columns, groups rows by device, evaluates faults, and returns device and summary objects used by the UI. The upload page uses this output in place of mock data.
- No backend/API integration is currently wired into the app; labels in the UI and README describe future phases, not implemented services.

## UI system

`src/index.css` defines the shared design tokens and component styles. The default presentation uses bright neutral surfaces, fine borders, and a muted teal accent. A dark counterpart can be selected from the top bar; the preference is stored in `localStorage` under `labdiag-theme-v2`.

## Current implementation limits

- This is a prototype, not a live monitoring service. Uploaded data is required to display device diagnostics.
- Settings, search, notification, and some configuration elements are presentation-only.
- Uploaded data and diagnosis results live only in the current browser session's React state.
- The diagnostic rules and supported columns are implemented in `src/engine/diagnose.js`; they should be reviewed against real dataset schemas before relying on results operationally.
