# Document Storage — Production Configuration

This document covers the operational setup for the Document Foundation's S3 storage in a production environment. The code is **already env-driven and region-agnostic** — no region, bucket, or credential value is hardcoded in source. This document records the mechanism, the required environment variables, and the operational decisions Pico Play has not yet made (clearly marked `<PD-DECISION-PENDING>` per the [PIC-41](https://linear.app/pico-play-ksa/issue/PIC-41) lesson — do not invent operational values to make the doc look complete).

## How it works (the mechanism)

The Document Foundation uses an abstract `StorageAdapter` interface (`packages/core/src/documents/storage.ts`) with a single concrete implementation today: `S3StorageAdapter` (`packages/core/src/documents/storage/s3-adapter.ts`). The adapter is constructed via a factory that reads from environment variables — no values are baked into source. The same adapter code drives both local development (MinIO via Docker Compose) and production (AWS S3 in `me-central-1`) — only the env vars differ.

```ts
// packages/core/src/documents/storage.ts
export function createStorageAdapter(): StorageAdapter {
  return new S3StorageAdapter({
    endpoint: process.env.STORAGE_ENDPOINT,
    region: process.env.STORAGE_REGION || 'us-east-1',
    bucket: process.env.STORAGE_BUCKET || 'fmksa-dev-documents',
    accessKeyId: process.env.STORAGE_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.STORAGE_SECRET_KEY || 'minioadmin',
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true',
  });
}
```

The defaults are the local-development values (MinIO). Production environments override **all** of them.

## Environment variables

