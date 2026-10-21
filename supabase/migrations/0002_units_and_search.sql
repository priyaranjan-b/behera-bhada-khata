-- A property (building/complex) can contain both residential and commercial
-- units, so "type" moves from properties down to the individual tenant's
-- rental unit, alongside a structured identifier (tower/floor/house number)
-- replacing the old free-text unit_label - and a business_name for
-- commercial tenants, who are often searched for by their shop/business name
-- rather than a personal name.

alter table properties drop column type;

alter table tenants
  add column unit_type text not null default 'residential' check (unit_type in ('residential', 'commercial')),
  add column business_name text,
  add column tower text,
  add column floor text,
  add column house_number text;

alter table tenants drop column unit_label;
