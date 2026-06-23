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
   - Add an EAS project and `eas.json`.
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
   - Apply Supabase migrations through a controlled deploy path.
   - Deploy required Edge Functions:
     - `refresh-current-promotions`
     - `refresh-current-predictions`
     - `refresh-race-days-and-insights`
     - `request-track-race-odds`
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

Trigger:

- Every pull request.
- Every push to feature branches where practical.

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
node --check packages/ingestion/scripts/fetch-current-predictions.mjs
```

### Backend Deploy

Trigger:

- Manual GitHub Actions workflow dispatch at first.
- Later, optionally after merge to `main` with approval.

Responsibilities:

- Apply Supabase migrations to the target project.
- Deploy Supabase Edge Functions.
- Run smoke checks against public read models and refresh endpoints.

Required secrets:

- Supabase project ref.
- Supabase access token.
- Supabase database password or linked-project credentials.
- Any service-role keys used by deploy-time smoke checks.

Minimum deploy steps:

```bash
npx supabase db push
npx supabase functions deploy refresh-current-promotions --no-verify-jwt --use-api
npx supabase functions deploy refresh-current-predictions --no-verify-jwt --use-api
npx supabase functions deploy refresh-race-days-and-insights --no-verify-jwt --use-api
npx supabase functions deploy request-track-race-odds --no-verify-jwt --use-api
```

Smoke checks:

- `current_prediction_snapshots` latest row is readable with the public app key.
- `current_promotion_snapshots` latest row is readable with the public app key.
- `refresh-current-predictions` returns HTTP 200.
- `race_day_entries` returns recent rows.
- `insight_aggregates` returns stored aggregate rows.

### iOS Internal Build

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
eas build --platform ios --profile preview
```

## Operational Rules

- Treat `main` as the release-ready branch.
- Keep database deploys manual-approved until migration risk is low.
- Keep iOS builds manual-triggered until signing and device registration are
  proven.
- Never expose Supabase service-role keys to the Expo client.
- Use EAS Update later only for JavaScript-only updates after native delivery is
  stable.
- Native dependency, config, signing, icon, entitlement, and URL-scheme changes
  require a new iOS build.

## Open Decisions

- Confirm the final app display name and iOS bundle identifier.
- Confirm whether the Apple Developer account is individual or organization.
- Decide whether the first pipeline host is GitHub Actions, EAS Workflows, or a
  small combination of both.
- Decide whether TestFlight should remain out of scope after the first ad hoc
  iOS build is installed.
