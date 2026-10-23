-- Payment proof attachments (D19 in docs/database-design.md).
--
-- The owner can attach photos or PDFs (a UPI screenshot, a cheque, a bank
-- slip) when recording a payment. The files live in the private
-- rent-register bucket under the payment's own folder,
-- payments/<tenant>/<payment>/proofs/..., and one payment_proofs row per file
-- records it. The rows are written by create_payment in the same transaction
-- as the payment, and like the rest of the ledger they are append-only.

create table payment_proofs (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments (id) on update restrict on delete restrict,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 255),
  content_type text not null check (
    content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf')
  ),
  size_bytes integer not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);

create index payment_proofs_payment_id_idx on payment_proofs (payment_id);

comment on table payment_proofs is
  'Files the owner attached as proof of a payment (append-only; written by create_payment).';
comment on column payment_proofs.storage_path is
  'Object path in the private rent-register bucket, always under the payment''s own folder.';
comment on column payment_proofs.file_name is 'Original file name, for display only.';

alter table payment_proofs enable row level security;

create policy "owner reads payment proofs" on payment_proofs
  for select to authenticated using (is_app_owner());
create policy "owner attaches proofs to pending payments" on payment_proofs
  for insert to authenticated with check (
    is_app_owner()
    and exists (select 1 from payments where payments.id = payment_proofs.payment_id and payments.status = 'pending')
  );

revoke all on payment_proofs from anon;
revoke update, delete on payment_proofs from authenticated;

-- create_payment gains p_proofs. Drop the old signature so there's exactly
-- one create_payment (an overload with a default would be ambiguous).
drop function create_payment(uuid, uuid, numeric, date, text, text, text, text, timestamptz, jsonb);

create function create_payment(
  p_id uuid,
  p_tenant_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_mode text,
  p_note text,
  p_owner_signature_path text,
  p_token_hash text,
  p_token_expires_at timestamptz,
  p_allocations jsonb,
  p_proofs jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
  v_distinct integer;
  v_total numeric(12, 2);
  v_proof_folder text := 'payments/' || p_tenant_id || '/' || p_id || '/proofs/';
begin
  if not is_app_owner() then
    raise exception 'Not allowed' using errcode = 'BBK04';
  end if;
  if not exists (select 1 from tenants where id = p_tenant_id) then
    raise exception 'Tenant not found' using errcode = 'BBK04';
  end if;

  select count(*), count(distinct rent_period_id), coalesce(sum(amount), 0)
  into v_count, v_distinct, v_total
  from allocation_rows(p_allocations);

  if v_count = 0 then
    raise exception 'Select at least one month' using errcode = 'BBK00';
  end if;
  if v_distinct <> v_count then
    raise exception 'Each month can only appear once' using errcode = 'BBK00';
  end if;
  if exists (select 1 from allocation_rows(p_allocations) where amount is null or amount <= 0) then
    raise exception 'Each month''s amount must be more than zero' using errcode = 'BBK00';
  end if;
  if v_total <> round(p_amount, 2) then
    raise exception 'The months add up to %, not the payment amount %', v_total, round(p_amount, 2)
      using errcode = 'BBK00';
  end if;
  if exists (
    select 1 from allocation_rows(p_allocations) a
    left join rent_periods r on r.id = a.rent_period_id and r.tenant_id = p_tenant_id
    where r.id is null
  ) then
    raise exception 'A selected month doesn''t belong to this tenant' using errcode = 'BBK00';
  end if;
  if exists (
    select 1 from allocation_rows(p_allocations) a
    join rent_periods r on r.id = a.rent_period_id
    where a.amount > r.amount_due - r.amount_allocated
  ) then
    raise exception 'A month is allocated more than is still owed for it' using errcode = 'BBK00';
  end if;

  -- Proofs. The app allows fewer; 10 is the hard ceiling.
  if jsonb_typeof(coalesce(p_proofs, '[]'::jsonb)) <> 'array' then
    raise exception 'Proofs must be a list' using errcode = 'BBK00';
  end if;
  if jsonb_array_length(coalesce(p_proofs, '[]'::jsonb)) > 10 then
    raise exception 'Attach at most 10 proof files' using errcode = 'BBK00';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_proofs, '[]'::jsonb)) f
    where f ->> 'storage_path' is null
       or left(f ->> 'storage_path', length(v_proof_folder)) <> v_proof_folder
       or length(f ->> 'storage_path') = length(v_proof_folder)
  ) then
    raise exception 'A proof file isn''t stored under this payment' using errcode = 'BBK00';
  end if;

  insert into payments (
    id, tenant_id, amount, payment_date, mode, note,
    owner_signature_path, token_hash, token_expires_at
  ) values (
    p_id, p_tenant_id, round(p_amount, 2), p_payment_date, p_mode, p_note,
    p_owner_signature_path, p_token_hash, p_token_expires_at
  );

  insert into payment_allocations (payment_id, rent_period_id, amount_allocated)
  select p_id, rent_period_id, amount from allocation_rows(p_allocations);

  -- File name, type and size are checked by the table's constraints (23514 /
  -- 23505 surface as a generic error; the app validates them first).
  insert into payment_proofs (payment_id, storage_path, file_name, content_type, size_bytes)
  select p_id, f ->> 'storage_path', f ->> 'file_name', f ->> 'content_type', (f ->> 'size_bytes')::integer
  from jsonb_array_elements(coalesce(p_proofs, '[]'::jsonb)) f;
end;
$$;

revoke all on function create_payment(uuid, uuid, numeric, date, text, text, text, text, timestamptz, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function create_payment(uuid, uuid, numeric, date, text, text, text, text, timestamptz, jsonb, jsonb)
  to authenticated;

-- The bucket now also takes photos and PDFs of proofs, up to 4 MB each (the
-- app keeps a whole request under Vercel's 4.5 MB body limit).
update storage.buckets
set file_size_limit = 4194304,
    allowed_mime_types = array[
      'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'
    ]
where id = 'rent-register';
