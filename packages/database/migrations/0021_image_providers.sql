alter table organization_settings
  drop constraint if exists organization_settings_vocab_image_source_check;

alter table organization_settings
  add constraint organization_settings_vocab_image_source_check
  check (vocab_image_source in ('pexels', 'pixabay', 'wikimedia', 'openverse', 'disabled'));
