/* Cai dat API key Kyma — luu tren trinh duyet cua tung nguoi dung. */
const PEZO = (() => {
  const LS = 'pezo_kyma_key';
  const get = () => { try { return localStorage.getItem(LS) || ''; } catch (e) { return ''; } };
  const set = v => { try { localStorage.setItem(LS, v); } catch (e) {} };
  const clear = () => { try { localStorage.removeItem(LS); } catch (e) {} };

  /* Them key vao moi request goi AI */
  function headers(extra) {
    return Object.assign({ 'X-Kyma-Key': get() }, extra || {});
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

  return { get, set, clear, headers, post, mount, hasKey: () => !!get() };
})();
