import io, os, re, json, uuid, shutil, zipfile, threading, traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request, Header
from fastapi.responses import FileResponse, StreamingResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import kyma, prompts, mdparse, docxout

ROOT = Path(__file__).parent.parent
WORK = ROOT / "runs"
WORK.mkdir(exist_ok=True)

DEFAULT_TEXT_MODEL = os.environ.get("TEXT_MODEL", "gemini-3.7-flash")
IMAGE_MODEL = os.environ.get("IMAGE_MODEL", "gpt-image-2")
SCRIPT_MODEL = os.environ.get("SCRIPT_MODEL", "gemini-3.5-flash-lite")

app = FastAPI(title="Pezo")

RUNS = {}
LOCK = threading.Lock()


def save_job(job):
    try:
        d = Path(job["dir"])
        d.mkdir(parents=True, exist_ok=True)
        with LOCK:
            data = {k: v for k, v in job.items() if k != "api_key"}
        (d / "job.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def load_runs():
    """Nap lai cac run tu dia sau khi server khoi dong lai."""
    for jf in sorted(WORK.glob("*/*/job.json")):
        try:
            j = json.loads(jf.read_text(encoding="utf-8"))
        except Exception:
            continue
        j["dir"] = str(jf.parent)
        try:
            if j.get("content_md"):
                j["content_md"] = mdparse.annotate_filenames(j["content_md"])
        except Exception:
            pass
        if j.get("status") in ("queued", "running"):
            j["status"] = "error"
            j["stage"] = "Bị gián đoạn (server khởi động lại) — bấm Chạy lại"
            j["interrupted"] = True
        for it in j.get("illustrations", []):
            if it.get("status") in ("pending", "running"):
                it["status"] = "error"; it["error"] = "bị gián đoạn"
        rid = j["id"].rsplit("-", 1)[0]
        r = RUNS.setdefault(rid, {"id": rid, "dir": str(jf.parent.parent), "jobs": []})
        r["jobs"].append(j)
    for r in RUNS.values():
        r["jobs"].sort(key=lambda x: x.get("index", 0))
POOL = ThreadPoolExecutor(max_workers=16)
IMG_POOL = ThreadPoolExecutor(max_workers=8)
CHUNK_CHARS = int(os.environ.get("CHUNK_CHARS", "6000"))


def split_chunks(text, target=CHUNK_CHARS):
    """Cat transcript thanh tung doan ~target ky tu, uu tien cat o cuoi cau."""
    text = text.strip()
    if len(text) <= target * 1.3:
        return [text]
    out, i = [], 0
    while i < len(text):
        end = min(i + target, len(text))
        if end < len(text):
            window = text[i:end]
            cut = max(window.rfind(". "), window.rfind("? "), window.rfind("! "),
                      window.rfind("\n"))
            if cut > target * 0.5:
                end = i + cut + 1
        out.append(text[i:end].strip())
        i = end
    return [c for c in out if c]


class RunReq(BaseModel):
    transcripts: list
    text_model: str = DEFAULT_TEXT_MODEL
    workers: int = 3
    make_images: bool = True


class SaveReq(BaseModel):
    content_md: str | None = None
    script: str | None = None


def job_key(job, header_key=None):
    return (header_key or "").strip() or job.get("api_key") or os.environ.get("KYMA_API_KEY", "")


def _set(job, **kw):
    with LOCK:
        job.update(kw)
    save_job(job)


def strip_fence(s: str) -> str:
    s = s.strip()
    s = re.sub(r"^```[a-zA-Z]*\s*", "", s)
    s = re.sub(r"\s*```$", "", s)
    return s.strip()


def gen_one_image(job, item, model, api_key=None):
    d = Path(job["dir"])
    try:
        _set_item(item, status="running")
        data = kyma.image(prompts.image_prompt(item["desc"], item["section_title"]), model=model,
                          api_key=api_key or job_key(job))
        p = d / item["filename"]
        p.write_bytes(data)
        _set_item(item, status="done", path=str(p), v=int(__import__("time").time()))
    except Exception as e:
        _set_item(item, status="error", error=str(e)[:300])
    save_job(job)


def _set_item(item, **kw):
    with LOCK:
        item.update(kw)


def run_job(job, text_model, make_images):
    import time as _t
    t0 = _t.time()
    _set(job, started=t0)
    try:
        chunks = split_chunks(job["transcript"])
        total = len(chunks)
        done_n = [0]
        _set(job, status="running", stage=f"Đang hiệu đính transcript (0/{total} đoạn)")

        retry_n = [0]

        def note_retry(attempt, why):
            with LOCK:
                retry_n[0] += 1
                job["stage"] = (f"Đang hiệu đính transcript ({done_n[0]}/{total} đoạn) "
                                f"· thử lại lần {retry_n[0]} ({why})")

        def fix_chunk(ci_text):
            ci, ctext = ci_text
            try:
                out = strip_fence(kyma.chat(
                    SCRIPT_MODEL,
                    [{"role": "system", "content": prompts.SCRIPT_SYSTEM},
                     {"role": "user", "content": ctext}],
                    temperature=0.2, reasoning_effort="low", on_retry=note_retry,
                    api_key=job_key(job)))
            except kyma.KymaError:
                raise
            except Exception as e:
                # doan nay hong -> giu nguyen ban tho, khong lam hong ca job
                with LOCK:
                    job["warnings"] = job.get("warnings", []) + [
                        f"Đoạn {ci + 1}/{total} không hiệu đính được ({str(e)[:80]}), giữ nguyên bản thô"]
                out = ctext
            with LOCK:
                done_n[0] += 1
                job["stage"] = f"Đang hiệu đính transcript ({done_n[0]}/{total} đoạn)"
            save_job(job)
            return ci, out

        cpool = ThreadPoolExecutor(max_workers=min(6, total))
        try:
            parts = list(cpool.map(fix_chunk, list(enumerate(chunks))))
        finally:
            cpool.shutdown(wait=False)
        parts.sort(key=lambda x: x[0])
        script = "\n\n".join(p for _, p in parts).strip()
        _set(job, script=script, stage="Đang viết file nội dung")

        content = strip_fence(kyma.chat(text_model, [
            {"role": "system", "content": prompts.CONTENT_SYSTEM},
            {"role": "user", "content": script},
        ], temperature=0.3, read_timeout=300, api_key=job_key(job),
            on_retry=lambda a, w: _set(job, stage=f"Đang viết file nội dung · thử lại lần {a} ({w})")))
        content = mdparse.strip_head(content)
        content = mdparse.annotate_filenames(content)
        items = [i for i in mdparse.collect_illustrations(content) if i["desc"]]
        for it in items:
            it["status"] = "pending"; it["path"] = None
        _set(job, content_md=content, illustrations=items,
             stage=f"Đang tạo {len(items)} ảnh minh hoạ" if (items and make_images) else "Xong")

        if make_images and items:
            futs = [IMG_POOL.submit(gen_one_image, job, it, IMAGE_MODEL) for it in items]
            for f in futs:
                f.result()
        _set(job, status="done", stage="Xong — mời rà soát nội dung", elapsed=int(_t.time() - t0))
    except Exception as e:
        traceback.print_exc()
        _set(job, status="error", stage="Lỗi", error=str(e)[:500], elapsed=int(_t.time() - t0))


@app.post("/api/run")
def api_run(req: RunReq, x_kyma_key: str = Header("")):
    key = (x_kyma_key or "").strip() or os.environ.get("KYMA_API_KEY", "")
    if not key:
        raise HTTPException(400, "Chưa có API key Kyma. Bấm Cài đặt để nhập key.")
    ok, msg = kyma.probe(key)
    if not ok:
        raise HTTPException(400, msg)
    run_id = uuid.uuid4().hex[:8]
    rdir = WORK / run_id
    rdir.mkdir(parents=True, exist_ok=True)
    jobs = []
    for idx, t in enumerate(req.transcripts, start=1):
        name = (t.get("name") or "").strip() or str(idx)
        jd = rdir / re.sub(r"[^\w\-. ]", "_", name)
        jd.mkdir(parents=True, exist_ok=True)
        jobs.append({
            "id": f"{run_id}-{idx}", "index": idx, "name": name, "dir": str(jd),
            "transcript": t.get("text", ""), "status": "queued", "stage": "Đang chờ",
            "script": "", "content_md": "", "illustrations": [], "error": None,
            "started": None, "elapsed": 0, "warnings": [], "interrupted": False,
            "text_model": req.text_model, "api_key": key,
        })
    RUNS[run_id] = {"id": run_id, "dir": str(rdir), "jobs": jobs}

    pool = ThreadPoolExecutor(max_workers=max(1, min(req.workers, 8)))
    for j in jobs:
        pool.submit(run_job, j, req.text_model, req.make_images)
    pool.shutdown(wait=False)
    return {"run_id": run_id, "jobs": [j["id"] for j in jobs]}


def public(j):
    return {k: v for k, v in j.items() if k not in ("transcript", "dir", "api_key")}


@app.get("/api/status/{run_id}")
def api_status(run_id: str):
    r = RUNS.get(run_id)
    if not r:
        raise HTTPException(404, "run không tồn tại")
    with LOCK:
        return {"run_id": run_id, "jobs": [public(j) for j in r["jobs"]]}


def find_job(job_id):
    for r in RUNS.values():
        for j in r["jobs"]:
            if j["id"] == job_id:
                return r, j
    raise HTTPException(404, "job không tồn tại")


@app.post("/api/job/{job_id}/save")
def api_save(job_id: str, req: SaveReq):
    _, j = find_job(job_id)
    upd = {}
    if req.content_md is not None:
        upd["content_md"] = mdparse.annotate_filenames(req.content_md)
    if req.script is not None:
        upd["script"] = req.script
    _set(j, **upd)
    return {"ok": True}


@app.post("/api/job/{job_id}/resync-images")
def api_resync(job_id: str, x_kyma_key: str = Header("")):
    """Doc lai markdown hien tai -> tao/tao lai anh cho cac muc minh hoa."""
    _, j = find_job(job_id)
    items = mdparse.collect_illustrations(j["content_md"])
    old = {i["filename"]: i for i in j["illustrations"]}
    jd = Path(j["dir"])
    todo = []
    for it in items:
        prev = old.get(it["filename"])
        on_disk = (jd / it["filename"]).exists()
        if it.get("source") == "upload":
            # anh nguoi dung tu chen: giu nguyen, khong goi AI
            it.update(status="done" if on_disk else "error",
                      path=str(jd / it["filename"]) if on_disk else None,
                      error=None if on_disk else "khong tim thay file anh",
                      v=prev.get("v", 0) if prev else 0)
            continue
        keep = (prev and prev.get("desc") == it["desc"]
                and prev.get("status") in ("done", "deleted") and (on_disk or prev.get("status") == "deleted"))
        if keep:
            it.update(status=prev["status"], path=prev.get("path"), v=prev.get("v", 0))
        elif it["desc"]:
            it.update(status="pending", path=None); todo.append(it)
        else:
            it.update(status="pending", path=None)
    _set(j, illustrations=items, status="running", stage=f"Đang tạo {len(todo)} ảnh")

    key = job_key(j, x_kyma_key)

    def work():
        futs = [IMG_POOL.submit(gen_one_image, j, it, IMAGE_MODEL, key) for it in todo]
        for f in futs: f.result()
        _set(j, status="done", stage="Xong")
    POOL.submit(work)
    return {"ok": True, "queued": len(todo)}


@app.post("/api/job/{job_id}/image/{filename}/regen")
def api_regen(job_id: str, filename: str, x_kyma_key: str = Header("")):
    _, j = find_job(job_id)
    it = next((i for i in j["illustrations"] if i["filename"] == filename), None)
    if not it:
        raise HTTPException(404, "không có ảnh này")
    # lay mo ta moi nhat dang co trong noi dung
    for cur in mdparse.collect_illustrations(j["content_md"]):
        if cur["filename"] == filename:
            _set_item(it, desc=cur["desc"], section_title=cur["section_title"])
            break
    _set(j, status="running", stage=f"Đang vẽ lại {filename}")

    key = job_key(j, x_kyma_key)

    def work():
        gen_one_image(j, it, IMAGE_MODEL, key)
        _set(j, status="done", stage="Xong")
    POOL.submit(work)
    return {"ok": True}


@app.post("/api/job/{job_id}/upload-image")
async def api_upload_image(job_id: str, file: UploadFile = File(...),
                           name: str = Form(""), section: int = Form(0),
                           desc: str = Form("")):
    """Chen anh tu may vao bai. Tra ve ten file da chuan hoa."""
    _, j = find_job(job_id)
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "file rỗng")
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(400, "ảnh quá lớn (tối đa 20MB)")
    src = name.strip() or file.filename or "anh-chen-them.png"
    if "." not in src and file.filename and "." in file.filename:
        src = src + "." + file.filename.rsplit(".", 1)[1]
    fname = mdparse.safe_name(src)
    jd = Path(j["dir"])
    jd.mkdir(parents=True, exist_ok=True)
    taken = {i["filename"] for i in j["illustrations"]}
    stem, _, ext = fname.rpartition(".")
    k = 2
    while fname in taken or (jd / fname).exists():
        fname = f"{stem}-{k}.{ext}"; k += 1
    (jd / fname).write_bytes(raw)
    item = {"section": section or 1, "section_title": "", "desc": desc,
            "filename": fname, "source": "upload", "status": "done",
            "path": str(jd / fname), "v": int(__import__("time").time())}
    with LOCK:
        j["illustrations"] = j["illustrations"] + [item]
    save_job(j)
    return {"ok": True, "filename": fname}


