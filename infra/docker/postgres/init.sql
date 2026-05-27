-- Fun Makers KSA — PostgreSQL initialization
-- This script runs once when the postgres container is first created.
-- It creates the fmksa role (if not already created by POSTGRES_USER)
-- and sets up the dev + per-package test databases.

-- The fmksa role is already created by the POSTGRES_USER env var.
-- Grant it CREATEDB so Prisma can manage schemas.
ALTER ROLE fmksa CREATEDB;

-- Create the test databases (dev database is created by POSTGRES_DB env var).
-- SELECT/CREATE IF NOT EXISTS pattern for idempotency.
--
-- F3 (PIC-76): per-package test DBs prevent cross-package turbo concurrency
-- pollution. Each @fmksa/<pkg> with tests gets its own database; vitest setup
-- files (PIC-37/PIC-38 pattern) read DATABASE_URL_TEST_<PKG> to route. The
-- legacy `fmksa_test` is retained as a fallback for local-dev workflows that
-- haven't switched to per-package vars yet, and so prisma tooling has a
-- non-package DB to land in by default.
SELECT 'CREATE DATABASE fmksa_test OWNER fmksa'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fmksa_test')\gexec

SELECT 'CREATE DATABASE fmksa_test_db OWNER fmksa'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fmksa_test_db')\gexec

SELECT 'CREATE DATABASE fmksa_test_core OWNER fmksa'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fmksa_test_core')\gexec

-- Grant full privileges on all databases
GRANT ALL PRIVILEGES ON DATABASE fmksa_dev TO fmksa;
GRANT ALL PRIVILEGES ON DATABASE fmksa_test TO fmksa;
GRANT ALL PRIVILEGES ON DATABASE fmksa_test_db TO fmksa;
GRANT ALL PRIVILEGES ON DATABASE fmksa_test_core TO fmksa;
