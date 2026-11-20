# E4S Content Media Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace generated vocabulary illustrations and unstable remote image links with a conservative, attributed, MinIO-backed open-media pipeline for lessons, games, and Manager diagnostics.

**Architecture:** Add shared media contracts, an organization-scoped `media_assets` cache, strict provider/safety adapters, and an injectable `ContentMediaService`. Learning, engagement, and Manager routes consume the same service; the web renders all content imagery through one `ContentImage` component and never invents a visual fallback.

**Tech Stack:** TypeScript 7, Fastify 5, React 19, PostgreSQL/Drizzle, MinIO/S3, Zod, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-19-e4s-real-media-design.md`

## Global Constraints

- Preserve every existing route, role, score, game mechanic, and lesson payload except for the additive media fields and expanded image response.
- Never auto-search an abstract term. Only exact nouns may use Wikipedia automatically; Commons/Openverse require a curated `imageQuery`.
- Tests must not access the public internet. Provider HTTP and object storage are injected or mocked.
- Integration tests that require PostgreSQL run through root `pnpm test`, never by starting Vitest directly against port 55432.
- Keep legacy stored provider values readable, but normalize every non-`disabled` value to the new automatic open-media path.
- Never return object-store credentials, third-party raw responses, or unattributed remote URLs.
- Commit after each green task. Do not mix product artwork replacement into this plan.

## Review Focus

- Exact-query confidence and licence enforcement are more important than image coverage.
- Authorization must be checked before media resolution so routes cannot leak lesson or word-set content.
- Cache writes, object uploads, negative caching, and cache clearing must be retryable and organization-scoped.
- SSRF controls must validate hosts, redirects, MIME bytes, byte limits, and dimensions—not just URL strings.
- Existing content without safe attribution must degrade to `unavailable`, not silently bypass validation.

---

## Task 1: Add the media contracts and stop AI from inventing image URLs

**Files:**

- Create: `packages/contracts/src/media-contract.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/learning-contract.ts`
- Modify: `packages/contracts/src/engagement-contract.ts`
- Modify: `packages/contracts/src/manager-contract.ts`
- Modify: `packages/domain/src/engagement/index.ts`
- Modify: `packages/ai/src/schemas.ts`
- Modify: `packages/ai/test/operator-parity-schemas.test.ts`

**Interfaces:**

```ts
export interface ContentImageAttribution {
  creator: string | null;
  licence: string;
  licenceUrl: string;
  sourceUrl: string;
}

export interface ContentImageRequest {
  term: string;
  partOfSpeech?: string;
  imageQuery?: string;
  explicitImageUrl?: string;
  explicitAttribution?: ContentImageAttribution;
}

export type ContentImageView =
  | { status: "unavailable" }
  | {
      status: "available";
      imageUrl: string;
      alt: string;
      attribution: ContentImageAttribution;
    };

