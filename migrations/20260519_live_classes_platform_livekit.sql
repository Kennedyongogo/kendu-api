-- PostgreSQL: allow platform = livekit on live_classes

DO $$ BEGIN
  ALTER TYPE enum_live_classes_platform ADD VALUE IF NOT EXISTS 'livekit';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
