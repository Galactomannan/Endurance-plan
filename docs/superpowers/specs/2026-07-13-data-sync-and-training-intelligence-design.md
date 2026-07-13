# Data Sync, Strava Inbox, and Training Intelligence Design

## Objective

Turn James Endurance Plan from a device-local PWA into a reliable personal training system that:

- keeps Mac and iPhone data in sync;
- preserves all existing local data during migration;
- connects Strava once per account instead of once per browser;
- imports every relevant activity without collapsing multiple activities on the same day;
- remains usable offline;
- derives conservative, explainable training insights from the `brain-endurance` knowledge vault.

The work is delivered in independent phases. Each phase must leave the deployed app usable and must not require deleting existing browser data.

## Product Principles

1. **No silent data loss.** Import, migration, conflict resolution, and destructive actions always show what will change.
2. **One account, one dataset.** The same authenticated account sees the same records on every device.
3. **Actual activities are not plan slots.** Multiple activities may occur on one day and may be linked to one or more planned sessions.
4. **Offline is a first-class state.** Writes made offline remain visible and sync when connectivity returns.
5. **Advice is explainable.** Training insights show the measurements and rule that produced them; they do not pretend to be medical guidance.
6. **Manual control remains available.** Every imported activity stays editable, and manual records are never silently overwritten by Strava.

## Recommended Architecture

### Frontend

Keep the current vanilla PWA and visual language, but split the 6,000-line `index.html` into focused ES modules and CSS files. Use Vite for local development, builds, cache-busted assets, and test integration. Avoid a framework migration during the data migration.

Primary modules:

- `app-shell`: navigation, routing, mobile drawer, update state;
- `data`: repositories, schemas, migrations, local cache, sync queue;
- `auth`: Supabase session and magic-link flow;
- `strava`: connection state, activity inbox, matching and import review;
- `training`: plan generation, adherence, load and intensity calculations;
- `views`: dashboard, weekly plan, archive, biometrics, strength and settings;
- `knowledge`: curated rules and citations derived from `brain-endurance`.

### Backend

Use Supabase Auth and Postgres as the source of truth. Keep Vercel serverless functions for Strava OAuth and API calls so the Strava client secret and refresh token never reach the browser.

The browser uses the Supabase anonymous key plus Row Level Security. Vercel functions verify the Supabase access token before reading or writing account-scoped integration data.

### Offline Storage

Use IndexedDB as the local cache and mutation outbox. The UI reads from the local repository immediately. Mutations receive a client-generated UUID, update the local cache, and enter the outbox. A sync worker sends queued mutations when online and records the server revision.

`localStorage` remains read-only migration input after cutover. It is not cleared automatically.

## Data Model

All user-owned tables include `user_id`, `created_at`, `updated_at`, and a monotonically updated `revision` or equivalent server timestamp.

### Core Tables

- `profiles`: athlete identity, units, zones, plan preferences and race-weight target.
- `races`: platform, race name, date, distance, priority, goal and visual theme.
- `training_plans`: plan identity, start date, end date, status and methodology metadata.
- `planned_sessions`: date, type, title, targets, structure, phase and plan week.
- `activities`: actual performed activity; source, external provider ID, timestamps, sport, distance, duration, pace, HR, power, cadence, elevation, RPE and notes.
- `session_links`: many-to-many links between planned sessions and actual activities, including match status and user confirmation.
- `biometrics_daily`: weight, resting HR, HRV, sleep, soreness, energy and notes with one row per local date.
- `strength_sessions`: performed strength session and structured exercise payload.
- `user_settings`: UI and training preferences that must follow the user across devices.

### Integration Tables

- `integrations`: provider, athlete metadata, encrypted refresh token, scopes, connection status and last successful sync.
- `oauth_states`: short-lived single-use OAuth nonce associated with the authenticated user.
- `sync_runs`: provider sync start/end, cursor, counts, result and sanitized error.

Unique constraints prevent duplicate Strava activities by `(user_id, provider, external_id)`. Activities are not unique by date.

## Authentication and Cross-Device Flow

1. The user signs in by email magic link on Mac and iPhone.
2. Supabase restores the authenticated session on each device.
3. A device downloads the account snapshot and merges it with its local cache.
4. Local unsynced mutations are uploaded using their UUIDs, making retries idempotent.
5. Strava is connected once from either device. The integration belongs to the Supabase user, not the browser cookie.
6. Both devices show the same Strava connection and imported activities.

The app may remain unlocked on trusted devices after the first sign-in. Sign-out removes local credentials but does not delete server data.

## Existing Data Migration

Migration is a guided, reversible workflow:

1. Read the existing `fuji_*` localStorage keys.
2. Validate and normalize them using the existing data-audit rules.
3. Show counts for sessions, archive sessions, strength logs, biometrics and settings.
4. Create a downloadable pre-migration backup automatically.
5. Upload records with deterministic IDs so repeating migration does not duplicate data.
6. Show imported, merged, skipped and conflicted counts.
7. Keep original localStorage untouched and record `migration_completed_at` in the new store.

Conflict defaults:

- identical record: skip;
- local-only and server-only: preserve both;
- same Strava external ID: newest server revision wins, with local editable fields merged when non-empty;
- competing manual edits: show a comparison and require a choice;
- destructive replacement: never automatic.

## Strava Integration and Activity Inbox

### Connection

The connect endpoint requires a valid Supabase session, creates a single-use OAuth state, and redirects to Strava. The callback exchanges the code, encrypts the refresh token using a Vercel-only key, and upserts the user's integration.

### Synchronization

