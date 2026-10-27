# prisma/

- `schema.prisma` is the schema (data-model.md). Edit it, then create a migration with
  `pnpm --filter @ctoc/api db:migrate:dev --name <what-changed>`.
- Prisma cannot express **CHECK constraints, partial unique indexes and NOCASE indexes**. They are written by
  hand in the migration SQL: the CHECKs inside `CREATE TABLE`, the indexes in the block at the end of
  `*_init/migration.sql`. When you change a table, extend the migration SQL by hand in the same way
  (data-model.md §1 lists what each table must enforce).
- Check that Prisma still sees no drift:
  `pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url file:/tmp/shadow.db --script`
  must print `-- This is an empty migration.`
- The database file is `apps/api/data/ctoc.db` (git-ignored). `pnpm db:reset` recreates it.
