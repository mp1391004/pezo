/* Cai dat API key Kyma — luu tren trinh duyet cua tung nguoi dung. */
fetch('/api/site').then(r => r.json()).then(({ settings }) => {
  const href = settings && settings['img.favicon'];
  if (!href) return;
  document.querySelectorAll('link[rel~="icon"]').forEach(link => link.remove());
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.href = href;
  document.head.appendChild(icon);
}).catch(() => {});

const PEZO = (() => {
  const LS = 'pezo_kyma_key';
  const get = () => { try { return localStorage.getItem(LS) || ''; } catch (e) { return ''; } };
  const set = v => { try { localStorage.setItem(LS, v); } catch (e) {} };
  const clear = () => { try { localStorage.removeItem(LS); } catch (e) {} };
  /* API khac de viet noi dung (vd Claude mua ngoai): {base, key, model}, chi luu tren trinh duyet */
  const LT = 'pezo_text_api';
  const textApi = () => { try { const v = JSON.parse(localStorage.getItem(LT) || 'null'); return v && v.base && v.key && v.model ? v : null; } catch (e) { return null; } };
  const setTextApi = v => { try { v ? localStorage.setItem(LT, JSON.stringify(v)) : localStorage.removeItem(LT); } catch (e) {} };
  const esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* Them key vao moi request goi AI */
  function headers(extra) {
    const t = textApi();
    const h = { 'X-Kyma-Key': get() };
    if (t) Object.assign(h, { 'X-Text-Base': t.base, 'X-Text-Key': t.key, 'X-Text-Model': t.model, 'X-Text-Format': t.format || 'openai' });
    return Object.assign(h, extra || {});
  }
  async function post(url, body, isForm) {
    const opt = { method: 'POST', headers: headers(isForm ? {} : { 'Content-Type': 'application/json' }) };
    if (body !== undefined) opt.body = isForm ? body : JSON.stringify(body);
    return fetch(url, opt);
  }

  const mask = k => k.length < 14 ? k : k.slice(0, 9) + '…' + k.slice(-4);

  /* Ve khoi cai dat vao #settings */
  function mount(onReady) {
    const host = document.getElementById('settings');
    if (!host) return;

    const render = () => {
      const key = get();
      host.innerHTML = key ? `
        <div class="set-bar">
          <span class="ok-dot"></span>
          <b>Đã kết nối Kyma</b>
          <code>${mask(key)}</code>
          <span style="flex:1"></span>
          <button class="ghost sm" id="set-open">Cài đặt</button>
        </div>
        <div class="set-bar">
          <span class="ok-dot" style="${textApi() ? '' : 'background:#c5cbd6'}"></span>
          <b>API viết nội dung</b>
          <code>${textApi() ? esc(textApi().model) + ' · ' + esc(new URL(textApi().base).host) + (textApi().format === 'anthropic' ? ' · Anthropic' : '') : 'chưa cài — đang dùng Kyma'}</code>
          <span style="flex:1"></span>
          <button class="ghost sm" id="tapi-open">${textApi() ? 'Sửa' : 'Cài API khác'}</button>
        </div>
        <div class="set-box" id="tapi-box" style="display:none">
          <h2>API khác để viết nội dung</h2>
          <p class="muted">Dùng khi bạn mua API ở nơi khác (vd Claude). Điền địa chỉ API (thường kết thúc bằng <code>/v1</code>), key và đúng tên model bên đó. Pezo tự nhận định dạng OpenAI hoặc Anthropic (Claude). Ảnh vẫn tạo qua Kyma. Thông tin chỉ lưu trên trình duyệt này.</p>
          <div class="set-row"><input id="tapi-base" placeholder="https://api.ten-ben-ban.com/v1" spellcheck="false" autocomplete="off"></div>
          <div class="set-row"><input id="tapi-key" placeholder="Key (sk-...)" spellcheck="false" autocomplete="off"></div>
          <div class="set-row"><input id="tapi-model" placeholder="Tên model, vd claude-sonnet-4-5" spellcheck="false" autocomplete="off"><button id="tapi-save">Lưu</button><button class="ghost" id="tapi-del">Gỡ</button></div>
          <div id="tapi-msg" class="muted"></div>
        </div>` : `
        <div class="set-box">
          <h2>Cài đặt trước khi dùng</h2>
          <p class="muted">Pezo chạy bằng API của <a href="https://kymaapi.com?aff=deal" target="_blank" rel="noopener">Kyma</a> — một cổng dùng chung cho nhiều model AI. Key lưu ngay trên trình duyệt của bạn, không gửi đi đâu khác.</p>
          <ol class="steps">
            <li>Đăng ký tài khoản tại <a href="https://kymaapi.com?aff=deal" target="_blank" rel="noopener">Kyma</a> và nạp một ít credit.</li>
            <li>Vào <a href="https://kymaapi.com/keys" target="_blank" rel="noopener">kymaapi.com/keys</a> để tạo key mới.</li>
            <li>Copy key rồi dán vào ô dưới đây.</li>
          </ol>
          <div class="set-row">
            <input id="set-key" placeholder="kyma-..." spellcheck="false" autocomplete="off">
            <button id="set-save">Lưu key</button>
          </div>
          <div id="set-msg" class="muted"></div>
        </div>`;

      const topen = document.getElementById('tapi-open');
      if (topen) topen.onclick = () => {
        const box = document.getElementById('tapi-box'), cur = textApi() || {};
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
        document.getElementById('tapi-base').value = cur.base || '';
        document.getElementById('tapi-key').value = cur.key || '';
        document.getElementById('tapi-model').value = cur.model || '';
        const msg = document.getElementById('tapi-msg'), sv = document.getElementById('tapi-save');
        document.getElementById('tapi-del').onclick = () => { setTextApi(null); location.reload(); };
        sv.onclick = async () => {
          const v = { base: document.getElementById('tapi-base').value.trim().replace(/\/+$/, ''), key: document.getElementById('tapi-key').value.trim(), model: document.getElementById('tapi-model').value.trim() };
          if (!v.base || !v.key || !v.model) { msg.className = 'err-line'; msg.textContent = 'Điền đủ 3 ô.'; return; }
          sv.disabled = true; sv.innerHTML = '<span class="spin"></span> Đang thử'; msg.className = 'muted'; msg.textContent = 'Đang gọi thử API…';
          let r; try { r = await (await fetch('/api/check-text-api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v) })).json(); } catch (e) { r = { ok: false, message: 'Không gọi được server' }; }
          sv.disabled = false; sv.textContent = 'Lưu';
          if (!r.ok) { msg.className = 'err-line'; msg.textContent = r.message; return; }
          v.format = r.format || 'openai'; setTextApi(v); location.reload();
        };
      };
      const open = document.getElementById('set-open');
      if (open) open.onclick = () => { clear(); render(); };

      const save = document.getElementById('set-save');
      if (save) {
        const input = document.getElementById('set-key');
        const msg = document.getElementById('set-msg');
        const go = async () => {
          const v = input.value.trim();
          if (!v) { msg.textContent = 'Bạn chưa dán key.'; return; }
          save.disabled = true; save.innerHTML = '<span class="spin"></span> Đang kiểm tra';
          msg.className = 'muted'; msg.textContent = 'Đang thử key với Kyma…';
          let r;
          try { r = await (await fetch('/api/check-key', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: v }) })).json(); }
          catch (e) { r = { ok: false, message: 'Không gọi được server' }; }
          save.disabled = false; save.textContent = 'Lưu key';
          if (!r.ok) { msg.className = 'err-line'; msg.textContent = r.message; return; }
          set(v); render(); if (onReady) onReady();
        };
        save.onclick = go;
        input.onkeydown = e => { if (e.key === 'Enter') go(); };
        input.focus();
      }
      if (onReady) onReady();
    };
    render();
  }

  return { get, set, clear, headers, post, mount, textApi, hasKey: () => !!get() };
})();
