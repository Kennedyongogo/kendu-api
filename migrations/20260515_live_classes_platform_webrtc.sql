-- PostgreSQL: allow platform = webrtc on live_classes
DO $$
BEGIN
  ALTER TYPE enum_live_classes_platform ADD VALUE IF NOT EXISTS 'webrtc';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
