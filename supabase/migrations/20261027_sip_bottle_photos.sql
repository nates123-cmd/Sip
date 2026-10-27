-- Sip: a photo of the bottle on a saved drink.
--
-- Like the other files here, this is the record of what was run by hand against
-- xsmnfcmtbpeaccnyinkr on 2026-10-27 (one statement per `supabase db query`,
-- from a linked checkout). Nothing applies it automatically.

-- 1. Where the photo lives. A storage path, never the image: a list load
--    selects up to 400 rows, and a base64 column would pull every photo on
--    every load against the suite's 5 GB egress cap.
alter table public.sip_tastings add column if not exists photo_path text;

-- 2. Private bucket, JPEG only. The client downscales to 900px long edge
--    before upload (~80 KB), so the 2 MB ceiling is a guard, not a budget.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sip-photos', 'sip-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

-- 3. Paths are <user_id>/<category>/<uuid>.jpg, so the same split the rows
--    carry can be read off the path: your own folder always, and a household
--    member's folder only under wine. Beer and spirit photos stay as private as
--    the beer and spirit rows they belong to.
--
--    Insert is own-folder only, exactly as row insert is own-row only. Delete
--    follows select, because rows follow it too: either of them can replace
--    the photo on a shared bottle, and a replaced photo should not orphan.
--    No update policy: a new photo is a new uuid, objects are never rewritten,
--    which is also what makes them safe to cache forever on the device.
create policy sip_photos_sel on storage.objects for select to authenticated
  using (
    bucket_id = 'sip-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or ((storage.foldername(name))[2] = 'wine'
          and (storage.foldername(name))[1] in (select h::text from public.household_ids() h))
    )
  );

create policy sip_photos_ins on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sip-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy sip_photos_del on storage.objects for delete to authenticated
  using (
    bucket_id = 'sip-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or ((storage.foldername(name))[2] = 'wine'
          and (storage.foldername(name))[1] in (select h::text from public.household_ids() h))
    )
  );
