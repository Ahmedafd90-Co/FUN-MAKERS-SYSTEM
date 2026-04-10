import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import type { NetworkStack } from './network-stack.js';
import type { SecretsStack } from './secrets-stack.js';

export interface DatabaseStackProps extends cdk.StackProps {
  readonly network: NetworkStack;
  readonly secrets: SecretsStack;
  // TODO(phase 1.10): add instance class, storage, multi-AZ, backup config
}

export class DatabaseStack extends cdk.Stack {
  // TODO(phase 1.10): expose cluster endpoint, read endpoint, security group

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);
  }
}
