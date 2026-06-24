# Standalone iOS Delivery Plan

## Context

Feeling Gamba should become a self-sufficient standalone iOS app that can be
installed on a personal iPhone without App Store public release, Codex, Metro,
or a local development server. The app should use Supabase as the production
backend for app data, Edge Functions, scheduled refreshes, and public read
models.

The preferred first distribution path is Expo EAS internal distribution for
iOS. This creates a private installable iOS build through EAS and uses Apple ad
hoc provisioning for registered devices. TestFlight remains a later option if
tester management becomes more important than direct private installation.

## Implementation Plan

1. Create a private source repository.
   - Use a private GitHub repository as the source of truth.
   - Keep app code, Supabase migrations, Edge Functions, docs, and pipeline
     config together in the same repository.
   - Do not commit `.env`; keep `.env.example` as the documented contract.
   - Store production secrets in GitHub, EAS, or Supabase secret stores only.

2. Prepare the native iOS app configuration.
   - Add an EAS project and `apps/mobile/eas.json`.
   - Set the final app display name, bundle identifier, icon, splash screen,
     and URL scheme in `apps/mobile/app.config.js`.
   - Add an internal iOS build profile for ad hoc distribution.
   - Register the target iPhone with `eas device:create`.
   - Build the first private iOS install with
     `eas build --platform ios --profile preview`.

3. Remove local runtime assumptions.
   - The installed app must not depend on Codex, Metro, local JSON fixtures, or
     a developer machine.
   - Runtime reads should use Supabase app-facing read models.
   - Runtime writes should go through Supabase Auth, RLS, or server-side Edge
     Functions.
   - Refresh buttons should call hosted Edge Functions through configured
     public URLs.

4. Stabilise backend operations.
   - Deploy required Edge Functions through the first controlled backend deploy
     path:
     - `refresh-current-promotions`
     - `refresh-current-predictions`
     - `refresh-race-days-and-insights`
     - `request-track-race-odds`
   - Defer Supabase migration deployment to a separate, later controlled path
     because schema changes have a higher blast radius than function deploys.
   - Configure Supabase Cron for prediction refreshes and race-day refreshes.
   - Confirm `current_prediction_snapshots`, `current_promotion_snapshots`,
     `race_day_entries`, `insight_aggregates`, `prediction_aggregates`, and
     `promotion_predictions` are populated and readable by the app.

5. Add release and recovery runbooks.
   - Document how to create a new iOS internal build.
   - Document how to deploy backend migrations and Edge Functions.
   - Document how to add or replace a registered iPhone.
   - Document how to refresh predictions manually.
   - Document how to diagnose empty app states from Supabase reads.

6. Run real-device acceptance testing.
   - Install the EAS internal build on the registered iPhone.
   - Confirm Predictions loads current candidates and all model tabs.
   - Confirm Promotions, Race Days, Insights, Account, and refresh controls work.
   - Confirm app startup and navigation work without a local development server.
   - Record any mobile-only layout or authentication issues before using the app
     as the daily driver.

## Recommended Pipeline Setup

Use three pipelines initially. Keep production deploy and iOS build steps manual
until they are repeatable and low-risk.

### Pull Request CI

Status:

- Implemented in `.github/workflows/ci.yml`.

Trigger:

- Every pull request.
- Every push to `main`.

Responsibilities:

- Install dependencies with `npm ci`.
- Run mobile TypeScript checks.
- Run mobile lint.
- Run mobile tests.
- Run syntax checks for key Node/Edge Function modules.

Minimum commands:

```bash
npm ci
npm run typecheck
npm run lint
npm run test
node --check supabase/functions/_shared/current-promotions-core.mjs
node --check supabase/functions/_shared/race-days-refresh-core.mjs
node --check supabase/functions/_shared/track-race-odds-core.mjs
node --check packages/ingestion/scripts/fetch-current-predictions.mjs
node --check packages/ingestion/scripts/fetch-current-promotions.mjs
node --check packages/ingestion/scripts/refresh-race-days-and-insights.mjs
```

### Edge Function Deploy

Status:

- Implemented as a manual workflow in
  `.github/workflows/deploy-edge-functions.yml`.

Trigger:

- Manual GitHub Actions workflow dispatch at first.
- Later, optionally after merge to `main` with approval.

Responsibilities:

