# RioForms PWA

React + Vite PWA deployed via SAP App Router (CF) and MTA.
- Offline-ready (service worker, IndexedDB queue)
- Idempotent sync
- App Router with XSUAA & Destination
- Build: `mbt build` → deploy: `cf deploy mta_archives/*.mtar`
