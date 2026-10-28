(function () {
  function normalize(text) {
    return (text || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function ids(value) {
    return (value || '').split(/\s+/).filter(Boolean);
  }

  var lists = {};

  document.querySelectorAll('[data-list]').forEach(function (el) {
    var body = el.tagName === 'TABLE' ? el.tBodies[0] : el;
    lists[el.id] = {
      el: el,
      body: body,
      items: [],
      query: '',
      filters: {},
      sort: null,
      one: el.getAttribute('data-noun-one') || 'item',
      many: el.getAttribute('data-noun-many') || 'items',
      empty: document.querySelector('[data-list-empty="' + el.id + '"]'),
      count: document.querySelector('[data-list-count="' + el.id + '"]'),
      select: document.querySelector('[data-sort-for="' + el.id + '"]'),
      heads: Array.prototype.slice.call(el.querySelectorAll('th[data-sort-key]')),
      placeholder: body.querySelector('[data-list-placeholder]'),
      totals: Array.prototype.slice.call(document.querySelectorAll('[data-list-total="' + el.id + '"]'))
    };
    collect(lists[el.id]);
  });

  function collect(list) {
    var next = 0;
    list.items.forEach(function (item) { next = Math.max(next, item._order + 1); });
    list.items = Array.prototype.slice.call(list.body.querySelectorAll('[data-item]'));
    list.items.forEach(function (item) {
      if (item._order === undefined) item._order = next++;
    });
    if (list.placeholder) list.placeholder.hidden = list.items.length > 0;
    list.totals.forEach(function (el) {
      el.textContent = list.items.length;
      el.hidden = list.items.length === 0;
    });
  }

  function compare(a, b, key, type, dir) {
    var x = a.getAttribute('data-' + key) || '';
    var y = b.getAttribute('data-' + key) || '';
    if (x === '' && y !== '') return 1;
    if (y === '' && x !== '') return -1;
    var result;
    if (type === 'number') result = parseFloat(x) - parseFloat(y);
    else if (type === 'date') result = x < y ? -1 : x > y ? 1 : 0;
    else result = x.localeCompare(y, undefined, { sensitivity: 'base', numeric: true });
    if (result === 0) return a._order - b._order;
    return dir === 'desc' ? -result : result;
  }

  function parseSort(value) {
    var parts = (value || '').split(':');
    return parts.length === 3 ? { key: parts[0], dir: parts[1], type: parts[2] } : null;
  }

  function apply(list) {
    var words = normalize(list.query).split(' ').filter(Boolean);
    var shown = 0;

    list.items.forEach(function (item) {
      var haystack = item.getAttribute('data-search') || '';
      var ok = words.every(function (w) { return haystack.indexOf(w) !== -1; });
      Object.keys(list.filters).forEach(function (key) {
        var want = list.filters[key];
        if (want && want !== 'all' && item.getAttribute('data-' + key) !== want) ok = false;
      });
      item.hidden = !ok;
      if (ok) shown++;
    });

    var sort = parseSort(list.sort);
    if (sort) {
      list.items.slice().sort(function (a, b) { return compare(a, b, sort.key, sort.type, sort.dir); })
        .forEach(function (item) { list.body.appendChild(item); });
    }
    list.heads.forEach(function (th) {
      var active = sort && th.getAttribute('data-sort-key') === sort.key;
      th.setAttribute('aria-sort', active ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none');
    });

    if (list.empty) list.empty.hidden = !(list.items.length && shown === 0);
    if (list.count) {
      var total = list.items.length;
      var noun = function (n) { return n === 1 ? list.one : list.many; };
      list.count.textContent = shown === total
        ? total + ' ' + noun(total)
        : 'Showing ' + shown + ' of ' + total + ' ' + noun(total);
    }
  }

  function syncUrl(name, value, fallback) {
    if (!name || !window.history.replaceState) return;
    var url = new URL(window.location.href);
    if (!value || value === fallback) url.searchParams.delete(name);
    else url.searchParams.set(name, value);
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }

  document.querySelectorAll('[data-search-for]').forEach(function (input) {
    var targets = ids(input.getAttribute('data-search-for')).map(function (id) { return lists[id]; }).filter(Boolean);
    function run() {
      targets.forEach(function (list) { list.query = input.value; apply(list); });
      syncUrl(input.name, input.value.trim(), '');
    }
    input.addEventListener('input', run);
    input.addEventListener('search', run);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && input.value) { input.value = ''; run(); }
    });
    targets.forEach(function (list) { list.query = input.value; });
  });

  document.querySelectorAll('[data-filter-for]').forEach(function (select) {
    var list = lists[select.getAttribute('data-filter-for')];
    var key = select.getAttribute('data-filter-key');
    if (!list || !key) return;
    function run() {
      list.filters[key] = select.value;
      apply(list);
      syncUrl(select.name, select.value, 'all');
    }
    select.addEventListener('change', run);
    list.filters[key] = select.value;
  });

  Object.keys(lists).forEach(function (id) {
    var list = lists[id];
    if (list.select) {
      list.sort = list.select.value;
      list.select.addEventListener('change', function () {
        list.sort = list.select.value;
        apply(list);
        syncUrl(list.select.name, list.sort, list.select.options[0].value);
      });
    }

    list.heads.forEach(function (th) {
      var key = th.getAttribute('data-sort-key');
      var type = th.getAttribute('data-sort-type') || 'text';
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'sort-btn';
      while (th.firstChild) button.appendChild(th.firstChild);
      var arrow = document.createElement('span');
      arrow.className = 'sort-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      button.appendChild(arrow);
      th.appendChild(button);
      button.addEventListener('click', function () {
        var current = parseSort(list.sort);
        var dir = current && current.key === key
          ? (current.dir === 'asc' ? 'desc' : 'asc')
          : (type === 'text' ? 'asc' : 'desc');
        list.sort = key + ':' + dir + ':' + type;
        if (list.select) {
          var match = Array.prototype.some.call(list.select.options, function (o) { return o.value === list.sort; });
          if (!match) {
            var labels = {
              text: { asc: 'A–Z', desc: 'Z–A' },
              date: { asc: 'oldest first', desc: 'newest first' },
              number: { asc: 'lowest first', desc: 'highest first' }
            };
            var option = document.createElement('option');
            option.value = list.sort;
            option.textContent = th.textContent.trim() + ': ' + labels[type][dir];
            list.select.appendChild(option);
          }
          list.select.value = list.sort;
          syncUrl(list.select.name, list.sort, list.select.options[0].value);
        }
        apply(list);
      });
    });

    apply(list);
  });

  window.Lists = {
    refresh: function (id) {
      var list = lists[id];
      if (!list) return;
      collect(list);
      apply(list);
    }
  };

  document.querySelectorAll('form[data-live-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) { e.preventDefault(); });
  });
})();