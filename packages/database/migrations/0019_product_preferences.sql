alter table organization_settings
  add column if not exists theme text not null default 'auto'
    check (theme in ('auto', 'spring', 'summer', 'autumn', 'winter', 'tet', 'midautumn', 'christmas')),
  add column if not exists vocab_image_source text not null default 'wikimedia'
    check (vocab_image_source in ('pexels', 'pixabay', 'wikimedia', 'openverse', 'disabled'));
