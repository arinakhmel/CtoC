-- Default university allow-list (US-06, A-17). Data only, no schema change.
-- A moderator edits the list later through /api/mod/university-domains.
INSERT OR IGNORE INTO "university_domains" ("domain") VALUES
  ('knu.edu.ua'),
  ('kpi.edu.ua'),
  ('lnu.edu.ua'),
  ('university.edu.ua');
