alter table assessment_versions add column bank_managed boolean not null default false;
alter table assessment_versions add column bank_archived boolean not null default false;

create table assessment_bank_policies (
  organization_id uuid not null references organizations(id),
  scope text not null check (scope in ('placement','retake','pass_course','A2','B1','B2','C1')),
  mode text not null check (mode in ('single','mixed')),
  primary key (organization_id, scope)
);
create table assessment_bank_policy_sources (
  organization_id uuid not null,
  scope text not null,
  position integer not null,
  version_id uuid not null references assessment_versions(id),
  primary key (organization_id, scope, position),
  unique (organization_id, scope, version_id),
  foreign key (organization_id, scope) references assessment_bank_policies on delete cascade
);
create index assessment_bank_policy_version on assessment_bank_policy_sources (version_id);

create table assessment_bank_attempts (
  attempt_id uuid primary key references assessment_attempts on delete cascade,
  scope text not null,
  manifest jsonb not null
);
create table assessment_bank_attempt_sources (
  attempt_id uuid not null references assessment_bank_attempts on delete cascade,
  version_id uuid not null references assessment_versions(id),
  primary key (attempt_id, version_id)
);
create index assessment_bank_source_history on assessment_bank_attempt_sources(version_id);

create function protect_assessment_bank_version() returns trigger language plpgsql as $$
begin
  if exists (select 1 from assessment_definitions where id = old.definition_id and kind <> 'final') then
    if tg_op = 'DELETE' or old.blueprint is distinct from new.blueprint or
      old.definition_id is distinct from new.definition_id or old.rubric_version_id is distinct from new.rubric_version_id or
      old.version is distinct from new.version or (old.status <> 'draft' and new.status = 'draft') then
      if (old.bank_managed and (old.status = 'published' or old.published_at is not null)) or
         exists (select 1 from assessment_bank_attempt_sources where version_id = old.id) or
         exists (select 1 from assessment_bank_policy_sources where version_id = old.id) or
         exists (select 1 from assessment_attempts where assessment_version_id = old.id) then
        raise exception 'ASSESSMENT_BANK_VERSION_IN_USE' using errcode = '23514';
      end if;
    end if;
    if tg_op = 'UPDATE' and new.status <> 'published' and old.status = 'published' and
      exists (select 1 from assessment_bank_policy_sources where version_id = old.id) then
      raise exception 'ASSESSMENT_BANK_SOURCE_CONFIGURED' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger protect_assessment_bank_version before update or delete on assessment_versions
for each row execute function protect_assessment_bank_version();

-- Keep shared uploaded listening media and submitted recordings while the
-- corresponding assessment version or attempt remains in history.
create table assessment_version_audio (
  version_id uuid not null references assessment_versions on delete cascade,
  file_id uuid not null references files,
  primary key (version_id,file_id)
);
create index assessment_version_audio_file on assessment_version_audio(file_id);
create table assessment_attempt_audio (
  attempt_id uuid not null references assessment_attempts on delete cascade,
  file_id uuid not null references files,
  primary key (attempt_id,file_id)
);
create index assessment_attempt_audio_file on assessment_attempt_audio(file_id);

create function retain_version_audio(v assessment_versions) returns void language sql as $$
 insert into assessment_version_audio(version_id,file_id)
 select distinct v.id,f.id from assessment_definitions d
 cross join lateral jsonb_array_elements(v.blueprint->'sections') sec
 cross join lateral jsonb_array_elements(sec->'groups') grp
 join files f on f.purpose='content_media' and f.deleted_at is null
   and grp->'stimulus'->>'audioSrc' in ('/api/v1/files/content-media/read?artifactKey='||f.object_key,
       '/api/v1/files/content-media/read?artifactKey='||replace(f.object_key,'/','%2F'))
 where d.id=v.definition_id and d.organization_id=f.organization_id and d.kind<>'final'
 on conflict do nothing
$$;
create function remember_version_audio() returns trigger language plpgsql as $$
begin
  if new.status='published' then perform retain_version_audio(new); end if;
  return new;
end $$;
create trigger remember_version_audio after insert or update of status on assessment_versions
for each row execute function remember_version_audio();
select retain_version_audio(v) from assessment_versions v where published_at is not null or status='published';

insert into assessment_attempt_audio(attempt_id,file_id)
select distinct a.id,f.id from files f join assessment_attempts a on a.learner_id=f.owner_user_id and a.id=f.source_entity_id
where f.purpose='assessment_audio' and f.deleted_at is null
union
select distinct a.id,f.id from assessment_responses r join assessment_attempts a on a.id=r.attempt_id
join files f on f.owner_user_id=a.learner_id and f.object_key=r.response->>'artifactKey'
where f.purpose='assessment_audio' and f.deleted_at is null;

create function retain_response_audio() returns trigger language plpgsql as $$
declare media files;
begin
  if new.response->>'evidenceType'='audio' and new.response->>'artifactKey' is not null then
    select f.* into media from files f join assessment_attempts a on a.learner_id=f.owner_user_id
      where a.id=new.attempt_id and f.purpose='assessment_audio' and f.object_key=new.response->>'artifactKey'
      for update of f;
    if media.id is not null then
      if media.deleted_at is not null then raise exception 'ASSESSMENT_AUDIO_ALREADY_DELETED'; end if;
      insert into assessment_attempt_audio values(new.attempt_id,media.id) on conflict do nothing;
    end if;
  end if;
  return new;
end $$;
create trigger retain_response_audio after insert or update of response on assessment_responses
for each row execute function retain_response_audio();

create function retain_linked_attempt_audio() returns trigger language plpgsql as $$
begin
  if new.purpose='assessment_audio' and new.source_entity_id is not null and new.deleted_at is null then
    insert into assessment_attempt_audio select id,new.id from assessment_attempts
      where id=new.source_entity_id and learner_id=new.owner_user_id on conflict do nothing;
  end if;
  return new;
end $$;
create trigger retain_linked_attempt_audio after insert or update of source_entity_id on files
for each row execute function retain_linked_attempt_audio();

create function assessment_file_retained(fid uuid) returns boolean language sql stable as $$
 select exists(select 1 from assessment_version_audio where file_id=fid)
     or exists(select 1 from assessment_attempt_audio where file_id=fid)
$$;
create function protect_retained_file() returns trigger language plpgsql as $$
begin
  if old.deleted_at is null and new.deleted_at is not null and assessment_file_retained(old.id) then
    raise exception 'ASSESSMENT_AUDIO_RETAINED';
  end if;
  return new;
end $$;
create trigger protect_retained_file before update of deleted_at on files
for each row execute function protect_retained_file();
create function keep_assessment_audio_unexpired() returns trigger language plpgsql as $$
begin
  if new.retention_until is not null and (assessment_file_retained(new.id) or
      (new.purpose='assessment_audio' and exists(select 1 from assessment_attempts a
        where a.id=new.source_entity_id and a.learner_id=new.owner_user_id))) then
    new.retention_until=null;
  end if;
  return new;
end $$;
create trigger keep_assessment_audio_unexpired before insert or update on files
for each row execute function keep_assessment_audio_unexpired();
update files set retention_until=null where retention_until is not null and assessment_file_retained(id);
