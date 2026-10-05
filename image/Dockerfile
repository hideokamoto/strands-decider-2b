FROM public.ecr.aws/lambda/python:3.12

ARG ARCH=x86_64
ARG DECIDER_SHA=75c9fd32e664954cdc18481434018aa507eee8fb

RUN if [ "$ARCH" = "x86_64" ]; then \
      pip install --no-cache-dir torch==2.7.1 --index-url https://download.pytorch.org/whl/cpu ; \
    else \
      pip install --no-cache-dir torch==2.7.1 ; \
    fi \
 && pip install --no-cache-dir transformers==5.17.0 peft==0.21.0 \
 && SETUPTOOLS_SCM_PRETEND_VERSION=0.0.0 pip install --no-cache-dir \
      "https://github.com/strands-labs/strands-decider/archive/${DECIDER_SHA}.tar.gz"

# チェックポイントをローカルに置き、一度ロードしてベースの重みも同じリビジョンでキャッシュする
ENV HF_HOME=/opt/hf
RUN python -c "\
from huggingface_hub import snapshot_download; \
snapshot_download('StrandsAgents/strands-decider-2B-hobson-v19', local_dir='/opt/model'); \
from strands_decider.modeling import StrandsDeciderModel as M; M.load('/opt/model')" \
 && chmod -R a+rX /opt/hf /opt/model

ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    XDG_CACHE_HOME=/tmp/.cache \
    DECIDER_CHECKPOINT=/opt/model

COPY handler.py ${LAMBDA_TASK_ROOT}/
CMD ["handler.handler"]