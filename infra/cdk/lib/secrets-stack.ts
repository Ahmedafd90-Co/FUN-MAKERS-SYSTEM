import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import type { NetworkStack } from './network-stack.js';

export interface SecretsStackProps extends cdk.StackProps {
  readonly network: NetworkStack;
  // TODO(phase 1.10): add secret names, rotation config
}

export class SecretsStack extends cdk.Stack {
  // TODO(phase 1.10): expose secrets as readonly props

  constructor(scope: Construct, id: string, props: SecretsStackProps) {
    super(scope, id, props);
  }
}