- Deploy Supabase Edge Functions without applying database migrations.
- Optionally run non-mutating smoke checks against the hosted function routes.
- Keep this workflow separate from schema deployment because function deploys
  are easier to roll forward and have lower production data risk.

Required secrets:

- Supabase project ref.
- Supabase access token.

Minimum deploy steps:

```bash
npx supabase functions deploy refresh-current-promotions --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt --use-api
npx supabase functions deploy refresh-current-predictions --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt --use-api
npx supabase functions deploy refresh-race-days-and-insights --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt --use-api
npx supabase functions deploy request-track-race-odds --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt --use-api
```

Smoke checks:

- `OPTIONS` requests to each deployed Edge Function return successfully.

### Migration Deploy

Status:

- Deferred until after Edge Function deploys are repeatable.

Responsibilities:

- Apply Supabase migrations to the target project through a manual-approved
  workflow.
- Run read-model smoke checks after schema changes.
- Require stronger review than Edge Function deploys because migrations can
  alter stored data, RLS, public read models, and production app behaviour.

Likely required secrets:

- Supabase project ref.
- Supabase access token.
- Supabase database password or linked-project credentials.
- Any service-role keys used by deploy-time read-model smoke checks.

Future smoke checks:

- `current_prediction_snapshots` latest row is readable with the public app key.
- `current_promotion_snapshots` latest row is readable with the public app key.
- `race_day_entries` returns recent rows.
- `insight_aggregates` returns stored aggregate rows.

### iOS Internal Build

Status:

- Initial EAS build profile and iOS identity are configured.
- `apps/mobile/eas.json` defines a manual `preview` build profile using EAS
  internal distribution.
- `apps/mobile/app.config.js` sets the current native identity:
  - Display name: `Feeling Gamba`
  - Slug: `feeling-gamba`
  - URL scheme: `feelinggamba`
  - EAS project ID: `c5cf0669-d55e-42ab-9361-d7d9fb6b9531`
  - iOS bundle identifier: `com.fabiandouch.feelinggamba`
  - iOS build number: `1`
- The bundle identifier should be confirmed before the first Apple provisioning
  run because changing it later creates a separate native app identity.

Trigger:

- Manual GitHub Actions workflow dispatch or EAS Workflow run at first.
- Later, optionally after backend deploy succeeds.

Responsibilities:

- Build a standalone iOS app with EAS internal distribution.
- Produce a private install URL for registered iPhone devices.
- Keep the app’s public runtime environment values tied to the selected build
  profile.

Required services and secrets:

- Expo account and EAS project.
- Apple Developer Program membership.
- Registered iPhone UDID through EAS device registration.
- EAS token for CI-triggered builds.
- Public app env values:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - `EXPO_PUBLIC_PROMOTION_REFRESH_URL`
  - `EXPO_PUBLIC_PREDICTION_REFRESH_URL`
  - `EXPO_PUBLIC_TRACK_ODDS_REQUEST_URL`

Minimum build command:

```bash
cd apps/mobile
npx eas-cli init
npx eas-cli device:create
npx eas-cli build --platform ios --profile preview
```

Notes:

- `npx eas-cli init` created the EAS project but could not write to the dynamic
  Expo config automatically.
- `extra.eas.projectId` is now set manually in `apps/mobile/app.config.js`.
- `npx eas-cli device:create` should be run before the first preview build so
  the target iPhone can install the internal build.

## Operational Rules

- Treat `main` as the release-ready branch.
- Deploy Edge Functions before adding database migration automation.
- Keep database deploys separate and manual-approved until migration risk is low.
- Keep iOS builds manual-triggered until signing and device registration are
  proven.
- Never expose Supabase service-role keys to the Expo client.
- Use EAS Update later only for JavaScript-only updates after native delivery is
  stable.
- Native dependency, config, signing, icon, entitlement, and URL-scheme changes
  require a new iOS build.

## Open Decisions

- Confirm whether the Apple Developer account is individual or organization.
- Confirm the provisional iOS bundle identifier
  `com.fabiandouch.feelinggamba` before the first Apple provisioning run.
- Decide whether the first iOS build pipeline host is GitHub Actions, EAS
  Workflows, or manual local EAS CLI.
- Decide whether TestFlight should remain out of scope after the first ad hoc
  iOS build is installed.
