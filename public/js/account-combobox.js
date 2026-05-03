(function () {
  function norm(s) {
    return (s || '').toLowerCase().trim();
  }

  function closeRoot(root) {
    var input = root.querySelector('[data-account-combobox-input]');
    var list = root.querySelector('[data-account-combobox-list]');
    var select = root.querySelector('select');
    if (!list || list.classList.contains('hidden')) {
      return;
    }
    list.classList.add('hidden');
    list.innerHTML = '';
    if (input) {
      input.setAttribute('aria-expanded', 'false');
      var opt = select && select.options[select.selectedIndex];
      input.value = opt && opt.value ? opt.textContent.trim() : '';
    }
  }

  function mount(root) {
    var select = root.querySelector('select');
    var input = root.querySelector('[data-account-combobox-input]');
    var list = root.querySelector('[data-account-combobox-list]');
    if (!select || !input || !list) {
      return;
    }

    function getOptions() {
      var out = [];
      var i;
      for (i = 0; i < select.options.length; i++) {
        var opt = select.options[i];
        out.push({ value: opt.value, label: opt.textContent.trim() });
      }
      return out;
    }

    function syncInputFromSelect() {
      var opt = select.options[select.selectedIndex];
      if (opt && opt.value) {
        input.value = opt.textContent.trim();
      } else {
        input.value = '';
      }
    }

    function filtered(query) {
      var q = norm(query);
      var opts = getOptions();
      if (!q) {
        return opts;
      }
      return opts.filter(function (o) {
        return norm(o.label).indexOf(q) !== -1;
      });
    }

    function renderList(items) {
      list.innerHTML = '';
      items.forEach(function (o) {
        var li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.className =
          'cursor-pointer px-4 py-2.5 text-sm text-stone-800 hover:bg-emerald-50';
        li.textContent = o.label;
        li.dataset.value = o.value;
        list.appendChild(li);
      });
      list.classList.toggle('hidden', items.length === 0);
      input.setAttribute('aria-expanded', items.length > 0 ? 'true' : 'false');
    }

    function openList() {
      renderList(filtered(input.value));
    }

    var blurTimer;

    input.addEventListener('focus', function () {
      clearTimeout(blurTimer);
      openList();
    });

    input.addEventListener('input', function () {
      openList();
    });

    list.addEventListener('mousedown', function (e) {
      var li = e.target.closest('li[role="option"]');
      if (!li) {
        return;
      }
      e.preventDefault();
      select.value = li.dataset.value;
      syncInputFromSelect();
      list.classList.add('hidden');
      list.innerHTML = '';
      input.setAttribute('aria-expanded', 'false');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    input.addEventListener('blur', function () {
      blurTimer = setTimeout(function () {
        closeRoot(root);
      }, 130);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRoot(root);
        return;
      }
      if (e.key === 'Enter') {
        var first = list.querySelector('li[role="option"]');
        if (first && !list.classList.contains('hidden')) {
          e.preventDefault();
          select.value = first.dataset.value;
          syncInputFromSelect();
          list.classList.add('hidden');
          list.innerHTML = '';
          input.setAttribute('aria-expanded', 'false');
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });

    syncInputFromSelect();
  }

  document.querySelectorAll('[data-account-combobox]').forEach(mount);

  document.addEventListener('click', function (e) {
    document.querySelectorAll('[data-account-combobox]').forEach(function (root) {
      if (!root.contains(e.target)) {
        closeRoot(root);
      }
    });
  });
})();
