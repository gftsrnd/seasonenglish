alter table user_credentials
  add column if not exists recovery_ciphertext text,
  add column if not exists recovery_nonce text,
  add column if not exists recovery_auth_tag text;

