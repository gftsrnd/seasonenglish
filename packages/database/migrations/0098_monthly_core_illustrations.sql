-- AI illustrations for the month's core words (one square 256px image per word).
-- Generated while the resource pool is a draft; approval copies the ready image
-- URLs into the locked curriculum contract, after which images cannot change.
create table if not exists month_framework_images (
  framework_id uuid not null references month_frameworks(id) on delete cascade,
  -- Normalised (trimmed, lower-case) core word; a renamed core word gets a new image.
  word text not null,
  status text not null default 'pending' check (status in ('pending', 'generating', 'ready', 'failed')),
  source text not null default 'ai' check (source in ('ai', 'upload')),
  artifact_key text,
  mime_type text,
  prompt_hint text,
  error text,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now(),
  primary key (framework_id, word)
);

create index if not exists month_framework_images_status_index
  on month_framework_images (framework_id, status);