| Variable | Required in production | Description | Example |
|---|---|---|---|
| `STORAGE_ENDPOINT` | No (omit for AWS S3) | Custom endpoint URL. Set for MinIO or non-AWS S3-compatible services. **Leave unset** to use AWS S3's default endpoint, which is what production should do. | (unset) for AWS; `http://minio:9000` for local |
| `STORAGE_REGION` | **Yes** | AWS region for the S3 bucket. Production is `me-central-1`. | `me-central-1` |
| `STORAGE_BUCKET` | **Yes** | S3 bucket name. See [Bucket naming](#bucket-naming) below for the pending decision. | `<PD-DECISION-PENDING>` |
| `STORAGE_ACCESS_KEY` | **Yes** | IAM access key ID for the application's service account. Must NOT be a root account key. | `AKIA...` |
| `STORAGE_SECRET_KEY` | **Yes** | IAM secret access key paired with the access key. Secret — never commit. | `<set in deploy env>` |
| `STORAGE_FORCE_PATH_STYLE` | No | Set to `true` for MinIO. Leave unset (defaults to false) for AWS S3 — virtual-hosted style is the modern S3 default and required for some bucket-name patterns. | (unset) for AWS; `true` for local |

**Hard rule:** none of these values appear in source code, seed data, fixtures, or test-as-policy. The repository's defaults are deliberately local-development MinIO values; production overrides them all via the deployment platform's environment configuration.

## Bucket naming

**`<PD-DECISION-PENDING>`** — Pico Play has not yet decided the production bucket name or the bucket-naming convention.

Constraints to consider when the PD makes this call:
- S3 bucket names are globally unique across all AWS accounts. A pattern like `projectledger-documents-prod` may be taken; namespacing by account number or organisation slug avoids collisions.
- Bucket names are visible in pre-signed URLs (the host part). If that visibility matters, the bucket name should be neutral rather than internally descriptive.
- One bucket vs. multiple (per-environment, per-project, per-entity) is itself a decision. The current adapter assumes one bucket per environment, with per-record key prefixes inside it. Multi-bucket would require adapter changes.

Until the PD decides, deployments that try to read documents will fail loudly on startup (the bucket name env var has no production-safe default).

## IAM policy

**`<PD-DECISION-PENDING>`** — the exact IAM policy attached to the application's service account is a Pico Play security decision. Below is the minimum permission set the adapter actually exercises today; the PD should review and scope it down further as appropriate.

```jsonc
// Minimum permissions the S3StorageAdapter uses today.
// `<PD-DECISION-PENDING>` — review and scope further before production deploy.
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ProjectLedgerDocumentObjectIO",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",     // upload()
        "s3:GetObject",     // download() + presigned download URLs
        "s3:DeleteObject"   // delete()
      ],
      "Resource": "arn:aws:s3:::<bucket-name-pending>/*"
    }
  ]
}
```

Notes on this minimum set:
- **No `s3:ListBucket`** — the adapter does not enumerate keys. Adding it would expose all document file keys to anyone with the credential.
- **No `s3:PutObjectAcl`** — the adapter does not set per-object ACLs. The bucket's default ACL controls visibility.
- **No bucket-level permissions** (`s3:GetBucketLocation`, etc.) — not needed for the operations the adapter performs.
- **Resource scope is `bucket-name/*` (objects), not `bucket-name` (the bucket itself)** — least-privilege.

When the PD decides the bucket name, substitute it for `<bucket-name-pending>` in the `Resource` ARN. If multiple buckets are introduced later, the resource list expands.

## Presigned download URL TTL

The adapter generates presigned GET URLs (download only) with a **15-minute default TTL** (`packages/core/src/documents/storage/s3-adapter.ts` `DEFAULT_EXPIRY_SECONDS`). Callers can override per-request (e.g. for short-lived viewer URLs vs. longer-lived email links), but the 15-minute default is the safe baseline — short enough that a leaked URL has limited blast radius, long enough that a user can open the document, read it, and close it without re-fetching.

**Note (PIC-57):** the current path is **download-only presigning** + **server-mediated upload** (multipart → API route → buffer → S3). There is no presigned PUT path today; upload is hard-capped at 50MB. Files larger than 50MB (FAT video, large CAD, multi-sheet PDF batches) require the presigned-PUT mechanism tracked at [PIC-57](https://linear.app/pico-play-ksa/issue/PIC-57). That ticket is sequenced before Material Lifecycle PRs (Layer 2.5 PR-8+).

## Local development (reference)

The repository defaults to MinIO via Docker Compose, so no env vars are required for `pnpm dev` to work out of the box. The full MinIO setup is in `docs/local-setup.md`. To run against AWS S3 from a local machine (e.g. to test a region-specific issue), export the production-shape env vars in your shell before starting the dev server — the same adapter code paths handle both.

## Operational checklist before production deploy

The PD owns these decisions; this list is the engineering side of the readiness gate:

- [ ] Bucket name decided and provisioned in `me-central-1`. (`<PD-DECISION-PENDING>`)
- [ ] IAM service-account access key + secret provisioned, scoped via the policy above. (`<PD-DECISION-PENDING>`)
- [ ] Deployment platform's env config sets all five required vars (`STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`; `STORAGE_FORCE_PATH_STYLE` deliberately unset).
- [ ] `STORAGE_ENDPOINT` is unset in production (omitting it makes the AWS SDK use the default AWS S3 endpoint, which is correct).
- [ ] Bucket versioning, lifecycle rules, server-side-encryption defaults, and access logging are configured per Pico Play's data-retention and compliance posture. (`<PD-DECISION-PENDING>` — these are bucket properties outside the application's control.)
- [ ] A smoke-test plan exists: upload a small file via the application, verify it lands at the expected key prefix in the bucket, verify a presigned download URL works from a browser, verify the URL expires at 15 minutes.

## Related

- Code: `packages/core/src/documents/storage.ts` (factory) + `packages/core/src/documents/storage/s3-adapter.ts` (implementation).
- API route: `apps/web/app/api/upload/route.ts` (server-mediated upload entry).
- Tickets: [PIC-51](https://linear.app/pico-play-ksa/issue/PIC-51) (this PR), [PIC-57](https://linear.app/pico-play-ksa/issue/PIC-57) (presigned-PUT for large files).
- Source-of-truth docs: [Layer 2.5 — Architecture Decisions & Build Sequence](https://linear.app/pico-play-ksa/document/layer-25-architecture-decisions-and-build-sequence-085b7d089e9e) Decision D6 (Document Foundation sequencing).
