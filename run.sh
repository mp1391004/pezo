#!/bin/bash
# Pezo — chay tren may ban. Key Kyma nhap trong trinh duyet, khong can bien moi truong.
cd "$(dirname "$0")"
exec ./.venv/bin/uvicorn app.server:app --host 127.0.0.1 --port 5090 "$@"
