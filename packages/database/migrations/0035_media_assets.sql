create table media_assets (
  id uuid primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  request_fingerprint text not null,
  normalized_query text not null,
  provider text not null check (provider in ('wikipedia', 'wikimedia', 'openverse', 'explicit')),
  provider_asset_id text,
  status text not null check (status in ('available', 'unavailable')),
  source_url text,
  source_page_url text,
  creator text,
  licence text,
  licence_url text,
  object_key text,
  mime_type text,
  width integer,
  height integer,
  sha256 text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index media_assets_organization_fingerprint_unique
  on media_assets(organization_id, request_fingerprint);

create index media_assets_status_expires_index
  on media_assets(status, expires_at);
