-- Private bucket for signatures and signed receipts (src/server/adapters/supabase/storage.ts).
-- Only the service role reads or writes it: storage.objects has RLS enabled
-- and this migration adds no policies for anon/authenticated, so the browser
-- only ever gets short-lived signed URLs minted by the server.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rent-register', 'rent-register', false, 2097152, array['image/png', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
