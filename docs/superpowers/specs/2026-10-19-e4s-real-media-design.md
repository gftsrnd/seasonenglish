# E4S Real Media Design

**Date:** 2026-10-19  
**Status:** Design approved in conversation; written specification awaiting review  
**Application baseline:** the application served at port 4175 from `apps/web/src/app`

## 1. Intent

E4S currently uses hand-authored SVG, emoji, and CSS artwork as if they were content imagery in lessons, games, onboarding, surveys, and branding. This produces inconsistent visuals and can imply that an image came from a real media source when it did not.

The change replaces those fake illustrations across the active application with either:

1. verified openly licensed media retrieved through a no-key public API and cached by E4S; or
2. a fixed, openly licensed raster asset bundled with E4S where a stable game or mascot graphic is required.

The result must not require the user to provide Pexels, Pixabay, or another commercial provider key.

## 2. Success criteria

- Lesson vocabulary and image-based game clues never fall back to an emoji or generated SVG.
- Automatically selected content imagery is shown only when its meaning is sufficiently reliable.
- Provider outages do not break lessons or games; the UI omits the image gracefully.
- Images retained by the product have source and licence metadata.
- Game characters, objects, and mascot artwork use a coherent raster asset set with a recorded open licence.
- No application source outside the explicit exclusions contains illustrative inline SVG, SVG data URLs, emoji-as-art, or CSS-drawn scenery.
- The application retains current routes, roles, learning behaviour, scoring, and game mechanics.
- The result works at 390x827 and 1440x900 and passes the repository's typecheck, test, and production build gates.

## 3. Explicit exclusions

The following are deliberately unchanged:

- Learner avatars remain the current selectable seasonal symbols and colours.
- Rewards, badges, reward levels, certificates, and their emoji remain unchanged.
- Functional interface icons may continue to use Lucide. They communicate actions or status and are not content illustrations.
- The GFT logo file remains unchanged.
- This change does not redesign page structure, typography, colour themes, routes, permissions, lesson content, or scoring.
- HTML files under `research/seasonenglish` remain reference material only and are not imported into the runtime.

## 4. Confirmed current-state problems

The audit found these active sources of fake illustration:

- `apps/web/src/app/learner/Learning.tsx` generates SVG data URLs containing emoji for vocabulary cards.
- `apps/web/src/app/games/season-art.tsx` generates the season mascot, catch objects, gifts, mushroom, bomb, and dinosaur as inline or data-URL SVG.
- `SeasonMark` is reused as the application mark, onboarding mascot, and survey mascot.
- `apps/web/src/app/settings/Settings.tsx` hand-draws season choices as inline SVG.
- `apps/web/src/app/app.css` and the retained learner stylesheet contain inline SVG scenery and CSS-drawn decorative sky elements, including dead rules overridden later in the cascade.
- Season Catch and Season-rio use emoji as basket, food, boss, flag, lives, and feedback imagery.
- Several learner controls use emoji where a functional Lucide icon already exists or can be added.

Live API probing also proved that a generic Commons search is not reliable enough by itself. `notebook` produced relevant image results, while `role`, `new`, `nice`, and `from` produced unrelated places, documents, or scenes. Therefore E4S must prefer no image over a misleading image.

## 5. Media classes and ownership

### 5.1 Content media

Content media illustrates a vocabulary item or game clue. It is resolved by the API and can vary with lesson content.

The resolution input is:

```ts
interface ContentImageRequest {
  term: string;
  partOfSpeech?: string;
  imageQuery?: string;
  explicitImageUrl?: string;
  explicitAttribution?: {
    creator: string | null;
    licence: string;
    licenceUrl: string;
    sourceUrl: string;
  };
}
```

The public response is:

```ts
type ContentImageView =
  | { status: "unavailable" }
  | {
      status: "available";
      imageUrl: string;
      alt: string;
      attribution: {
        creator: string | null;
        licence: string;
        licenceUrl: string;
        sourceUrl: string;
      };
    };
```

### 5.2 Product artwork

Product artwork includes the application mascot, onboarding/survey illustration, game characters, game objects, and game scenery. It is selected once, bundled with the web app as PNG or WebP, and never resolved dynamically.

The initial source is a coherent CC0 raster pack from Kenney. Only files required by E4S are copied into the repository. Every copied file is listed in a manifest containing its original asset page, licence, local path, and SHA-256 digest.

### 5.3 Functional icons

Functional icons continue to use Lucide components. Settings season choices, audio controls, warning states, success/failure states, locks, lives, timers, and navigation use icon components plus accessible text instead of emoji.

## 6. Content image resolution policy

### 6.1 Source order

