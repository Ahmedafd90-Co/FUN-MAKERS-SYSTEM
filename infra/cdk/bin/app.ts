#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';

import { NetworkStack } from '../lib/network-stack.js';
import { SecretsStack } from '../lib/secrets-stack.js';
import { DatabaseStack } from '../lib/database-stack.js';
import { CacheStack } from '../lib/cache-stack.js';
import { StorageStack } from '../lib/storage-stack.js';
import { ComputeStack } from '../lib/compute-stack.js';
import { MonitoringStack } from '../lib/monitoring-stack.js';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------
const envName = 'dev';
const prefix = `FmksaDev`;

// NOTE: Account IDs are PLACEHOLDERs until Ahmed provides real AWS account IDs.
// Leaving env undefined so `cdk synth` works without AWS credentials.
// When real account IDs are provided, uncomment and set:
// const env: cdk.Environment = { account: '123456789012', region: 'me-south-1' };

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
const app = new cdk.App();

// 1. Network — VPC, subnets, security groups
const network = new NetworkStack(app, `${prefix}-Network`, {
  description: `[${envName}] VPC, subnets, and security groups`,
});

// 2. Secrets — SSM parameters, Secrets Manager
const secrets = new SecretsStack(app, `${prefix}-Secrets`, {
  description: `[${envName}] Secrets Manager and SSM parameters`,
  network,
});

// 3. Database — RDS Aurora PostgreSQL
const database = new DatabaseStack(app, `${prefix}-Database`, {
  description: `[${envName}] Aurora PostgreSQL cluster`,
  network,
  secrets,
});

// 4. Cache — ElastiCache Redis
const cache = new CacheStack(app, `${prefix}-Cache`, {
  description: `[${envName}] ElastiCache Redis cluster`,
  network,
});

// 5. Storage — S3 buckets
const storage = new StorageStack(app, `${prefix}-Storage`, {
  description: `[${envName}] S3 document and asset buckets`,
});

// 6. Compute — ECS Fargate services, ALB
const compute = new ComputeStack(app, `${prefix}-Compute`, {
  description: `[${envName}] ECS Fargate services and ALB`,
  network,
  database,
  cache,
  storage,
  secrets,
});

// 7. Monitoring — CloudWatch dashboards, alarms, SNS
new MonitoringStack(app, `${prefix}-Monitoring`, {
  description: `[${envName}] CloudWatch dashboards and alarms`,
  compute,
  database,
  cache,
});

app.synth();
