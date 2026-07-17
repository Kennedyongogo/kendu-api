-- PostgreSQL: allow platform = jitsi on live_classes (Jitsi Meet — free testing).
-- Safe to re-run: ignores "already exists".

DO $$
BEGIN
  ALTER TYPE enum_live_classes_platform ADD VALUE 'jitsi';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
