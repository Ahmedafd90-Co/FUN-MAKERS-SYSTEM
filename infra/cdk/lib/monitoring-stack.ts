import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import type { ComputeStack } from './compute-stack.js';
import type { DatabaseStack } from './database-stack.js';
import type { CacheStack } from './cache-stack.js';

export interface MonitoringStackProps extends cdk.StackProps {
  readonly compute: ComputeStack;
  readonly database: DatabaseStack;
  readonly cache: CacheStack;
  // TODO(phase 1.10): add alarm thresholds, SNS topic, dashboard config
}

export class MonitoringStack extends cdk.Stack {
  // TODO(phase 1.10): expose dashboard URL, alarm ARNs

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);
  }
}