export interface ContentImageDiagnosticView {
  image: ContentImageView;
  provider: "wikipedia" | "wikimedia" | "openverse" | "explicit" | null;
  cached: boolean;
}
```

- Add optional `imageQuery` and `imageAttribution` to `LessonVocabularyItem` and `GameWordView`.
- Retain optional `imageUrl` only for backward-compatible published content with complete attribution.
- Expand `ManagerImageTestView` with `cached: boolean`, nullable attribution, and the selected provider/source label.
- Add `provider: "wikipedia" | "wikimedia" | "openverse" | "explicit" | null` to `ManagerImageTestView`; retain `source` as the requested organization preference so diagnostics distinguish configuration from the actual provider.
- Add the same optional `imageQuery`, `imageUrl`, and attribution fields to the domain `GameWord` persisted in generated sets.
- Change the AI vocabulary schema/JSON schema from optional `imageUrl` to optional `imageQuery` with a short bounded string.

**Steps:**

- [ ] Add a failing schema test proving generated vocabulary accepts `imageQuery`, rejects `imageUrl`, and still accepts output without either field.
- [ ] Run `pnpm exec vitest run packages/ai/test/operator-parity-schemas.test.ts`; expect the new assertions to fail because `imageQuery` is not in the schema.
- [ ] Add the media contract and update the learning, engagement, Manager, and AI contracts exactly as above.
- [ ] Run the focused test again; expect it to pass.
- [ ] Run `pnpm typecheck`; expect no contract consumer to be left with an incompatible type.
- [ ] Commit: `feat(media): define attributed content image contracts`

## Task 2: Add the organization-scoped media cache repository

**Files:**

- Create: `packages/database/migrations/0035_media_assets.sql`
- Modify: `packages/database/src/schema.ts`
- Create: `packages/database/src/media-repository.ts`
- Modify: `packages/database/src/index.ts`
- Modify: `packages/database/test/schema.integration.test.ts`
- Create: `packages/database/test/media-repository.integration.test.ts`

**Schema and repository:**

```ts
export interface MediaAssetRecord {
  id: string;
  organizationId: string;
  requestFingerprint: string;
  normalizedQuery: string;
  provider: "wikipedia" | "wikimedia" | "openverse" | "explicit";
  providerAssetId: string | null;
  status: "available" | "unavailable";
  sourceUrl: string | null;
  sourcePageUrl: string | null;
  creator: string | null;
  licence: string | null;
  licenceUrl: string | null;
  objectKey: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  sha256: string | null;
  expiresAt: Date | null;
}
```

`MediaRepository` exposes only focused operations: `findByFingerprint`, `saveAvailable`, `saveUnavailable`, `listForOrganization`, `deleteByIds`, and `organizationIdForUser`. Add a unique index on `(organization_id, request_fingerprint)` and indexes for status/expiry cleanup. Successful rows do not expire automatically; unavailable rows expire after 24 hours.

**Steps:**

- [ ] Add failing integration tests for migration shape, organization isolation, positive upsert, 24-hour negative cache, and listing/deleting one organization without touching another.
- [ ] Run `pnpm test`; expect the new repository tests to fail because the table and export do not exist.
- [ ] Add migration `0035_media_assets.sql`, the matching Drizzle declaration, and `createMediaRepository(pool)` in the new module.
- [ ] Ensure upsert never overwrites a healthy available row with a transient unavailable result.
- [ ] Run `pnpm test`; expect the new and existing database suites to pass.
- [ ] Commit: `feat(database): add media asset cache`

## Task 3: Provision and verify the dedicated media bucket

**Files:**

- Modify: `packages/storage/src/index.ts`
- Modify: `packages/storage/test/presign.test.ts`
- Modify: `docker-compose.yml`
- Modify: `scripts/local-storage-preflight.mjs`
- Modify: `scripts/local-storage-preflight.test.mjs`
- Modify: `.env.example` if the bucket names are documented there

**Storage change:**

```ts
export interface ObjectStorage {
  putObject(input: PutObjectInput): Promise<void>;
  deleteObject(bucket: string, objectKey: string): Promise<void>;
  objectExists?(bucket: string, objectKey: string): Promise<boolean>;
  ready(bucket: string): Promise<void>;
  presignGetObject?(input: PresignObjectInput): Promise<PresignedObject>;
}
```

Use constants `EVIDENCE_BUCKET = "e4s-evidence"` and `MEDIA_BUCKET = "e4s-media"` from the storage package so compose/preflight/API do not diverge.

**Steps:**

- [ ] Extend preflight tests to require both buckets and to print the exact recovery command `docker compose up -d minio minio-init` when either is missing.
- [ ] Add a failing storage test for `objectExists` returning true on success and false only for an S3 not-found response.
- [ ] Run `pnpm exec vitest run scripts/local-storage-preflight.test.mjs packages/storage/test/presign.test.ts`; expect failures for the second bucket and missing method.
- [ ] Update `minio-init` to create both buckets idempotently, update preflight, and implement `HeadObjectCommand` in S3 storage.
- [ ] Run the focused tests and `pnpm typecheck`; expect both to pass.
- [ ] Commit: `chore(storage): provision media bucket`

## Task 4: Implement URL, licence, and bitmap safety primitives

**Files:**

- Create: `apps/api/src/modules/media/safety.ts`
- Create: `apps/api/src/modules/media/safety.test.ts`

**Public functions:**

```ts
export function validateProviderUrl(url: string, allowedHosts: ReadonlySet<string>): URL;
export function normalizeLicence(value: string): "CC0" | "PDM" | "CC BY" | "CC BY-SA" | null;
export function inspectBitmap(bytes: Uint8Array, claimedMime: string): {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
};
export async function downloadBitmap(input: SafeDownloadInput): Promise<SafeBitmap>;
```

- Parse PNG, JPEG, and WebP headers locally; do not add a heavyweight image library.
- Require HTTPS, approved hostnames, a public resolved address, no redirects, a strict timeout, a byte cap, matching MIME bytes, and minimum dimensions.
- Resolve DNS through an injected function in tests so private/loopback/link-local cases are deterministic.

**Steps:**

- [ ] Write failing unit tests for HTTP URLs, suffix-host tricks, localhost/private IPv4/IPv6, redirects, timeout, oversized bodies, SVG masquerading as PNG, MIME mismatch, dimensions below minimum, supported bitmap headers, and accepted/rejected licences.
- [ ] Run `pnpm exec vitest run apps/api/src/modules/media/safety.test.ts`; expect module-not-found failure.
- [ ] Implement the smallest safety module satisfying the matrix.
- [ ] Run the focused test; expect all cases to pass without network access.
- [ ] Commit: `feat(media): validate open media safely`

## Task 5: Implement conservative provider adapters

**Files:**

- Create: `apps/api/src/modules/media/types.ts`
- Create: `apps/api/src/modules/media/providers/wikipedia.ts`
- Create: `apps/api/src/modules/media/providers/wikimedia.ts`
- Create: `apps/api/src/modules/media/providers/openverse.ts`
- Create: `apps/api/src/modules/media/providers/providers.test.ts`

**Adapter contract:**

```ts
export interface ProviderCandidate {
  provider: "wikipedia" | "wikimedia" | "openverse";
  providerAssetId: string;
  downloadUrl: string;
  sourcePageUrl: string;
  creator: string | null;
  licence: string;
  licenceUrl: string;
}

