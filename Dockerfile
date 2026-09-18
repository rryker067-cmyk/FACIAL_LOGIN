FROM python:3.11-slim AS builder

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/local /usr/local
COPY . .

RUN mkdir -p /app/backend/app/models && \
    if [ ! -s /app/backend/app/models/face_recognition.onnx ]; then \
      python -c "import pathlib, shutil, urllib.request, zipfile; target=pathlib.Path('/app/backend/app/models/face_recognition.onnx'); archive_path=target.with_suffix('.zip'); shutil.copyfileobj(urllib.request.urlopen('https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_s.zip'), archive_path.open('wb')); archive=zipfile.ZipFile(archive_path); target.write_bytes(archive.read('w600k_mbf.onnx')); archive_path.unlink()"; \
    fi && \
    test -s /app/backend/app/models/face_recognition.onnx

EXPOSE 10000

CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1"]