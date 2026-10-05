import json
import os
import resource
import time

import torch

_t0 = time.perf_counter()
from strands_decider.infer import load_engine
from strands_decider.schema import SystemOneRequest

ENGINE = load_engine(os.environ["DECIDER_CHECKPOINT"], device="cpu")
LOAD_SECONDS = round(time.perf_counter() - _t0, 1)
_cold = True


def handler(event, _context):
    global _cold
    body = event.get("body", event)
    if isinstance(body, str):
        body = json.loads(body)
    request = SystemOneRequest.model_validate(body)

    started = time.perf_counter()
    with torch.inference_mode():
        out = ENGINE.evaluate(request).model_dump()
    out["latency_ms"] = round((time.perf_counter() - started) * 1000)
    out["diagnostics"] = {
        "cold": _cold,
        "load_seconds": LOAD_SECONDS,
        "peak_rss_mb": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss // 1024,
        "torch_threads": torch.get_num_threads(),
    }
    _cold = False
    return out