export interface OpenMediaProviders {
  exactWikipedia(term: string): Promise<ProviderCandidate | null>;
  searchCommons(query: string): Promise<ProviderCandidate | null>;
  searchOpenverse(query: string): Promise<ProviderCandidate | null>;
}
```

**Steps:**

- [ ] Add fixture-driven tests for exact normalized title match, disambiguation rejection, missing thumbnail, bitmap-only Commons search, accepted licence metadata, sensitive/missing metadata rejection, and Openverse timeout returning `null` within its budget.
- [ ] Run `pnpm exec vitest run apps/api/src/modules/media/providers/providers.test.ts`; expect module-not-found failure.
- [ ] Implement adapters with an injected `fetch`, explicit API host allowlists, deterministic query parameters, and no raw provider response escaping the module.
- [ ] Run the focused tests; expect pass with zero real HTTP requests.
- [ ] Commit: `feat(media): add open media provider adapters`

## Task 6: Implement the cached `ContentMediaService`

**Files:**

- Create: `apps/api/src/modules/media/service.ts`
- Create: `apps/api/src/modules/media/service.test.ts`
- Create: `apps/api/src/modules/media/index.ts`

**Service interface:**

```ts
export interface ContentMediaService {
  resolveForUser(userId: string, request: ContentImageRequest): Promise<ContentImageView>;
  diagnoseForUser(userId: string, request: ContentImageRequest): Promise<ContentImageDiagnosticView>;
  clearForUser(userId: string): Promise<{ cleared: number }>;
}

export function createContentMediaService(options: {
  repository: MediaRepository;
  storage: ObjectStorage;
  providers: OpenMediaProviders;
  bucket?: string;
  now?: () => Date;
  download?: typeof downloadBitmap;
}): ContentMediaService;
```

**Resolution rules:**

- Fully attributed explicit HTTPS URL: validate metadata and return it without server download.
- Curated `imageQuery`: Commons first, then time-bounded Openverse.
- No curated query: exact Wikipedia only when `partOfSpeech === "noun"`.
- Everything else: negative cache and `unavailable`.
- Hash the normalized request for the cache key; collapse concurrent identical requests with an in-memory promise map.
- Upload provider binaries to `e4s-media/<organizationId>/<sha256>.<ext>`, save metadata only after upload succeeds, and return a short-lived presigned URL.
- Cache clear deletes objects first, then rows. A deletion failure leaves the row retryable.

**Steps:**

- [ ] Add failing tests for the full decision table, positive/negative cache, expired negative cache, object-missing refresh, provider/upload failure, concurrency collapse, organization isolation, presign output, explicit attributed URL, and cache-clear partial failure.
- [ ] Run `pnpm exec vitest run apps/api/src/modules/media/service.test.ts`; expect module-not-found failure.
- [ ] Implement the service and structured failure codes without logging secrets or raw third-party bodies.
- [ ] Run the focused test and `pnpm typecheck`; expect pass.
- [ ] Commit: `feat(media): cache attributed content images`

## Task 7: Inject the service and add the learner vocabulary endpoint

**Files:**

- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/modules/learning/routes.ts`
- Modify: `apps/api/src/modules/learning/index.ts`
- Modify: `apps/api/test/learning.integration.test.ts`

