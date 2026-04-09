import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import type { NetworkStack } from './network-stack.js';

export interface CacheStackProps extends cdk.StackProps {
  readonly network: NetworkStack;
  // TODO(phase 1.10): add node type, num replicas, engine version
}

export class CacheStack extends cdk.Stack {
  // TODO(phase 1.10): expose redis endpoint, port, security group

  constructor(scope: Construct, id: string, props: CacheStackProps) {
    super(scope, id, props);
  }
}