1. A valid published `explicitImageUrl` is used as-is after HTTPS validation only when complete `explicitAttribution` is present. It is not fetched by the server.
2. A curated `imageQuery` may search Wikimedia Commons.
3. Without a curated query, automatic resolution is attempted only when `partOfSpeech` is exactly `noun`.
4. Automatic resolution uses an exact, non-disambiguation English Wikipedia page with a bitmap thumbnail.
5. Openverse is an optional best-effort fallback for an explicit `imageQuery` only. It has a short timeout and never blocks the response.
6. If none of the above succeeds, the result is `unavailable`.

Pexels and Pixabay remain accepted by old stored settings for backward compatibility, but they are not presented as required configuration and are not part of the default path.

### 6.2 Reliability rules

- Verbs, adjectives, adverbs, prepositions, phrases, and entries without a known part of speech are not auto-resolved. They require a curated `imageQuery` or attributed `imageUrl`.
- A Wikipedia result is accepted only when the normalized page title matches the normalized term and the response is not a disambiguation page.
- Commons search is allowed only when lesson/game content supplied an explicit `imageQuery`.
- Supported source files are JPEG, PNG, and WebP bitmap images.
- Sensitive results are excluded.
- Accepted licences are CC0, Public Domain Mark, CC BY, and CC BY-SA.
- Images with missing source or licence metadata are rejected.
- The image must meet minimum dimensions suitable for the card that consumes it.
- The same normalized request produces a stable cached result or a time-limited negative-cache entry.

### 6.3 Content contract changes

`LessonVocabularyItem` and generated `GameWordView` gain optional `imageQuery` and `imageAttribution`. Existing `imageUrl` remains supported only when `imageAttribution` is complete. Legacy content with an unattributed URL is treated as unavailable and listed by validation so an Operator can repair it.

AI vocabulary generation may provide `imageQuery` only for a visually concrete term. It must not invent a URL. Existing generated sets without this field remain valid.

## 7. Media cache and MinIO

Resolved provider images are copied into a dedicated MinIO bucket named `e4s-media`. This prevents lessons from depending on an external thumbnail URL that may expire or change.

`minio-init` creates both `e4s-evidence` and `e4s-media`. Local startup preflight checks both buckets.

A `media_assets` table stores:

- stable asset ID;
- normalized query and request fingerprint;
- provider and provider asset ID;
- original source URL and source page;
- creator, licence, and licence URL;
- MinIO object key, MIME type, width, height, and SHA-256 digest;
- resolution status and timestamps.

Negative cache rows contain no object key and expire after 24 hours. Successful rows are reused until explicitly invalidated or found missing from object storage.

The API returns a short-lived presigned MinIO URL. The browser never receives object-store credentials.

## 8. API and data flow

### 8.1 Lesson vocabulary

Add:

```text
GET /api/v1/lessons/:lessonId/vocabulary/:itemIndex/image
```

The route is Learner-only. It first proves that the learner can access the lesson, then reads the indexed vocabulary item and resolves or retrieves its cached media. An invalid item index returns 404. Provider failure returns `200 { status: "unavailable" }` so a lesson remains usable.

The web application requests the image lazily when a vocabulary card enters the page and no published `imageUrl` exists.

### 8.2 Typing Race and generated vocabulary

The existing game-word image endpoint remains stable. Internally it uses the shared resolver and returns the expanded `ContentImageView`. The web client continues accepting the old `{ imageUrl }` shape during migration, then the compatibility branch is removed after all callers and tests use the new contract.

### 8.3 Manager image check

Manager Settings no longer asks the user to configure a commercial image provider. It offers:

- **Tự động từ nguồn mở**; and
- **Tắt ảnh minh hoạ**.

The test action uses the same production resolver and reports the selected source, whether the result was cached, and its attribution. No API key field is introduced.

### 8.4 Frontend rendering

A shared `ContentImage` component owns loading, success, failure, attribution, aspect ratio, and alt text. Consumers do not implement their own fallback artwork.

- Loading uses a functional spinner.
- Available media renders as an `<img>` with fixed dimensions to avoid layout shift.
- Unavailable media removes the image column when the layout permits it; where the image is structurally required, a compact text state says `Chưa có ảnh` with an `ImageOff` icon.
- Decorative product artwork has empty alt text.
- Content imagery has a concise Vietnamese alt string based on the vocabulary term.
- A visible or focusable `Nguồn ảnh` affordance exposes creator, licence, and source link.

## 9. Product artwork replacement map

| Current use | Replacement |
| --- | --- |
| Header and entry `SeasonMark` | Existing real GFT logo for brand identity |
| Onboarding and survey `SeasonMark` | One bundled CC0 mascot raster |
| Season Catch animal and falling object | Bundled seasonal animal/object PNG/WebP |
| Season Catch basket, lives, and dinosaur | Bundled CC0 raster assets; lives use Lucide Heart |
| Season-rio hero, gifts, mushroom, bomb, boss food, flag, dinosaur | Bundled CC0 raster assets; HUD status uses Lucide icons |
| Settings season drawings | Lucide Sun, Flower, Leaf, Snowflake, Gift, and Moon-style functional icons |
| Lesson vocabulary generated SVG | `ContentImage` backed by the resolver |
| Hero/party inline CSS SVG and CSS sky art | Remove dead artwork; use no replacement unless the active layout needs the bundled mascot |
| Status emoji in non-reward flows | Lucide icon plus text |