**Wiring:**

```ts
export interface BuildApiOptions {
  // existing fields
  mediaService?: ContentMediaService;
}
```

When no service is injected and object storage exists, `server.ts` creates the production service from the pool, storage, and provider adapters. Tests inject a deterministic stub.

Route modules accept an optional service. When neither a production service nor a test stub exists, they use a no-op implementation that returns `unavailable`; API startup and lessons must remain usable without MinIO.

Add `GET /api/v1/lessons/:lessonId/vocabulary/:itemIndex/image`. Reuse the same learner access query/guard as `GET /api/v1/lessons/:lessonId`, then read the indexed vocabulary item. Invalid/inaccessible lesson or index returns 404; resolver failure returns `200 { status: "unavailable" }`.

**Steps:**

- [ ] Add failing integration tests for accessible vocabulary, unavailable response, invalid index, another learner's inaccessible lesson, Operator/Manager denial, and no call to the stub before access succeeds.
- [ ] Run `pnpm test`; expect the new endpoint tests to fail with 404.
- [ ] Add `mediaService` injection and the guarded route.
- [ ] Run `pnpm test`; expect the learning and authorization tests to pass.
- [ ] Commit: `feat(learning): resolve vocabulary media`

## Task 8: Migrate game-word imagery to the shared service

**Files:**

- Modify: `apps/api/src/modules/engagement/routes.ts`
- Modify: `apps/api/src/modules/engagement/index.ts`
- Delete: `apps/api/src/modules/engagement/vocabulary-image.ts`
- Modify: `apps/api/test/engagement.integration.test.ts`
- Modify: `apps/web/src/api/learner.ts`

**Steps:**

- [ ] Add failing integration tests proving the existing game image URL remains stable, checks ownership before resolution, forwards `partOfSpeech`/`imageQuery`/attribution, and returns `ContentImageView` for available and unavailable results.
- [ ] Run `pnpm test`; expect shape and service-call assertions to fail against the legacy resolver.
- [ ] Replace `createVocabularyImageResolver` with the injected shared service and delete the old module.
- [ ] Change `LearnerApiClient.resolveGameWordImage` to return `Promise<ContentImageView>`.
- [ ] Run `pnpm test`, then `pnpm typecheck`; expect both to pass.
- [ ] Commit: `refactor(engagement): share content media resolver`

## Task 9: Migrate Manager diagnostics and simplify provider settings

**Files:**

- Modify: `apps/api/src/modules/manager/routes.ts`
- Modify: `apps/api/src/modules/manager/index.ts`
- Modify: `apps/api/src/modules/system/routes.ts`
- Modify: `apps/api/test/manager-settings-operations.integration.test.ts`
- Modify: `apps/web/src/app/settings/Settings.tsx`
- Modify: `apps/web/src/app/settings/settings-ai-parity.test.tsx`
- Modify: `apps/web/src/api/manager.ts`

**Behavior:**

- Manager sees only `Tự động từ nguồn mở` (`wikimedia`) and `Tắt ảnh minh hoạ` (`disabled`).
- Stored `pexels`, `pixabay`, and `openverse` values render and execute as automatic open media until saved.
- Image test calls `diagnoseForUser`, displays cached/source/attribution, and never asks for a key.
- Cache clear calls `clearForUser`; Operator and Learner remain forbidden.

**Steps:**

