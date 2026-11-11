-- Add ukma.edu.ua to the default university allow-list (US-06, A-17). Data only, no schema change.
-- A new migration, because the seed migration was already applied and committed.
INSERT OR IGNORE INTO "university_domains" ("domain") VALUES
  ('ukma.edu.ua');
