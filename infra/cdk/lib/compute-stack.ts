import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import type { NetworkStack } from './network-stack.js';
import type { DatabaseStack } from './database-stack.js';
import type { CacheStack } from './cache-stack.js';
import type { StorageStack } from './storage-stack.js';
import type { SecretsStack } from './secrets-stack.js';

export interface ComputeStackProps extends cdk.StackProps {
  readonly network: NetworkStack;
  readonly database: DatabaseStack;
  readonly cache: CacheStack;
  readonly storage: StorageStack;
  readonly secrets: SecretsStack;
  // TODO(phase 1.10): add ECS cluster config, task definitions, ALB config
}

export class ComputeStack extends cdk.Stack {
  // TODO(phase 1.10): expose ALB DNS, ECS service, task definition

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);
  }
}
