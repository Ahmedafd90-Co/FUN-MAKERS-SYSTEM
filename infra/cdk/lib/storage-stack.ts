import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export interface StorageStackProps extends cdk.StackProps {
  // TODO(phase 1.10): add bucket names, lifecycle rules, CORS config
}

export class StorageStack extends cdk.Stack {
  // TODO(phase 1.10): expose bucket ARN, bucket name as readonly props

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);
  }
}
