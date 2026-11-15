# syntax=docker/dockerfile:1
#
# Narrator voice for Phonegames: Piper TTS (https://github.com/OHF-Voice/piper1-gpl,
# GPL-3.0) with two German voices trained on CC0 data. Runs as a separate
# service that only the app container talks to (POST /synthesize -> WAV).
ARG BASE_IMAGE=python:3.13-slim
FROM ${BASE_IMAGE}

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /srv

COPY requirements.txt fetch_voices.py ./
RUN pip install --no-deps -r requirements.txt \
 && python fetch_voices.py /voices \
 && useradd --system --uid 10001 --home /srv piper

USER piper
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/voices', timeout=4)"]
CMD ["python", "-m", "piper.http_server", "-m", "/voices/de_DE-thorsten-high.onnx", "--data-dir", "/voices", "--host", "0.0.0.0", "--port", "5000"]
