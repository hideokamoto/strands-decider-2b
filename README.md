# strands-decider-2b PoC

[日本語はこちら](README.ja.md)

A demo for running [Strands Decider 2B](https://huggingface.co/StrandsAgents/strands-decider-2B-hobson-v19) with CPU inference.
Packaged as an AWS Lambda container image, so it can run both locally in Docker (via the Runtime Interface Emulator) and deployed on Lambda with AWS CDK.

## Layout

```
image/            Lambda container image
  Dockerfile      Based on public.ecr.aws/lambda/python:3.12.
                  Installs torch 2.7.1 (CPU) / transformers / peft /
                  strands-decider, and bundles model weights at /opt/model
                  (runs offline at runtime)
  handler.py      Lambda handler. Accepts a SystemOneRequest and returns
                  the evaluation result plus diagnostics
  events/         Sample events (01-single / 02-multi / 03-long)
infra/            AWS CDK (TypeScript). Deploys the image as a DockerImageFunction
```

## Prerequisites

- Docker (allocate at least 10 GB of memory — observed `peak_rss` is ~10 GB)
- For Lambda deployment: AWS CLI + a CDK-bootstrapped AWS account

## Run locally with Docker

Build:

```sh
docker build -t decider image/
```

On arm64 (e.g. Apple Silicon):

```sh
docker build --platform linux/arm64 --build-arg ARCH=arm64 -t decider image/
```

Run (model load takes several minutes):

```sh
docker run --rm -p 9000:8080 decider
```

Invoke (from another terminal):

```sh
curl -s -XPOST http://localhost:9000/2015-03-31/functions/function/invocations \
  -H 'Content-Type: application/json' \
  -d @image/events/02-multi.json | jq .
```

## Deploy to Lambda and invoke

```sh
cd infra
npm install
npx cdk deploy                # x86_64
npx cdk deploy -c arch=arm64  # Graviton (arm64)
```

Invoke using the `FunctionName` stack output:

```sh
aws lambda invoke \
  --function-name <FunctionName> \
  --cli-binary-format raw-in-base64-out \
  --payload file://image/events/02-multi.json \
  out.json
cat out.json | jq .
```

Configuration: 10240 MB memory, 15-minute timeout. On cold start, model loading alone takes several minutes (see `load_seconds`). Warm invocations return `cold: false` with much lower latency.

## Request format

`SystemOneRequest` schema: `state` is the text to evaluate and `questions` is a map of questions.

```json
{
  "state": "Help! My payouts have been failing for 3 days!",
  "questions": {
    "is_urgent":  { "type": "noul",   "instructions": "Does this convey urgency?" },
    "team":       { "type": "choice", "instructions": "Which team should handle this?",
                    "criteria": { "billing": null, "sales": null, "retail": null } },
    "frustration":{ "type": "score",  "instructions": "How frustrated is the writer?",
                    "criteria": ["calm", "frustrated", "depressed"] }
  }
}
```

Question types:

- `noul` — probability score between 0 and 1 (yes/no equivalent)
- `choice` — picks one key from the `criteria` dict (values can describe each option)
- `score` — scores the text on the axes listed in `criteria`

## Sample response

Measured output from `infra/out.json` (warm invocation):

```json
{
  "model": "strands-decider-0.1.0",
  "answers": {
    "is_urgent":  { "type": "noul", "noul": 0.7039 },
    "team":       { "type": "choice", "choice": "billing",
                    "probabilities": { "billing": 0.8263, "technical": 0.1682, "sales": 0.0055 },
                    "confidence": 0.7395 },
    "needs_human":{ "type": "noul", "noul": 0.5226 }
  },
  "usage": { "input_tokens": 392, "output_tokens": 3 },
  "latency_ms": 10079,
  "diagnostics": {
    "cold": false,
    "load_seconds": 429.1,
    "peak_rss_mb": 10084,
    "torch_threads": 6
  }
}
```

`diagnostics` is added by the handler: cold/warm flag, model load seconds, peak RSS, and torch thread count.

## Notes

- The model weights and the `strands_decider` library are baked into the image; `HF_HUB_OFFLINE=1` prevents any Hugging Face access at runtime.
- `strands-decider` is pinned to a GitHub commit SHA via the `DECIDER_SHA` build arg.