- Initial import paginates until the selected historical date range is complete; it is not capped at three pages.
- Incremental sync uses the last successful cursor/date with overlap for late edits.
- Phase 2 adds Strava webhooks after pull sync passes pagination, retry, and idempotency tests; webhook events then trigger near-real-time updates and deauthorization handling.
- Sync is idempotent by Strava activity ID.
- Summary fields are imported first. Detailed activity, laps or streams are fetched on demand where permission and API limits allow.

### Inbox

Every imported activity enters an inbox with one of these states:

- `suggested`: the app found a likely planned-session match;
- `linked`: user accepted or manually selected a match;
- `unplanned`: retained as valid training outside the plan;
- `ignored`: explicitly excluded by the user;
- `needs_review`: ambiguous match, conflict or unsupported activity type.

Matching uses local date, sport type, duration/distance similarity and planned-session type. It never discards a second activity from the same day. Manual sessions are not overwritten; the user can link, merge selected fields, or keep both.

## Training Intelligence

The first release is deterministic and source-backed, not generative AI.

### Initial Metrics

- planned versus actual volume and adherence;
- session-goal intensity distribution and, when detailed data exists, time in zone;
- hard-day spacing and consecutive-load warnings;
- acute versus recent load trend using clearly labeled methodology;
- long-run progression and race-specific session completion;
- recovery context from sleep, HRV, resting HR, soreness and energy;
- race-readiness checklist and taper-specific completion.

### Knowledge Sources

Rules are curated from relevant pages in `/Users/somchaimanoworn/brain-endurance`, initially:

- `training-intensity-distribution.md`;
- `hard-easy-principle.md`;
- `race-readiness.md`;
- `taper-strategy.md`;
- `daniels-marathon-training.md`.

Each insight stores a rule ID, input window and source reference. Contradictory or population-specific claims are surfaced as context rather than converted into absolute prescriptions.

### Guardrails

- No diagnosis, injury clearance or medical recommendation.
- Missing HR/power/biometric data lowers confidence instead of being inferred.
- One unusual day does not trigger plan changes.
- Suggested plan adjustments require user confirmation.

## Dashboard and Mobile UX

The dashboard keeps its presentation-quality race identity while prioritizing daily use:

- Today: planned session, completed activity and import/match state;
- This week: volume, adherence, intensity mix and recovery signal;
- Race timeline: days remaining and platform-specific race color;
- Data freshness: last cloud sync, pending offline writes and Strava status;
- Race readiness: compact, explainable indicators rather than a single opaque score.

The Activity Inbox is optimized for iPhone with full-width rows, filter tabs, large touch targets and a review sheet. Social output is a separate share view generated from verified dashboard data; no persistent Capture button returns to the main dashboard.

## Error Handling

- Offline writes show `Saved on this device` until acknowledged by the server.
- Authentication expiry pauses sync and requests sign-in without discarding local changes.
- Strava rate limits preserve the cursor and show the next retry time.
- Partial imports commit successful pages and retain a resumable sync run.
- Conflicts appear in an explicit review queue.
- Service-worker updates show a non-blocking refresh prompt after local writes are safe.
- All API errors return stable error codes; secrets and raw provider responses are not exposed.

## Security and Privacy

- Enable RLS on every user-owned table and test cross-user isolation.
- Encrypt Strava refresh tokens before database storage; encryption keys remain in Vercel environment variables.
- Never place service-role or Strava secrets in browser code.
- Use single-use, expiring OAuth state records.
- Validate all API inputs and cap provider requests.
- Store only training data required by the product and provide account export and deletion.

## Testing Strategy

### Unit Tests

- normalization, migrations and conflict resolution;
- activity matching and multiple-activity days;
- intensity, adherence and readiness calculations;
- date/time-zone behavior around Bangkok local dates;
- idempotent outbox retries.

### API Tests

- authenticated and unauthenticated Strava endpoints;
- OAuth state replay and expiry;
- token encryption/decryption boundaries;
- pagination, refresh, rate-limit and provider failure handling.

### End-to-End Tests

- first sign-in and second-device hydration;
- localStorage migration with preview and backup;
- offline edit followed by online sync;
- Strava connect, import, duplicate sync and disconnect;
- two activities on one day linked independently;
- mobile Home Screen viewport and service-worker update.

## Delivery Phases

### Phase 0: Safety and Modularization

- add Vite and repeatable test commands;
- extract data and Strava matching logic from `index.html` without behavior changes;
- expand tests around current storage and multi-activity import;
- replace manual cache-version discipline with build-generated asset revisions.

### Phase 1: Supabase Foundation

- create schema, migrations, RLS and Auth;
- implement repositories, IndexedDB cache and outbox;
- add cross-device sign-in and sync status;
- ship localStorage migration and rollback-safe backup.

### Phase 2: Account-Scoped Strava and Inbox

- move OAuth tokens from browser cookies to encrypted account storage;
- implement full pagination and incremental sync;
- build activity inbox, matching, review and multi-activity support;
- add webhook support after the pull-sync flow is stable.

### Phase 3: Training Intelligence

- implement deterministic metrics and cited rules;
- add dashboard readiness and weekly review;
- add user-confirmed plan-adjustment suggestions.

### Phase 4: Product Polish

- refine iPhone/PWA states, update flow and accessibility;
- build the separate social share view;
- run visual regression and end-to-end checks on desktop and mobile.

Each phase is released through its own branch and pull request. Database migrations are additive until the migration has been verified on both Mac and iPhone.

## Definition of Done

- Mac and iPhone show the same server-backed records for one account.
- Existing local records migrate without silent loss and remain exportable.
- Connecting Strava once makes the integration available on both devices.
- Multiple same-day Strava activities remain distinct and importable.
- Offline edits survive reload and sync after reconnecting.
- Training insights are reproducible from stored inputs and link to a knowledge source.
- Automated tests cover migration, sync, OAuth, activity matching and key mobile flows.
- Production deployment and rollback instructions are documented and verified.
