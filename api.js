/* ============================================================
 * API ADAPTER
 * Menggantikan google.script.run agar kode frontend tidak berubah.
 * Setiap pemanggilan dikirim sebagai POST JSON ke Web App Apps Script.
 * Content-Type text/plain dipakai agar tidak memicu CORS preflight
 * (Apps Script tidak mendukung request OPTIONS).
 * ============================================================ */
(function () {
  function callApi(fn, args, onOk, onFail) {
    var url = (window.APP_CONFIG || {}).API_URL;
    if (!url || url.indexOf('GANTI_') === 0) {
      if (onFail) onFail(new Error('API_URL belum diatur di config.js'));
      return;
    }
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ fn: fn, args: args }),
      redirect: 'follow'
    })
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var json;
        try { json = JSON.parse(t); } catch (e) { throw new Error('Respons server tidak valid'); }
        if (onOk) onOk(json);
      })
      .catch(function (err) { if (onFail) onFail(err); });
  }

  function makeRunner(ok, fail) {
    return new Proxy({}, {
      get: function (_, name) {
        if (name === 'withSuccessHandler') return function (f) { return makeRunner(f, fail); };
        if (name === 'withFailureHandler') return function (f) { return makeRunner(ok, f); };
        if (name === 'then') return undefined;
        return function () {
          callApi(String(name), Array.prototype.slice.call(arguments), ok, fail);
        };
      }
    });
  }

  window.google = { script: { run: makeRunner(null, null) } };
})();
