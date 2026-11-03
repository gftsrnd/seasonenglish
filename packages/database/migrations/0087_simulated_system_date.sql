create or replace function organization_system_date(target_organization_id uuid)
returns date
language sql
stable
as $$
  select coalesce(
    nullif(settings.configuration->>'simulatedSystemDate', '')::date,
    current_date
  )
  from organizations organization
  left join organization_settings settings on settings.organization_id = organization.id
  where organization.id = target_organization_id
$$;
