(function () {
  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? String(meta.getAttribute('content') || '') : '';
  }

  function injectCsrfIntoForms() {
    const token = getCsrfToken();
    if (!token) return;

    const forms = document.querySelectorAll('form');
    forms.forEach((form) => {
      if (form.hasAttribute('data-no-csrf')) return;

      let input = form.querySelector('input[name="_csrf"]');
      if (!input) {
        input = document.createElement('input');
        input.type = 'hidden';
        input.name = '_csrf';
        form.appendChild(input);
      }
      input.value = token;
    });
  }

  function patchFetchWithCsrf() {
    if (typeof window.fetch !== 'function') return;
    const token = getCsrfToken();
    if (!token) return;

    const originalFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      const options = init ? { ...init } : {};
      const method = String(options.method || 'GET').toUpperCase();
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const headers = new Headers(options.headers || {});
        if (!headers.has('X-CSRF-Token')) {
          headers.set('X-CSRF-Token', token);
        }
        options.headers = headers;
      }
      return originalFetch(input, options);
    };
  }

  function patchXhrWithCsrf() {
    if (typeof window.XMLHttpRequest !== 'function') return;
    const token = getCsrfToken();
    if (!token) return;

    const originalOpen = window.XMLHttpRequest.prototype.open;
    const originalSend = window.XMLHttpRequest.prototype.send;

    window.XMLHttpRequest.prototype.open = function (method) {
      this.__csrf_method = String(method || 'GET').toUpperCase();
      return originalOpen.apply(this, arguments);
    };

    window.XMLHttpRequest.prototype.send = function () {
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(this.__csrf_method || 'GET'))) {
        try {
          this.setRequestHeader('X-CSRF-Token', token);
        } catch (err) {
          // ignore when headers cannot be set
        }
      }
      return originalSend.apply(this, arguments);
    };
  }

  function init() {
    injectCsrfIntoForms();
    patchFetchWithCsrf();
    patchXhrWithCsrf();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
