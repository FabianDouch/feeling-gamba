# Agent Instructions

This project is documentation-led. Before making changes, read `docs/README.md`
and the relevant files under `docs/architecture/` and `docs/integrations/`.

## Keep Docs In Sync

Every time a change affects requirements, architecture, implementation plans,
information architecture, data model, source integrations, scheduling, app
behaviour, validation strategy, deployment assumptions, or any other decision
that describes how the application should function, update the docs in the same
change.

Examples that require a doc update:

- A requirement is added, removed, clarified, or re-prioritised.
- The application architecture changes, including Expo, Supabase, Edge Functions,
  scheduled jobs, source adapters, storage, or read models.
- The information architecture changes, including screens, navigation, user
  flows, screen content, or screen-to-data relationships.
- The database schema, derived views, table semantics, or source-of-truth rules
  change.
- Ingestion flow, retry behaviour, snapshot cadence, reconciliation rules, or
  source precedence changes.
- A source integration finding changes what we believe about TAB, Betcha, TAB
  Form Guide, HRNZ, NZTR, GRNZ, or another racing data source.
- A validation, testing, fixture, manual dry-run, or compliance assumption
  changes.
- An implementation plan changes because of new evidence, constraints, or a
  safer technical direction.

When updating docs:

- Prefer editing the existing source-of-truth doc instead of adding a new note.
- Keep docs concise and factual.
- Preserve useful prior reasoning when direction changes; briefly state what
  changed and why.
- Add dates when findings are time-sensitive or based on a point-in-time source
  check.
- If `docs/architecture/application-architecture.yaml` changes, update the
  rendered architecture outputs or clearly note that they need regeneration.
- If `docs/architecture/information-architecture.yaml` changes, update the
  rendered information architecture outputs or clearly note that they need
  regeneration.
- Do not silently invent market/favourite data. Document source confidence and
  missing data explicitly.

## Current Project Shape

The repository currently starts from documentation and planning. The intended MVP
is an Expo + Supabase app for logging New Zealand domestic racing favourites,
TAB MarketMover where available, field sizes, results, and payout/dividend data.

The app should remain a reliable historical data log before adding advanced
betting analysis. A promotions/recommendations view is now in scope, but it must
show source-backed promotions, current race-card facts, and historical
statistical signals only. Do not add stake sizing, bankroll tracking,
automated wagering, or invented market data.

## Code Comments

When adding or changing a named function, add or maintain a short human-readable
comment above it that explains the function's purpose or important edge case.
Prefer useful intent comments over line-by-line narration, especially in data
mapping, aggregation, ingestion, and source-normalisation files.
