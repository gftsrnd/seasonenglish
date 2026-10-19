import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export type MediaProvider = "wikipedia" | "wikimedia" | "openverse" | "explicit";
export type MediaAssetStatus = "available" | "unavailable";

export interface MediaAssetRecord {
  id: string;
  organizationId: string;
  requestFingerprint: string;
  normalizedQuery: string;
  provider: MediaProvider;
  providerAssetId: string | null;
  status: MediaAssetStatus;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface SaveAvailableMediaAssetInput {
  organizationId: string;
  requestFingerprint: string;
  normalizedQuery: string;
  provider: MediaProvider;
  providerAssetId: string | null;
  sourceUrl: string;
  sourcePageUrl: string;
  creator: string | null;
  licence: string;
  licenceUrl: string;
  objectKey: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  sha256: string | null;
}

export interface SaveUnavailableMediaAssetInput {
  organizationId: string;
  requestFingerprint: string;
  normalizedQuery: string;
  provider: MediaProvider;
}

interface MediaAssetRow {
  id: string;
  organization_id: string;
  request_fingerprint: string;
  normalized_query: string;
  provider: MediaProvider;
  provider_asset_id: string | null;
  status: MediaAssetStatus;
  source_url: string | null;
  source_page_url: string | null;
  creator: string | null;
  licence: string | null;
  licence_url: string | null;
  object_key: string | null;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  sha256: string | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface MediaRepository {
  findByFingerprint(organizationId: string, requestFingerprint: string, now?: Date): Promise<MediaAssetRecord | null>;
  saveAvailable(input: SaveAvailableMediaAssetInput): Promise<MediaAssetRecord>;
  saveUnavailable(input: SaveUnavailableMediaAssetInput, now?: Date): Promise<MediaAssetRecord>;
  listForOrganization(organizationId: string): Promise<MediaAssetRecord[]>;
  deleteByIds(organizationId: string, ids: readonly string[]): Promise<number>;
  organizationIdForUser(userId: string): Promise<string | null>;
}

export function createMediaRepository(pool: Pool): MediaRepository {
  return {
    async findByFingerprint(organizationId, requestFingerprint, now = new Date()) {
      const result = await pool.query<MediaAssetRow>(
        `select * from media_assets
         where organization_id = $1 and request_fingerprint = $2
           and (status = 'available' or expires_at > $3)
         limit 1`,
        [organizationId, requestFingerprint, now]
      );
      return result.rows[0] ? fromRow(result.rows[0]) : null;
    },

    async saveAvailable(input) {
      const result = await pool.query<MediaAssetRow>(
        `insert into media_assets (
           id, organization_id, request_fingerprint, normalized_query, provider, provider_asset_id,
           status, source_url, source_page_url, creator, licence, licence_url, object_key,
           mime_type, width, height, sha256, expires_at
         ) values ($1, $2, $3, $4, $5, $6, 'available', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, null)
         on conflict (organization_id, request_fingerprint) do update set
           normalized_query = excluded.normalized_query,
           provider = excluded.provider,
           provider_asset_id = excluded.provider_asset_id,
           status = 'available',
           source_url = excluded.source_url,
           source_page_url = excluded.source_page_url,
           creator = excluded.creator,
           licence = excluded.licence,
           licence_url = excluded.licence_url,
           object_key = excluded.object_key,
           mime_type = excluded.mime_type,
           width = excluded.width,
           height = excluded.height,
           sha256 = excluded.sha256,
           expires_at = null,
           updated_at = now()
         returning *`,
        [
          randomUUID(), input.organizationId, input.requestFingerprint, input.normalizedQuery,
          input.provider, input.providerAssetId, input.sourceUrl, input.sourcePageUrl, input.creator,
          input.licence, input.licenceUrl, input.objectKey, input.mimeType, input.width, input.height, input.sha256
        ]
      );
      return requireRow(result.rows[0]);
    },

    async saveUnavailable(input, now = new Date()) {
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
      const result = await pool.query<MediaAssetRow>(
        `insert into media_assets (
           id, organization_id, request_fingerprint, normalized_query, provider, status, expires_at, created_at, updated_at
         ) values ($1, $2, $3, $4, $5, 'unavailable', $6, $7, $7)
         on conflict (organization_id, request_fingerprint) do update set
           normalized_query = excluded.normalized_query,
           provider = excluded.provider,
           status = 'unavailable',
           provider_asset_id = null,
           source_url = null,
           source_page_url = null,
           creator = null,
           licence = null,
           licence_url = null,
           object_key = null,
           mime_type = null,
           width = null,
           height = null,
           sha256 = null,
           expires_at = excluded.expires_at,
           updated_at = excluded.updated_at
         where media_assets.status = 'unavailable'
         returning *`,
        [randomUUID(), input.organizationId, input.requestFingerprint, input.normalizedQuery, input.provider, expiresAt, now]
      );
      if (result.rows[0]) return fromRow(result.rows[0]);
      const healthy = await pool.query<MediaAssetRow>(
        "select * from media_assets where organization_id = $1 and request_fingerprint = $2 limit 1",
        [input.organizationId, input.requestFingerprint]
      );
      return requireRow(healthy.rows[0]);
    },

    async listForOrganization(organizationId) {
      const result = await pool.query<MediaAssetRow>(
        "select * from media_assets where organization_id = $1 order by created_at, id",
        [organizationId]
      );
      return result.rows.map(fromRow);
    },

    async deleteByIds(organizationId, ids) {
      if (!ids.length) return 0;
      const result = await pool.query(
        "delete from media_assets where organization_id = $1 and id = any($2::uuid[])",
        [organizationId, [...ids]]
      );
      return result.rowCount ?? 0;
    },

    async organizationIdForUser(userId) {
      const result = await pool.query<{ organization_id: string }>(
        "select organization_id from users where id = $1 limit 1",
        [userId]
      );
      return result.rows[0]?.organization_id ?? null;
    }
  };
}

function requireRow(row: MediaAssetRow | undefined): MediaAssetRecord {
  if (!row) throw new Error("MEDIA_ASSET_WRITE_FAILED");
  return fromRow(row);
}

function fromRow(row: MediaAssetRow): MediaAssetRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    requestFingerprint: row.request_fingerprint,
    normalizedQuery: row.normalized_query,
    provider: row.provider,
    providerAssetId: row.provider_asset_id,
    status: row.status,
    sourceUrl: row.source_url,
    sourcePageUrl: row.source_page_url,
    creator: row.creator,
    licence: row.licence,
    licenceUrl: row.licence_url,
    objectKey: row.object_key,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    sha256: row.sha256,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
