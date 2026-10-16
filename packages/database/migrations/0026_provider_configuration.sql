create table provider_configurations (
  organization_id uuid primary key references organizations(id) on delete cascade,
  provider text not null check (provider in ('claude', 'gemini', 'openai')),
  base_url text not null default '',
  model text not null default '',
  speech_to_text_model text not null default '',
  secret_ciphertext text,
  secret_nonce text,
  secret_auth_tag text,
  last_test_status text not null default 'never'
    check (last_test_status in ('never', 'success', 'error', 'timeout')),
  last_test_code text,
  last_tested_at timestamptz,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now(),
  check ((secret_ciphertext is null and secret_nonce is null and secret_auth_tag is null)
    or (secret_ciphertext is not null and secret_nonce is not null and secret_auth_tag is not null))
);