- [ ] Extend API integration tests for automatic diagnostics, unavailable result, attribution, cache flag, organization-scoped clear, and role denial.
- [ ] Extend Settings tests to prove only two options render and legacy values normalize without crashing.
- [ ] Run `pnpm test`; expect Manager response/UI assertions to fail.
- [ ] Replace Manager legacy resolver calls and simplify the Settings copy/options.
- [ ] Run `pnpm test` and `pnpm typecheck`; expect pass.
- [ ] Commit: `fix(settings): use automatic open media diagnostics`

## Task 10: Add the shared web renderer and migrate lesson vocabulary

**Files:**

- Create: `apps/web/src/app/shared/media/ContentImage.tsx`
- Create: `apps/web/src/app/shared/media/content-image.css`
- Create: `apps/web/src/app/shared/media/ContentImage.test.tsx`
- Modify: `apps/web/src/api/learner.ts`
- Modify: `apps/web/src/app/learner/Learning.tsx`
- Modify: `apps/web/src/app/learner/Learning.test.tsx`
- Modify: `apps/web/src/app/app.css`

**Component:**

```ts
export function ContentImage(props: {
  term: string;
  load: () => Promise<ContentImageView>;
  required?: boolean;
}): JSX.Element | null;
```

The component owns lazy loading, fixed aspect ratio, broken-image fallback, `ImageOff`/spinner states, and a focusable `Nguồn ảnh` disclosure. Optional unavailable images collapse entirely; structurally required images show compact text.

Use `IntersectionObserver` so `load` starts only when the card enters the viewport, with an immediate-load fallback when the API is unavailable. Tests install a deterministic observer stub.

**Steps:**

- [ ] Add failing component tests for lazy load, attributed success, optional unavailable, required unavailable, rejected promise, broken `<img>`, and accessible source links.
- [ ] Add failing Learning tests asserting no `data:image`, no generated SVG helper, a real API image path for a concrete item, and no misleading image for an abstract item.
- [ ] Run `pnpm exec vitest run apps/web/src/app/shared/media/ContentImage.test.tsx apps/web/src/app/learner/Learning.test.tsx`; expect failures.
- [ ] Implement `ContentImage`, add `resolveLessonVocabularyImage`, and remove `vocabularyIllustrations`/`vocabularyIllustrationSrc` from Learning.
- [ ] Run focused tests and `pnpm typecheck`; expect pass.
- [ ] Commit: `feat(web): render attributed vocabulary media`

## Task 11: Migrate image-based game consumers and close the pipeline gate

**Files:**

- Modify: `apps/web/src/app/games/TypingRaceGame.tsx`
- Modify: `apps/web/src/app/learner/Games.tsx`
- Modify: `apps/web/src/app/learner/GamesUx.test.tsx`
- Modify: `apps/web/src/app/learner/Games.test.tsx`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/LOCAL-RUN.md`

**Steps:**

- [ ] Add failing game tests for available attributed media, unavailable media, and legacy word sets without media metadata.
- [ ] Run `pnpm exec vitest run apps/web/src/app/learner/GamesUx.test.tsx apps/web/src/app/learner/Games.test.tsx`; expect response-shape assertions to fail.
- [ ] Use `ContentImage` for the image-based clue path and remove the final compatibility branch for `{ imageUrl }` once all callers use `ContentImageView`.
- [ ] Document the `e4s-media` bucket, no-key policy, conservative noun/query rule, and cache clear behavior.
- [ ] Run `pnpm typecheck`, `pnpm test`, and `pnpm build`; expect all gates to pass.
- [ ] With E4S MinIO running, execute `docker compose up -d minio minio-init`, run the local storage preflight, and verify both `e4s-evidence` and `e4s-media` are ready.
- [ ] Smoke one concrete noun and one abstract term through the API; store redacted output under `.tmp/evidence`.
- [ ] Commit: `test(media): verify content media pipeline`

## Plan Completion Gate

- [ ] `rg "vocabularyIllustration|createVocabularyImageResolver" apps packages` returns no active source matches.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test` passes with no public network dependency.
- [ ] `pnpm build` passes.
- [ ] Both MinIO buckets pass local preflight.
- [ ] Available content includes attribution; abstract/untrusted content renders no fake fallback.
- [ ] Review the complete diff before beginning `2026-10-19-e4s-open-artwork-replacement.md`.
