-- Tenant documents (D21 in docs/database-design.md): ID proof, passport
-- photo, rent agreement... attached to a tenant from the Edit tenant page.
--
-- One row per file, in the private rent-register bucket under the tenant's
-- own folder, tenants/<tenant>/documents/. `document_type` is free text: the
-- form suggests common types but the owner can type any other.
--
-- Unlike the ledger these are not money facts, so the owner may delete one
-- (a replaced ID proof, a wrong upload); a single-row write needs no SQL
-- function. Rows are never edited: re-upload instead.

create table tenant_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on update restrict on delete restrict,
  document_type text not null check (char_length(btrim(document_type)) between 1 and 60),
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 255),
  content_type text not null check (
    content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf')
  ),
  size_bytes integer not null check (size_bytes > 0),
  created_at timestamptz not null default now(),
  -- The file must live in this tenant's own folder.
  constraint tenant_documents_path_in_folder
    check (storage_path like 'tenants/' || tenant_id || '/documents/_%')
);

create index tenant_documents_tenant_id_idx on tenant_documents (tenant_id, created_at);

comment on table tenant_documents is
  'Files kept on a tenant (ID proof, passport photo, agreement...). Owner may add or delete; never edited.';
comment on column tenant_documents.document_type is 'What the file is, e.g. "ID proof (Aadhaar)" - free text.';
comment on column tenant_documents.storage_path is
  'Object path in the private rent-register bucket, always under tenants/<tenant_id>/documents/.';

alter table tenant_documents enable row level security;

create policy "owner reads tenant documents" on tenant_documents
  for select to authenticated using (is_app_owner());
create policy "owner adds tenant documents" on tenant_documents
  for insert to authenticated with check (is_app_owner());
create policy "owner deletes tenant documents" on tenant_documents
  for delete to authenticated using (is_app_owner());

revoke all on tenant_documents from anon;
revoke update on tenant_documents from authenticated;
