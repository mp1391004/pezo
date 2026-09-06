import re, unicodedata

# "## 1. Tieu de"  hoac "## Tieu de" (nguoi dung tu them, khong danh so)
SEC_RE = re.compile(r"^##\s+(?:(\d+)\s*[.)]\s*)?(.*)$")

# **[MINH HOA — NEN CO]** `ten-file.png`   -> anh do AI ve
ILL_RE = re.compile(
    r"^\**\[MINH\s*HO[ẠA]\s*[—\-–]\s*N[ÊE]N\s*C[ÓO]\]\**\s*(?:`([^`]+)`)?\s*$", re.I)
# **[ANH TU CHEN]** `ten-file.png`         -> anh nguoi dung tu upload
UP_RE = re.compile(
    r"^\**\[[ẢA]NH\s*T[ỰU]\s*CH[ÈE]N\]\**\s*(?:`([^`]+)`)?\s*$", re.I)


def any_block(line):
    """Tra ve (kind, filename) neu dong nay mo dau mot khoi anh."""
    m = ILL_RE.match(line)
    if m:
        return "ai", (m.group(1) or "").strip()
    m = UP_RE.match(line)
    if m:
        return "upload", (m.group(1) or "").strip()
    return None, None


def slugify(text: str, fallback: str = "minh-hoa") -> str:
    t = (text or "").strip()
    t = t.replace("Đ", "D").replace("đ", "d")
    t = unicodedata.normalize("NFD", t)
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    t = re.sub(r"[^A-Za-z0-9]+", "-", t).strip("-").lower()
    t = re.sub(r"-{2,}", "-", t)
    return (t[:70].rstrip("-") or fallback)


def safe_name(name: str, fallback="anh") -> str:
    """Chuan hoa ten file do nguoi dung dat, luon ket thuc bang duoi anh."""
    name = (name or "").strip().replace("/", "-").replace("\\", "-")
    stem, _, ext = name.rpartition(".")
    if not stem:
        stem, ext = name, ""
    ext = (ext or "png").lower()
    if ext not in ("png", "jpg", "jpeg", "webp", "gif"):
        ext = "png"
    return f"{slugify(stem, fallback)}.{ext}"


def parse_sections(md: str):
    """Tra ve list muc: {num, title, blocks:[{kind, filename, desc}]}"""
    lines = (md or "").splitlines()
    secs, cur = [], None
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        m = SEC_RE.match(line)
        if m:
            cur = {"num": len(secs) + 1, "shown": m.group(1),
                   "title": m.group(2).strip(), "blocks": []}
            secs.append(cur)
            i += 1
            continue
        kind, fname = any_block(line)
        if kind:
            desc, j = [], i + 1
            while j < len(lines):
                t = lines[j].strip()
                if not t:
                    if desc:
                        break
                    j += 1
                    continue
                if t.startswith("#") or t == "---" or any_block(t)[0]:
                    break
                desc.append(re.sub(r"^[>*_\s]+|[*_\s]+$", "", t))
                j += 1
            if cur is None:
                cur = {"num": 1, "shown": None, "title": "", "blocks": []}
                secs.append(cur)
            cur["blocks"].append({"kind": kind, "filename": fname,
                                  "desc": " ".join(x for x in desc if x).strip()})
            i = j
            continue
        i += 1
    return secs


def collect_illustrations(md: str):
    """Flatten -> [{section, section_title, desc, filename, source}].
    Ten file: uu tien ten ghi san trong markdown, khong co thi dat theo tieu de muc."""
    out, used = [], set()
    for s in parse_sections(md):
        auto = [b for b in s["blocks"] if not b["filename"]]
        for b in s["blocks"]:
            name = b["filename"]
            if not name:
                base = slugify(s["title"], f"muc-{s['num']}")
                suffix = "" if len(auto) == 1 else f"-{auto.index(b) + 1}"
                name = f"{base}{suffix}.png"
            name = safe_name(name)
            stem, _, ext = name.rpartition(".")
            k = 2
            while name in used:
                name = f"{stem}-{k}.{ext}"
                k += 1
            used.add(name)
            out.append({"section": s["num"], "section_title": s["title"],
                        "desc": b["desc"], "filename": name, "source": b["kind"]})
    return out


def strip_head(md: str) -> str:
    """Bo tieu de tong + doan disclaimer dau file, vao thang muc 1."""
    lines = (md or "").splitlines()
    for i, l in enumerate(lines):
        if l.strip().startswith("## "):
            return "\n".join(lines[i:]).strip()
    return (md or "").strip()


def annotate_filenames(md: str) -> str:
    """Ghi ten file vao tung khoi anh trong markdown de ten khong doi khi sua noi dung."""
    items = collect_illustrations(md)
    if not items:
        return md
    lines = (md or "").splitlines()
    k = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        kind, fname = any_block(stripped)
        if not kind:
            continue
        if k < len(items):
            name = items[k]["filename"]
            label = "**[ẢNH TỰ CHÈN]**" if kind == "upload" else "**[MINH HOẠ — NÊN CÓ]**"
            lines[i] = f"{label} `{name}`"
            k += 1
    return "\n".join(lines)