@app.post("/api/job/{job_id}/image/{filename}/replace")
async def api_replace_image(job_id: str, filename: str, file: UploadFile = File(...)):
    """Thay anh hien tai bang anh tu may, giu nguyen ten va vi tri."""
    _, j = find_job(job_id)
    it = next((i for i in j["illustrations"] if i["filename"] == filename), None)
    if not it:
        raise HTTPException(404, "không có ảnh này")
    raw = await file.read()
    if not raw:
        raise HTTPException(400, "file rỗng")
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(400, "ảnh quá lớn (tối đa 20MB)")
    p = Path(j["dir"]) / filename
    p.write_bytes(raw)
    _set_item(it, status="done", path=str(p), source="upload", error=None,
              v=int(__import__("time").time()))
    save_job(j)
    return {"ok": True, "filename": filename}


@app.post("/api/job/{job_id}/image/{filename}/rename")
def api_rename_image(job_id: str, filename: str, payload: dict):
    _, j = find_job(job_id)
    it = next((i for i in j["illustrations"] if i["filename"] == filename), None)
    if not it:
        raise HTTPException(404, "không có ảnh này")
    new = mdparse.safe_name(payload.get("name", ""), "anh")
    if new == filename:
        return {"ok": True, "filename": filename}
    jd = Path(j["dir"])
    stem, _, ext = new.rpartition(".")
    taken = {i["filename"] for i in j["illustrations"] if i is not it}
    k = 2
    while new in taken or (jd / new).exists():
        new = f"{stem}-{k}.{ext}"; k += 1
    try:
        old_p = jd / filename
        if old_p.exists():
            old_p.rename(jd / new)
    except Exception as e:
        raise HTTPException(400, f"không đổi tên được: {e}")
    _set_item(it, filename=new, path=str(jd / new), v=int(__import__("time").time()))
    # cap nhat luon ten trong noi dung de khong lech nhau
    if j.get("content_md"):
        _set(j, content_md=j["content_md"].replace(f"`{filename}`", f"`{new}`"))
    save_job(j)
    return {"ok": True, "filename": new}


