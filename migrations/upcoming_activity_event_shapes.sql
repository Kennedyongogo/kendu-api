-- Move upcoming activity shapes from novelty clip-paths to polished card styles.
-- Convert ENUM to VARCHAR so new styles can be added without Postgres enum friction.

ALTER TABLE upcoming_activities
  ALTER COLUMN shape TYPE VARCHAR(40) USING shape::text;

ALTER TABLE upcoming_activities
  ALTER COLUMN shape SET DEFAULT 'event_card';

UPDATE upcoming_activities
SET shape = 'ticket'
WHERE shape IN ('ribbon', 'banner', 'pill');

UPDATE upcoming_activities
SET shape = 'event_card'
WHERE shape IS NULL
   OR shape NOT IN ('event_card', 'ticket');
