(function () {
  if (!window.fetch || !window.FormData) return;

  function toast(message, isError) {
    if (window.Notify) window.Notify.show(message, isError);
  }

  function parse(html) {
    var template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  function bodyOf(list) {
    return list.tagName === 'TABLE' ? list.tBodies[0] : list;
  }

  function refresh(list) {
    if (list && window.Lists) window.Lists.refresh(list.id);
  }

  function setBusy(form, busy) {
    form._busy = busy;
    form.querySelectorAll('button[type="submit"], button:not([type])').forEach(function (button) {
      if (busy) {
        button._label = button.innerHTML;
        if (button.hasAttribute('data-busy')) button.textContent = button.getAttribute('data-busy');
        button.disabled = true;
      } else if (button._label !== undefined) {
        button.innerHTML = button._label;
        button.disabled = false;
      }
    });
    var item = form.closest('[data-item]');
    if (item) item.setAttribute('aria-busy', busy ? 'true' : 'false');
    return item;
  }

  function removeItem(item, list) {
    var next = item.nextElementSibling || item.previousElementSibling;
    var hadFocus = item.contains(document.activeElement);
    item.classList.add('is-removing');
    setTimeout(function () {
      item.remove();
      refresh(list);
      if (hadFocus && next && next.matches('[data-item]')) {
        var target = next.querySelector('button, summary, a');
        if (target) target.focus();
      }
    }, 180);
  }

  function apply(form, data) {
    var item = form.closest('[data-item]');
    var list = (item || form).closest('[data-list]');

    if (data.toast) toast(data.toast, !data.ok);

    if (data.add) {
      var targetId = data.add_to || form.getAttribute('data-add-to');
      var target = targetId ? document.getElementById(targetId) : null;
      var added = parse(data.add);
      if (target && added) {
        bodyOf(target).appendChild(added);
        refresh(target);
      }
      if (form.hasAttribute('data-add-to')) {
        form.reset();
        var first = form.querySelector('input');
        if (first) first.focus();
      }
    }

    if (data.replace && item) {
      var fresh = parse(data.replace);
      if (fresh) {
        fresh._order = item._order;
        item.replaceWith(fresh);
        refresh(list);
        var button = fresh.querySelector('summary, button');
        if (button) button.focus();
      }
    }

    if (data.replace_form && data.ok) {
      var swap = parse(data.replace_form);
      if (swap) form.replaceWith(swap);
    }

    if (data.remove && item) removeItem(item, list);
  }

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (e.defaultPrevented || !form.matches || !form.matches('form[data-async]')) return;
    e.preventDefault();
    if (form._busy) return;

    var item = setBusy(form, true);
    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      headers: { 'X-Requested-With': 'fetch', 'Accept': 'application/json' },
      credentials: 'same-origin'
    }).then(function (res) {
      var type = res.headers.get('Content-Type') || '';
      if (type.indexOf('application/json') !== -1) return res.json();
      if (res.redirected) {
        window.location.href = res.url;
        return null;
      }
      throw new Error('Unexpected response ' + res.status);
    }).then(function (data) {
      if (data) {
        apply(form, data);
        document.dispatchEvent(new CustomEvent('app:saved'));
      }
    }).catch(function () {
      toast({ title: 'Couldn’t save', body: 'Check your connection, then refresh the page and try again.' }, true);
    }).then(function () {
      form.removeAttribute('data-confirmed');
      if (form.isConnected) setBusy(form, false);
      else if (item) item.setAttribute('aria-busy', 'false');
    });
  });
})();
