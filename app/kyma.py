import os, time, requests

# Dung kho chung chi cua he dieu hanh (Windows co antivirus/proxy chan SSL
# se bao CERTIFICATE_VERIFY_FAILED neu chi dung certifi).
try:
    import truststore
    truststore.inject_into_ssl()
except Exception:
    pass
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


class KymaError(RuntimeError):
    """Loi khong the retry: het credit, sai key, model khong ton tai."""


def _fatal(status, text):
    t = (text or "")[:400]
    if status == 402 or "insufficient_credits" in t:
        import re as _re
        m = _re.search(r"\$-?[\d.]+", t)
        bal = f" (số dư {m.group(0)})" if m else ""
        return KymaError(f"Hết credit Kyma{bal}. Nạp thêm tại kymaapi.com rồi bấm Chạy lại.")
    if status in (401, 403):
        return KymaError("API key Kyma không hợp lệ hoặc bị từ chối.")
    if status == 404:
        return KymaError("Model không tồn tại trên Kyma.")
    return None

S = requests.Session()
_ad = HTTPAdapter(max_retries=Retry(total=4, backoff_factor=1.5,
                                    status_forcelist=[429, 500, 502, 503, 504],
                                    allowed_methods=frozenset(["GET", "POST"])),
                  pool_maxsize=32)
S.mount("https://", _ad); S.mount("http://", _ad)


def _fetch(url, tries=4):
    last = None
    for i in range(tries):
        try:
            r = S.get(url, timeout=(15, 180))
            r.raise_for_status()
            return r.content
        except Exception as e:
            last = e; time.sleep(2 * (i + 1))
    raise last

BASE = os.environ.get("KYMA_BASE", "https://api.kymaapi.com/v1")
KEY = os.environ.get("KYMA_API_KEY", "")

def _h(api_key=None):
    return {"Authorization": f"Bearer {api_key or KEY}", "Content-Type": "application/json"}

def chat(model, messages, temperature=0.3, max_retries=4, read_timeout=150, on_retry=None, api_key=None, **extra):
    last = None
    body = {"model": model, "messages": messages, "temperature": temperature}
    body.update({k: v for k, v in extra.items() if v is not None})
    for i in range(max_retries):
        try:
            r = S.post(f"{BASE}/chat/completions", headers=_h(api_key), timeout=(15, read_timeout), json=body)
            if r.status_code >= 400:
                fatal = _fatal(r.status_code, r.text)
                if fatal:
                    raise fatal
                last = RuntimeError(f"{r.status_code}: {r.text[:300]}")
                # provider chap chon -> bo reasoning_effort thu lai
                if r.status_code == 503 and "reasoning_effort" in body:
                    body.pop("reasoning_effort", None)
                if on_retry: on_retry(i + 1, f"HTTP {r.status_code}")
                time.sleep(3 * (i + 1)); continue
            d = r.json()
            if "choices" not in d:
                last = RuntimeError(str(d)[:300])
                if on_retry: on_retry(i + 1, "phan hoi rong")
                time.sleep(3 * (i + 1)); continue
            return d["choices"][0]["message"]["content"]
        except KymaError:
            raise
        except Exception as e:
            last = e
            if on_retry: on_retry(i + 1, type(e).__name__)
            time.sleep(3 * (i + 1))
    raise last

IMG_DONE = ("succeeded",)
IMG_FAIL = ("failed", "refunded", "expired", "cancelled", "error")


def _err_msg(err):
    if isinstance(err, dict):
        return err.get("message") or err.get("code") or str(err)
    return str(err or "không rõ lý do")


