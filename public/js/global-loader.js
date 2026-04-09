(function () {
  const SHOW_DELAY_MS = 450;
  let pendingRequests = 0;
  let showTimer = null;
  let overlayEl = null;

  function ensureOverlay() {
    if (overlayEl) return overlayEl;

    const style = document.createElement('style');
    style.textContent = `
      .global-loader-overlay {
        position: fixed;
        inset: 0;
        z-index: 9999;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.55);
        backdrop-filter: blur(2px);
      }
      .global-loader-overlay.show {
        display: flex;
      }
      .global-loader-card {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        border: 1px solid #e7e5e4;
        background: #ffffff;
        color: #44403c;
        border-radius: 16px;
        padding: 10px 14px;
        box-shadow: 0 8px 20px rgba(28, 25, 23, 0.12);
        font-size: 13px;
        font-weight: 600;
      }
      .global-loader-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid #d6d3d1;
        border-top-color: #16a34a;
        border-radius: 999px;
        animation: global-loader-spin .8s linear infinite;
      }
      @keyframes global-loader-spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);

    overlayEl = document.createElement('div');
    overlayEl.className = 'global-loader-overlay';
    overlayEl.setAttribute('aria-live', 'polite');
    overlayEl.innerHTML = `
      <div class="global-loader-card">
        <span class="global-loader-spinner" aria-hidden="true"></span>
        <span>Loading...</span>
      </div>
    `;
    document.body.appendChild(overlayEl);
    return overlayEl;
  }

  function showOverlaySoon() {
    if (showTimer || pendingRequests <= 0) return;
    showTimer = setTimeout(function () {
      showTimer = null;
      if (pendingRequests > 0) {
        ensureOverlay().classList.add('show');
      }
    }, SHOW_DELAY_MS);
  }

  function hideOverlayNow() {
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    if (overlayEl) {
      overlayEl.classList.remove('show');
    }
  }

  function beginPending() {
    pendingRequests += 1;
    showOverlaySoon();
  }

  function endPending() {
    pendingRequests = Math.max(0, pendingRequests - 1);
    if (pendingRequests === 0) {
      hideOverlayNow();
    }
  }

  function patchFetch() {
    if (typeof window.fetch !== 'function') return;
    const originalFetch = window.fetch.bind(window);
    window.fetch = function () {
      beginPending();
      return originalFetch.apply(null, arguments).finally(endPending);
    };
  }

  function patchXhr() {
    if (typeof window.XMLHttpRequest !== 'function') return;
    const originalSend = window.XMLHttpRequest.prototype.send;
    window.XMLHttpRequest.prototype.send = function () {
      beginPending();
      this.addEventListener('loadend', endPending, { once: true });
      return originalSend.apply(this, arguments);
    };
  }

  function attachFormHandlers() {
    document.addEventListener('submit', function (event) {
      const form = event.target;
      if (!form || form.nodeName !== 'FORM') return;
      if (form.hasAttribute('data-no-loader')) return;
      beginPending();
    }, true);
  }

  function attachCleanup() {
    window.addEventListener('pageshow', function () {
      pendingRequests = 0;
      hideOverlayNow();
    });
  }

  function init() {
    attachFormHandlers();
    patchFetch();
    patchXhr();
    attachCleanup();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