@app.post("/api/job/{job_id}/image/{filename}/delete")
def api_delete_image(job_id: str, filename: str):
    _, j = find_job(job_id)
    it = next((i for i in j["illustrations"] if i["filename"] == filename), None)
    if not it:
        raise HTTPException(404, "khong co anh nay")
    try:
        p = Path(j["dir"]) / filename
        if p.exists():
            p.unlink()
    except Exception:
        pass
    _set_item(it, status="deleted", path=None)
    return {"ok": True}


@app.get("/api/job/{job_id}/image/{filename}")
def api_image(job_id: str, filename: str):
    _, j = find_job(job_id)
    p = Path(j["dir"]) / filename
    if not p.exists():
        raise HTTPException(404, "chưa có ảnh")
    return FileResponse(p, headers={"Cache-Control": "no-store, must-revalidate"})


def build_zip(run) -> io.BytesIO:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for j in run["jobs"]:
            folder = re.sub(r"[^\w\-. ]", "_", j["name"])
            imgs = [i for i in j["illustrations"] if i.get("status") == "done" and i.get("path")]
            doc = docxout.md_to_docx(j["content_md"], images=imgs)
            b = io.BytesIO(); doc.save(b)
            z.writestr(f"{folder}/noi-dung.docx", b.getvalue())

            sd = docxout.script_to_docx(j["script"])
            b2 = io.BytesIO(); sd.save(b2)
            z.writestr(f"{folder}/full-transcript.docx", b2.getvalue())

            for i in imgs:
                z.write(i["path"], f"{folder}/{i['filename']}")
    buf.seek(0)
    return buf


