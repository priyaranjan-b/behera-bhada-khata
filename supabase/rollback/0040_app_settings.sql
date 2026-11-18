-- Undoes 0040_app_settings.sql (D42): drops app_settings, its policies and
-- triggers (and 0041's column grant with it - 0041's rollback isn't needed
-- first). The UI then shows dates in the default format. Run by hand in the
-- SQL Editor, then redeploy the release before 0040. Not a migration.
--
-- audit_action_label and audit_describe keep their settings lines (harmless:
-- they only name rows the audit log already holds, which stay).

drop table if exists app_settings cascade;
