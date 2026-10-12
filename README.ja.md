# strands-decider-2b PoC

[English version](README.md)

[Strands Decider 2B](https://huggingface.co/StrandsAgents/strands-decider-2B-hobson-v19) を CPU 推論で試すデモ。
AWS Lambda 用コンテナイメージとしてパッケージングしてあり、ローカル Docker（Runtime Interface Emulator 経由）と Lambda デプロイ（AWS CDK）の両方で動かせる。

## 構成

```
image/            Lambda コンテナイメージ
  Dockerfile      public.ecr.aws/lambda/python:3.12 ベース。
                  torch 2.7.1 (CPU) / transformers / peft / strands-decider を
                  インストールし、モデル重みを /opt/model に同梱（実行時はオフライン）
  handler.py      Lambda ハンドラ。SystemOneRequest を受けて評価結果+診断情報を返す
  events/         サンプルイベント (01-single / 02-multi / 03-long)
infra/            AWS CDK (TypeScript)。DockerImageFunction で Lambda をデプロイ
```

## 必要なもの

- Docker（メモリ 10GB 以上を割り当てること。`peak_rss` は約 10GB を観測）
- Lambda にデプロイする場合: AWS CLI + CDK bootstrap 済みの AWS アカウント

## ローカル Docker で試す

ビルド:

```sh
docker build -t decider image/
```

Apple Silicon など arm64 の場合:

```sh
docker build --platform linux/arm64 --build-arg ARCH=arm64 -t decider image/
```

起動（モデルロードに数分かかる）:

```sh
docker run --rm -p 9000:8080 decider
```

呼び出し（別ターミナルで）:

```sh
curl -s -XPOST http://localhost:9000/2015-03-31/functions/function/invocations \
  -H 'Content-Type: application/json' \
  -d @image/events/02-multi.json | jq .
```

## Lambda にデプロイして試す

```sh
cd infra
npm install
npx cdk deploy                # x86_64
npx cdk deploy -c arch=arm64  # Graviton (arm64) の場合
```

スタック出力の `FunctionName` を使って呼び出す:

```sh
aws lambda invoke \
  --function-name <FunctionName> \
  --cli-binary-format raw-in-base64-out \
  --payload file://image/events/02-multi.json \
  out.json
cat out.json | jq .
```

設定: メモリ 10240MB、タイムアウト 15 分。コールドスタートではモデルロードだけで数分かかる（`load_seconds` 参照）。ウォーム時は `cold: false` になりレイテンシが大きく下がる。

## リクエスト形式

`SystemOneRequest` スキーマ。`state` に判定対象テキスト、`questions` に質問のマップを渡す。

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

質問タイプ:

- `noul` — 0〜1 の確率スコア（yes/no 相当）
- `choice` — `criteria` 辞書のキーから1つを選択（値は選択肢の説明に使える）
- `score` — `criteria` リストの評価軸でスコアリング

## レスポンス例

`infra/out.json` の実測値（ウォーム実行）:

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

`diagnostics` はハンドラが付与する計測情報（コールド/ウォーム、モデルロード秒数、ピーク RSS、torch スレッド数）。

## メモ

- モデルと `strands_decider` ライブラリはイメージに同梱され、`HF_HUB_OFFLINE=1` で実行時に HF へアクセスしない。
- `strands-decider` は GitHub のコミット SHA（`DECIDER_SHA` ビルド引数）でピン留めしている。
