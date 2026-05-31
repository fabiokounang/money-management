(function initSidebarLayout() {
  const STORAGE_KEY = 'mm-sidebar-collapsed';
  const root = document.documentElement;

  function readCollapsed() {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch (_err) {
      return false;
    }
  }

  function writeCollapsed(collapsed) {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch (_err) {
      /* ignore */
    }
  }

  function syncCollapseUi(collapsed) {
    root.classList.toggle('sidebar-collapsed', collapsed);
    const toggle = document.querySelector('[data-sidebar-collapse-toggle]');
    if (toggle) {
      toggle.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
      toggle.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      toggle.setAttribute('title', collapsed ? 'Buka menu' : 'Sembunyikan menu');
      toggle.classList.toggle('is-collapsed', collapsed);
    }
  }

  function toggleCollapsed() {
    const next = !root.classList.contains('sidebar-collapsed');
    syncCollapseUi(next);
    writeCollapsed(next);
  }

  syncCollapseUi(readCollapsed());

  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.querySelector('[data-sidebar-collapse-toggle]');
    if (!toggle) {
      return;
    }

    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      toggleCollapsed();
    });
  });
})();