def image(prompt, model="gpt-image-2", size="1536x1024", quality=None, timeout=900,
          queue_timeout=1800, retries=4, api_key=None):
    """Tao anh qua Kyma (async: POST -> job id -> poll /jobs/{id}).
    - idempotency_key: retry POST khong bi tao trung job / tru tien 2 lan
    - job dang 'queued' (het slot) khong tinh vao timeout chay
    - refunded / expired cung la ket thuc that bai (truoc day bi treo toi timeout)"""
    import uuid
    prompt = (prompt or "")[:4000]
    body = {"model": model, "prompt": prompt, "size": size,
            "idempotency_key": uuid.uuid4().hex}
    if quality:
        body["quality"] = quality
    job = None
    last = None
    for i in range(retries):
        try:
            r = S.post(f"{BASE}/images/generations", headers=_h(api_key), timeout=(15, 120), json=body)
            if r.status_code >= 400:
                fatal = _fatal(r.status_code, r.text)
                if r.status_code == 404:
                    try:
                        fatal = KymaError(f"Model ảnh '{model}' không có trên Kyma: "
                                          + _err_msg(r.json().get("error")))
                    except Exception:
                        pass
                if fatal:
                    raise fatal
                if r.status_code == 400:
                    # sai tham so -> thu lai cung vo ich
                    try:
                        raise KymaError("Kyma từ chối yêu cầu ảnh: " + _err_msg(r.json().get("error")))
                    except ValueError:
                        raise KymaError(f"Kyma từ chối yêu cầu ảnh: {r.text[:200]}")
                last = RuntimeError(f"{r.status_code}: {r.text[:300]}")
                wait = int(r.headers.get("Retry-After") or 0) or 5 * (i + 1)
                time.sleep(min(wait, 60)); continue
            job = r.json(); break
        except KymaError:
            raise
        except Exception as e:
            last = e; time.sleep(3 * (i + 1))
    if job is None:
        raise last or RuntimeError("không gửi được yêu cầu ảnh")
    # Mot so provider tra ve dong bo theo format OpenAI
    if job.get("data"):
        d = job["data"][0]
        if d.get("url"):
            return _fetch(d["url"])
        if d.get("b64_json"):
            import base64; return base64.b64decode(d["b64_json"])
    jid = job.get("id")
    if not jid:
        raise RuntimeError(f"Kyma không trả job id: {str(job)[:200]}")
    t0 = time.time()
    run_start = None if job.get("status") == "queued" else t0
    s = job
    while True:
        st = s.get("status")
        if st in IMG_DONE:
            url = (s.get("output") or {}).get("url")
            if not url:
                raise RuntimeError("job ảnh xong nhưng không có url")
            return _fetch(url)
        if st in IMG_FAIL:
            raise RuntimeError(f"Ảnh lỗi ({st}): {_err_msg(s.get('error'))}")
        now = time.time()
        if st != "queued" and run_start is None:
            run_start = now
        if run_start is None and now - t0 > queue_timeout:
            raise RuntimeError("Ảnh chờ hàng đợi Kyma quá lâu (hết slot), bấm Vẽ lại sau")
        if run_start is not None and now - run_start > timeout:
            raise RuntimeError("Ảnh chạy quá lâu (timeout)")
        time.sleep(3)
        try:
            r = S.get(f"{BASE}/jobs/{jid}", headers=_h(api_key), timeout=60)
            if r.status_code == 200:
                s = r.json()
        except Exception:
            pass


_MODELS = {"t": 0, "data": []}


def list_models(ttl=600):
    """Danh sach model cong khai cua Kyma (khong can key), cache 10 phut."""
    if _MODELS["data"] and time.time() - _MODELS["t"] < ttl:
        return _MODELS["data"]
    try:
        r = S.get(f"{BASE}/models", timeout=(10, 30))
        r.raise_for_status()
        data = r.json().get("data") or []
        if data:
            _MODELS.update(t=time.time(), data=data)
    except Exception:
        pass
    return _MODELS["data"]


def probe(api_key=None):
    """Goi 1 request cuc nho de biet key con dung duoc khong. Tra ve (ok, thong_diep)."""
    try:
        r = S.post(f"{BASE}/chat/completions", headers=_h(api_key), timeout=(10, 60),
                   json={"model": os.environ.get("SCRIPT_MODEL") or "gemini-3.5-flash-lite",
                         "messages": [{"role": "user", "content": "ok"}], "max_tokens": 1})
        if r.status_code >= 400:
            fatal = _fatal(r.status_code, r.text)
            return False, (str(fatal) if fatal else f"Kyma trả lỗi {r.status_code}")
        return True, ""
    except Exception as e:
        return True, ""  # loi mang tam thoi thi cu cho chay, retry se lo
