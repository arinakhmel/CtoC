-- Skill catalogue for the profile (US-10): the list a student can pick from. Data only, no schema change.
-- Students can also type their own skills; those are stored with in_catalog = 0.
INSERT OR IGNORE INTO "skills" ("id", "name", "in_catalog") VALUES
  (lower(hex(randomblob(16))), 'Java', 1),
  (lower(hex(randomblob(16))), 'JavaScript', 1),
  (lower(hex(randomblob(16))), 'TypeScript', 1),
  (lower(hex(randomblob(16))), 'Python', 1),
  (lower(hex(randomblob(16))), 'C#', 1),
  (lower(hex(randomblob(16))), 'SQL', 1),
  (lower(hex(randomblob(16))), 'HTML', 1),
  (lower(hex(randomblob(16))), 'CSS', 1),
  (lower(hex(randomblob(16))), 'React', 1),
  (lower(hex(randomblob(16))), 'Node.js', 1),
  (lower(hex(randomblob(16))), 'Git', 1),
  (lower(hex(randomblob(16))), 'Figma', 1),
  (lower(hex(randomblob(16))), 'Photoshop', 1),
  (lower(hex(randomblob(16))), 'Excel', 1),
  (lower(hex(randomblob(16))), 'WordPress', 1),
  (lower(hex(randomblob(16))), 'Копірайтинг', 1),
  (lower(hex(randomblob(16))), 'Переклад', 1),
  (lower(hex(randomblob(16))), 'SMM', 1),
  (lower(hex(randomblob(16))), 'Відеомонтаж', 1),
  (lower(hex(randomblob(16))), 'Дизайн логотипів', 1);

-- A skill that a student had already typed before this migration becomes part of the catalogue.
UPDATE "skills" SET "in_catalog" = 1 WHERE "name" IN
  ('Java', 'JavaScript', 'TypeScript', 'Python', 'C#', 'SQL', 'HTML', 'CSS', 'React', 'Node.js', 'Git', 'Figma',
   'Photoshop', 'Excel', 'WordPress', 'Копірайтинг', 'Переклад', 'SMM', 'Відеомонтаж', 'Дизайн логотипів');
