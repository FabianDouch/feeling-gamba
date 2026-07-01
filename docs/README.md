# Feeling Gamba Docs

Feeling Gamba is an Expo + Supabase app for tracking racing favourites and outcomes across thoroughbred, harness, and greyhound races, starting with New Zealand domestic tracks and expanding into Australian and Hong Kong domestic-region coverage for promotion analysis.

## Documents

- [MVP plan](./mvp-plan.md)
- [Plan of attack](./plan-of-attack.md)
- [Statistics plan](./architecture/statistics-plan.md)
- [Application architecture](./architecture/application-architecture.md)
- [Application architecture source](./architecture/application-architecture.yaml)
- [Rendered architecture diagram](./architecture/application-architecture.html)
- [Information architecture](./architecture/information-architecture.md)
- [Information architecture source](./architecture/information-architecture.yaml)
- [Rendered information architecture diagram](./architecture/information-architecture.html)
- [Information architecture diagram PNG](./architecture/information-architecture.png)
- [Information architecture diagram JPEG](./architecture/information-architecture.jpg)
- [Architecture diagram PDF](./architecture/application-architecture.pdf)
- [Architecture diagram PNG](./architecture/application-architecture.png)
- [Architecture diagram JPEG](./architecture/application-architecture.jpg)
- [Supabase data model](./architecture/data-model.md)
- [Scheduled ingestion plan](./architecture/ingestion-plan.md)
- [Standalone iOS delivery plan](./architecture/mobile-delivery-plan.md)
- [Pilot tracks](./architecture/pilot-tracks.md)
- [TAB API notes](./integrations/tab-api.md)
- [Betcha API notes](./integrations/betcha-api.md)
- [TAB Form Guide notes](./integrations/tab-form-guide.md)
- [HRNZ notes](./integrations/hrnz.md)
- [Race ID discovery notes](./integrations/race-id-discovery.md)

## Current MVP Goal

Build a daily process that records each configured NZ, Australian comparison, and Hong Kong domestic-region race, the favourite runner, the runner marked as TAB/Betcha market mover where available, the final result, and available payout/dividend data.

The app should start as a reliable data log before adding advanced betting analysis. A promotions/recommendations view is now in scope for source-backed TAB/Betcha racing promotions, current race-card facts, and historical statistical signals only.

The first statistics target uses all collected historical data starting from the initial collection start date, which was chosen at roughly six months before project start. The dataset should keep expanding as new race days are collected rather than being capped to a rolling six-month window. It should show favourite win, 2nd, and 3rd percentages overall, by final starter count, by country, by track, and by 50c favourite price bucket, plus `$1` unit-stake return metrics split by racing discipline.
