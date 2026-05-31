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
    document.querySelectorAll('[data-sidebar-collapse-toggle]').forEach((btn) => {
      btn.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
      btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      btn.setAttribute('title', collapsed ? 'Expand menu' : 'Minimize menu');
    });
  }

  function toggleCollapsed() {
    const next = !root.classList.contains('sidebar-collapsed');
    syncCollapseUi(next);
    writeCollapsed(next);
  }

  syncCollapseUi(readCollapsed());

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-sidebar-collapse-toggle]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        toggleCollapsed();
      });
    });
  });
})();
