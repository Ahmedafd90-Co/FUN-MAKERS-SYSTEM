-- Fun Makers KSA — PostgreSQL initialization
-- This script runs once when the postgres container is first created.
-- It creates the fmksa role (if not already created by POSTGRES_USER)
-- and sets up both the dev and test databases.

-- The fmksa role is already created by the POSTGRES_USER env var.
-- Grant it CREATEDB so Prisma can manage schemas.
ALTER ROLE fmksa CREATEDB;

-- Create the test database (dev database is created by POSTGRES_DB env var).
-- SELECT/CREATE IF NOT EXISTS pattern for idempotency.
SELECT 'CREATE DATABASE fmksa_test OWNER fmksa'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fmksa_test')\gexec

-- Grant full privileges on both databases
GRANT ALL PRIVILEGES ON DATABASE fmksa_dev TO fmksa;
GRANT ALL PRIVILEGES ON DATABASE fmksa_test TO fmksa;
