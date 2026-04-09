import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export interface NetworkStackProps extends cdk.StackProps {
  // TODO(phase 1.10): add environment-specific network config (CIDR, AZs, NAT strategy)
}

export class NetworkStack extends cdk.Stack {
  // TODO(phase 1.10): expose vpc, subnets, security groups as readonly props

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);
  }
}
