-- Undoes 0039_correction_pin.sql (D41): corrections no longer need the PIN.
--
-- Moves the original functions back from private.<fn>_unchecked to their
-- public names with their pre-0039 grants, and drops the gated wrappers, the
-- PIN tables and functions. audit_action_label and audit_describe keep naming
-- the PIN events (harmless, and the audit log keeps its rows).
--
-- Run by hand in the SQL Editor, then redeploy the release before 0039: the
-- 0039 code sends a PIN the old functions don't check. Not a migration.

begin;

do $$
declare
  v_fn record;
begin
  for v_fn in
    select * from (values
      ('correct_paid_through', 'uuid, date'),
      ('correct_rent', 'uuid, date, numeric'),
      ('correct_move_out', 'uuid, date'),
      ('create_adjustment', 'uuid, uuid, numeric, text, text, text, timestamptz, jsonb'),
      ('stop_rent_tracking', 'uuid'),
      ('move_out_tenant', 'uuid, date'),
      ('update_tenant', 'uuid, text, text, text, text, text[], date, numeric, date, date, date, numeric, text, boolean')
    ) as f(name, args)
  loop
    if to_regprocedure(format('private.%s_unchecked(%s)', v_fn.name, v_fn.args)) is not null then
      execute format('drop function if exists public.%s(%s)', v_fn.name, v_fn.args);
      execute format('alter function private.%s_unchecked(%s) rename to %s', v_fn.name, v_fn.args, v_fn.name);
      execute format('alter function private.%s(%s) set schema public', v_fn.name, v_fn.args);
    end if;
    execute format('revoke all on function public.%s(%s) from public, anon, authenticated', v_fn.name, v_fn.args);
    execute format('grant execute on function public.%s(%s) to authenticated', v_fn.name, v_fn.args);
  end loop;
end $$;

drop function if exists verify_correction_pin(text, text, uuid);
drop function if exists set_correction_pin(text, text);
drop function if exists correction_pin_status();
drop function if exists consume_correction_ticket(text, uuid);
drop function if exists correction_pin_failed(text, uuid);
drop function if exists correction_pin_assert_unlocked(timestamptz);
drop function if exists log_correction_event(text, uuid, text);
drop function if exists correction_target_tenant(text, uuid);
drop function if exists correction_action_label(text);
drop function if exists correction_backdate_limit();
drop function if exists correction_pin_hash(text, text);
drop table if exists correction_tickets;
drop table if exists correction_guard;
drop schema if exists private;

commit;