@app.get("/api/download/{run_id}")
def api_download(run_id: str):
    r = RUNS.get(run_id)
    if not r:
        raise HTTPException(404, "run không tồn tại")
    buf = build_zip(r)
    ts = __import__("time").strftime("%m%d-%H%M%S")
    return StreamingResponse(buf, media_type="application/zip", headers={
        "Content-Disposition": f'attachment; filename="transcript-studio-{run_id}-{ts}.zip"',
        "Cache-Control": "no-store, must-revalidate"})


@app.post("/api/job/{job_id}/retry")
def api_retry(job_id: str, x_kyma_key: str = Header("")):
    _, j = find_job(job_id)
    if not j.get("transcript"):
        raise HTTPException(400, "khong con transcript goc de chay lai")
    key = job_key(j, x_kyma_key)
    if not key:
        raise HTTPException(400, "Chưa có API key Kyma. Bấm Cài đặt để nhập key.")
    with LOCK:
        j["api_key"] = key
    _set(j, status="queued", stage="Đang chờ", error=None, interrupted=False,
         illustrations=[], content_md="", script="", elapsed=0, warnings=[])
    POOL.submit(run_job, j, j.get("text_model", DEFAULT_TEXT_MODEL), True)
    return {"ok": True}


@app.get("/api/job/{job_id}/download")
def api_download_job(job_id: str):
    r, j = find_job(job_id)
    buf = build_zip({"jobs": [j]})
    fname = re.sub(r"[^\w\-.]", "_", j["name"])
    ts = __import__("time").strftime("%m%d-%H%M%S")
    return StreamingResponse(buf, media_type="application/zip", headers={
        "Content-Disposition": f'attachment; filename="{fname}-{ts}.zip"',
        "Cache-Control": "no-store, must-revalidate"})


@app.get("/api/models")
def api_models():
    return {"text_model": DEFAULT_TEXT_MODEL, "image_model": IMAGE_MODEL,
            "server_key": bool(os.environ.get("KYMA_API_KEY"))}


@app.post("/api/check-key")
def api_check_key(payload: dict):
    key = (payload.get("key") or "").strip()
    if not key:
        return {"ok": False, "message": "Chưa nhập key"}
    ok, msg = kyma.probe(key)
    return {"ok": ok, "message": msg or "Key dùng được"}


load_runs()

class NoCacheStatic(StaticFiles):
    """Trinh duyet luon lay ban moi nhat cua HTML/JS/CSS, khong dung ban cache cu."""

    async def get_response(self, path, scope):
        resp = await super().get_response(path, scope)
        resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        resp.headers["Pragma"] = "no-cache"
        for h in ("etag", "last-modified"):
            if h in resp.headers:
                del resp.headers[h]
        return resp


app.mount("/", NoCacheStatic(directory=str(ROOT / "static"), html=True), name="static")