Reward/badge symbols and avatar accessories are not included in this replacement map.

## 10. Security and operational constraints

- Provider calls use an allowlist of official Wikipedia, Wikimedia, and Openverse API hosts.
- Binary downloads accept only allowlisted Wikimedia/Openverse media hosts returned by the provider adapters.
- Redirects are disabled or every hop is revalidated; private, loopback, link-local, and non-HTTPS destinations are rejected.
- Downloads have strict connect/read timeouts, a maximum byte size, MIME sniffing, and image dimension validation.
- Provider responses and attribution are treated as untrusted text and escaped by React.
- Rate limits apply to resolution endpoints, and concurrent identical requests collapse into one resolver operation.
- Tests mock provider calls; the normal test suite never depends on public internet availability.
- No API key, object-store credential, or presigned URL is committed.

## 11. Failure behaviour

- Provider timeout, HTTP failure, malformed metadata, rejected licence, unsafe URL, missing object, or failed upload all result in `unavailable` and a structured server log code.
- A failed refresh does not delete a previously healthy cached asset.
- If MinIO is unavailable, the resolver does not return the remote source directly. It reports `unavailable` so behaviour remains deterministic and private infrastructure details are not exposed.
- The UI never substitutes emoji, generated SVG, or unrelated search results.
- A missing bundled product asset is caught by build-time manifest validation.

## 12. Repository layout

```text
apps/web/public/media/
  manifest.json
  mascot/
  games/
  seasons/

apps/web/src/app/shared/media/
  ContentImage.tsx
  content-image.css

apps/api/src/modules/media/
  routes.ts
  resolver.ts
  providers/wikipedia.ts
  providers/wikimedia.ts
  providers/openverse.ts
  cache.ts
  safety.ts

packages/contracts/src/media-contract.ts
packages/database/migrations/0035_media_assets.sql
```

The existing `vocabulary-image.ts` is replaced by the media module rather than maintained as a second resolver.

## 13. Testing and acceptance evidence

### 13.1 Resolver tests

- An exact concrete noun with a valid thumbnail is accepted.
- A disambiguation page is rejected.
- Adjective, adverb, and preposition automatic requests are skipped.
- A curated Commons query accepts only allowed licence and bitmap results.
- Missing attribution, unsafe hosts, redirects to private addresses, oversized files, and mismatched MIME types are rejected.
- Openverse timeout does not delay the final response beyond the configured budget.
- Concurrent identical requests produce one provider fetch and one object.
- Positive and negative caches behave as specified.

### 13.2 API tests

- A learner can resolve an image only for an accessible lesson.
- Invalid lesson/item access does not leak content.
- Available and unavailable response shapes match the contract.
- Typing Race remains compatible during the response-shape migration.
- Manager can test automatic media resolution; Operator and Learner cannot call the Manager action.

### 13.3 Frontend tests

- Vocabulary cards render real URLs and attribution without generated fallback art.
- Abstract terms render without a misleading image.
- Broken images settle into the unavailable state.
- Game and mascot components reference manifest-backed raster files.
- Avatar and reward rendering remains unchanged.
- Source scans find no illustrative `<svg>`, `data:image`, or removed art helpers outside the documented exclusions.

### 13.4 Runtime and visual verification

- Run `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- Run MinIO readiness and verify both buckets.
- Exercise one concrete and one abstract lesson term.
- Exercise Typing Race with available and unavailable imagery.
- Run Season Catch and Season-rio through success and game-over states.
- Inspect entry, onboarding, survey, Settings, lesson detail, and both games at 390x827 and 1440x900.
- Save evidence under ignored `.tmp/evidence`.

## 14. Rollout order

1. Add contracts, database migration, storage bucket, safety helpers, and resolver tests.
2. Implement provider adapters and MinIO-backed cache.
3. Migrate Manager image diagnostics and simplify Settings.
4. Add lesson vocabulary resolution and shared frontend rendering.
5. Migrate game-word imagery.
6. Import the curated CC0 raster set and its licence manifest.
7. Replace branding, onboarding, survey, Settings, and game artwork.
8. Remove `season-art.tsx`, generated vocabulary SVG, dead CSS art, and non-reward illustrative emoji.
9. Run static scans, full automated gates, and browser verification.

## 15. Completion definition

The work is complete only when every active app surface outside avatar and rewards either uses a verified real/openly licensed asset, uses a functional icon, or intentionally renders no image; no fake fallback illustration remains; provider and storage failures are safe; licensing is traceable; and all automated and visual gates pass.
