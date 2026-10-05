import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // -c arch=arm64 で Graviton 版。既定は x86_64
    const arm = this.node.tryGetContext('arch') === 'arm64';

    const fn = new lambda.DockerImageFunction(this, 'Decider', {
      code: lambda.DockerImageCode.fromImageAsset(path.join(__dirname, '../../image'), {
        platform: arm ? Platform.LINUX_ARM64 : Platform.LINUX_AMD64,
        buildArgs: { ARCH: arm ? 'arm64' : 'x86_64' },
      }),
      architecture: arm ? lambda.Architecture.ARM_64 : lambda.Architecture.X86_64,
      memorySize: 10240,
      timeout: cdk.Duration.minutes(15),
      logGroup: new logs.LogGroup(this, 'Logs', {
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });

    new cdk.CfnOutput(this, 'FunctionName', { value: fn.functionName });
  }
}