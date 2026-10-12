# infra

CDK stack (`DeciderPoc`) that deploys `../image` as a `DockerImageFunction`. See [../README.md](../README.md) for the full usage guide (日本語: [../README.ja.md](../README.ja.md)).

## Useful commands

* `npm run build`   type-check the project
* `npm run watch`   watch for changes and type-check
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy (x86_64). Use `-c arch=arm64` for Graviton
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
