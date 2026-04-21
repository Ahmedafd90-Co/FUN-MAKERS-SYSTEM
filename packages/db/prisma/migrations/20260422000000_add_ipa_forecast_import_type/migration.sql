-- Extend the ImportType enum with 'ipa_forecast' so sheet imports can
-- stage an IPA forecast alongside the existing budget_baseline and
-- ipa_history types.
--
-- Additive, non-destructive. Existing enum values are unchanged.
--
-- ALTER TYPE ... ADD VALUE is Postgres-specific and must run outside a
-- transaction for versions older than 12. Prisma runs each migration
-- file statement inside an implicit transaction. For 12+ this is fine;
-- we target Postgres 14+ in docker-compose.

ALTER TYPE "import_type" ADD VALUE IF NOT EXISTS 'ipa_forecast';
