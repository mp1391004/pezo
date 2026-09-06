/* Markdown <-> DOM cho editor co dinh dang. */
const MD = (() => {
  const esc = s => (s || '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const AI_LABEL = 'MINH HOẠ — NÊN CÓ';
  const UP_LABEL = 'ẢNH TỰ CHÈN';
  const ILL = /^\**\[MINH\s*HO[ẠA]\s*[—\-–]\s*N[ÊE]N\s*C[ÓO]\]\**\s*(?:`([^`]+)`)?\s*$/i;
  const UP  = /^\**\[[ẢA]NH\s*T[ỰU]\s*CH[ÈE]N\]\**\s*(?:`([^`]+)`)?\s*$/i;

  function blockOf(line) {
    let m = line.match(ILL); if (m) return { kind: 'ai', file: (m[1] || '').trim() };
    m = line.match(UP);      if (m) return { kind: 'upload', file: (m[1] || '').trim() };
    return null;
  }

  function inlineHtml(t) {
    return esc(t)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function paintImage(card, it, job) {
    const box = card.querySelector('.illu-img');
    if (!box) return;
    const st = it ? it.status : 'missing';
    if (st === 'deleted') { card.remove(); return; }
    const stamp = st + '|' + (it && it.v || 0);
    if (card.dataset.stamp === stamp) return;
    card.dataset.stamp = stamp;
    if (st === 'done')
      box.innerHTML = `<img src="/api/job/${job.id}/image/${encodeURIComponent(it.filename)}?v=${it.v || 0}">`;
    else if (st === 'error')
      box.innerHTML = `<div class="ph" style="color:var(--dan)">Lỗi: ${esc(it.error)}</div>`;
    else if (st === 'missing')
      box.innerHTML = `<div class="ph">Chưa có ảnh — bấm “Lưu + cập nhật ảnh” để vẽ</div>`;
    else
      box.innerHTML = `<div class="ph"><span class="spin" style="border-top-color:var(--blue)"></span> đang vẽ ảnh…</div>`;
  }

  /* Mot khoi anh trong bai. kind: 'ai' = AI ve, 'upload' = anh tu chen. */
  function illuCard(kind, file, desc, it, job) {
    const d = document.createElement('div');
    d.className = 'illu'; d.contentEditable = 'false';
    d.dataset.file = file || ''; d.dataset.kind = kind;
    d.innerHTML = `<div class="illu-head">
        <span class="t">${kind === 'upload' ? UP_LABEL : AI_LABEL}</span>
        <input class="illu-name" value="${esc(file)}" placeholder="ten-file.png" spellcheck="false">
        <span style="flex:1"></span>
        ${kind === 'ai' ? '<button class="ghost sm" data-a="regen">Vẽ lại</button>' : ''}
        <button class="ghost sm" data-a="swap">Ảnh từ máy</button>
        <button class="danger sm" data-a="del">Xoá</button></div>
      <div class="illu-desc" contenteditable="true">${inlineHtml(desc)}</div>
      <div class="illu-img"></div>`;

    const nameInput = d.querySelector('.illu-name');
    nameInput.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); nameInput.blur(); } };
    nameInput.onchange = () => window.renameImage(d.dataset.file, nameInput.value, d);
    const btn = a => d.querySelector(`[data-a="${a}"]`);
    if (btn('regen')) btn('regen').onclick = () => window.regenImage(d.dataset.file);
    btn('swap').onclick = () => window.swapImage(d.dataset.file, d);
    btn('del').onclick = () => window.deleteImage(d.dataset.file, d);

    paintImage(d, it, job);
    if (!it) { d.dataset.stamp = ''; paintImage(d, null, job); }
    return d;
  }

  function toDom(md, job) {
    const frag = document.createDocumentFragment();
    const lines = (md || '').split('\n');
    const byFile = {};
    (job.illustrations || []).forEach(i => { if (i.status !== 'deleted') byFile[i.filename] = i; });
    let ul = null;
    const closeUl = () => { ul = null; };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) { closeUl(); continue; }
      const blk = blockOf(line);
      if (blk) {
        closeUl();
        const buf = []; let j = i + 1;
        while (j < lines.length) {
          const t = lines[j].trim();
          if (!t) { if (buf.length) break; j++; continue; }
          if (t.startsWith('#') || t === '---' || blockOf(t)) break;
          buf.push(t.replace(/^[>*_\s]+|[*_\s]+$/g, '')); j++;
        }
        const desc = buf.join(' ').trim();
        frag.appendChild(illuCard(blk.kind, blk.file, desc, byFile[blk.file], job));
        i = j - 1; continue;
      }
      if (line === '---') { closeUl(); frag.appendChild(document.createElement('hr')); continue; }
      let m;
      if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
        closeUl();
        const h = document.createElement('h' + m[1].length);
        h.innerHTML = inlineHtml(m[2]); frag.appendChild(h); continue;
      }
      if (line.startsWith('> ')) {
        closeUl();
        const b = document.createElement('blockquote');
        b.innerHTML = inlineHtml(line.slice(2)); frag.appendChild(b); continue;
      }
      if (/^[-*]\s+/.test(line)) {
        if (!ul) { ul = document.createElement('ul'); frag.appendChild(ul); }
        const li = document.createElement('li');
        li.innerHTML = inlineHtml(line.replace(/^[-*]\s+/, '')); ul.appendChild(li); continue;
      }
      closeUl();
      const p = document.createElement('p');
      p.innerHTML = inlineHtml(line); frag.appendChild(p);
    }
    return frag;
  }

  function inlineMd(el) {
    let out = '';
    el.childNodes.forEach(n => {
      if (n.nodeType === 3) { out += n.nodeValue.replace(/\s+/g, ' '); return; }
      const tag = n.tagName ? n.tagName.toLowerCase() : '';
      const inner = inlineMd(n);
      if (!inner.trim()) { if (tag === 'br') out += ' '; return; }
      if (tag === 'a' && n.getAttribute('href')) out += `[${inner.trim()}](${n.getAttribute('href')})`;
      else if (tag === 'strong' || tag === 'b') out += '**' + inner.trim() + '**';
      else if (tag === 'em' || tag === 'i') out += '*' + inner.trim() + '*';
      else if (tag === 'code') out += '`' + inner.trim() + '`';
      else out += inner;
    });
    return out;
  }

  function fromDom(root) {
    const out = [];
    const push = s => { out.push(s); out.push(''); };
    root.childNodes.forEach(n => {
      if (n.nodeType === 3) { const t = n.nodeValue.trim(); if (t) push(t); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toLowerCase();
      if (n.classList && n.classList.contains('illu')) {
        const file = (n.dataset.file || '').trim();
        const kind = n.dataset.kind === 'upload' ? 'upload' : 'ai';
        const d = inlineMd(n.querySelector('.illu-desc')).trim().replace(/^\*+|\*+$/g, '');
        const label = kind === 'upload' ? `**[${UP_LABEL}]**` : `**[${AI_LABEL}]**`;
        out.push(file ? `${label} \`${file}\`` : label);
        if (d) out.push('*' + d + '*');
        out.push('');
        return;
      }
      if (tag === 'hr') { push('---'); return; }
      if (tag === 'h1') { const t = inlineMd(n).trim(); if (t) push('# ' + t); return; }
      if (tag === 'h2') { const t = inlineMd(n).trim(); if (t) push('## ' + t); return; }
      if (tag === 'h3' || tag === 'h4') { const t = inlineMd(n).trim(); if (t) push('### ' + t); return; }
      if (tag === 'blockquote') { const t = inlineMd(n).trim(); if (t) push('> ' + t); return; }
      if (tag === 'ul' || tag === 'ol') {
        let k = 0;
        n.querySelectorAll(':scope > li').forEach(li => {
          const t = inlineMd(li).trim();
          if (t) { k++; out.push(tag === 'ol' ? k + '. ' + t : '- ' + t); }
        });
        if (k) out.push('');
        return;
      }
      const t = inlineMd(n).trim();
      if (t) push(t);
    });
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  return { toDom, fromDom, paintImage, illuCard };
})();
