import os, time, requests
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

def image(prompt, model="gpt-image-2", size="1536x1024", timeout=600, retries=3, api_key=None):
    job = None
    last = None
    for i in range(retries):
        try:
            r = S.post(f"{BASE}/images/generations", headers=_h(api_key), timeout=(15, 300),
                              json={"model": model, "prompt": prompt, "size": size})
            if r.status_code >= 400:
                fatal = _fatal(r.status_code, r.text)
                if fatal:
                    raise fatal
                last = RuntimeError(f"{r.status_code}: {r.text[:300]}")
                time.sleep(3 * (i + 1)); continue
            job = r.json(); break
        except KymaError:
            raise
        except Exception as e:
            last = e; time.sleep(3 * (i + 1))
    if job is None:
        raise last
    # Some providers answer synchronously in OpenAI format
    if "data" in job and job.get("data"):
        d = job["data"][0]
        if d.get("url"):
            return _fetch(d["url"])
        if d.get("b64_json"):
            import base64; return base64.b64decode(d["b64_json"])
    jid = job.get("id")
    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(6)
        try:
            s = S.get(f"{BASE}/jobs/{jid}", headers=_h(api_key), timeout=60).json()
        except Exception:
            continue
        st = s.get("status")
        if st == "succeeded":
            url = (s.get("output") or {}).get("url")
            return _fetch(url)
        if st in ("failed", "cancelled", "error"):
            raise RuntimeError(f"image job {st}: {s.get('error')}")
    raise RuntimeError("image job timeout")


def probe(api_key=None):
    """Goi 1 request cuc nho de biet key con dung duoc khong. Tra ve (ok, thong_diep)."""
    try:
        r = S.post(f"{BASE}/chat/completions", headers=_h(api_key), timeout=(10, 60),
                   json={"model": os.environ.get("SCRIPT_MODEL", "gemini-3.5-flash-lite"),
                         "messages": [{"role": "user", "content": "ok"}], "max_tokens": 1})
        if r.status_code >= 400:
            fatal = _fatal(r.status_code, r.text)
            return False, (str(fatal) if fatal else f"Kyma trả lỗi {r.status_code}")
        return True, ""
    except Exception as e:
        return True, ""  # loi mang tam thoi thi cu cho chay, retry se lo
