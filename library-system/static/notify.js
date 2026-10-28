(function () {
  var SHOW_FOR = 6000;

  var ICONS = {
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    alert: '<path d="M12 7.5v6"/><path d="M12 17h.01"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>'
  };

  function svg(name) {
    return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + '</svg>';
  }

  var live = document.getElementById('toast-live');
  var toasts = Array.prototype.slice.call(document.querySelectorAll('[data-toast]'));

  function setup(toast) {
    var sticky = toast.hasAttribute('data-sticky');
    var remaining = SHOW_FOR;
    var startedAt = 0;
    var timer = null;

    function dismiss() {
      clearTimeout(timer);
      toast.classList.add('is-leaving');
      setTimeout(function () { toast.remove(); }, 260);
    }
    function start() {
      if (sticky) return;
      startedAt = Date.now();
      timer = setTimeout(dismiss, remaining);
      toast.classList.remove('is-paused');
    }
    function pause() {
      if (sticky || !timer) return;
      clearTimeout(timer);
      timer = null;
      remaining -= Date.now() - startedAt;
      toast.classList.add('is-paused');
    }

    toast.querySelector('[data-toast-close]').addEventListener('click', dismiss);
    toast.addEventListener('mouseenter', pause);
    toast.addEventListener('mouseleave', start);
    toast.addEventListener('focusin', pause);
    toast.addEventListener('focusout', start);
    toast.addEventListener('keydown', function (e) { if (e.key === 'Escape') dismiss(); });
    toast.style.setProperty('--toast-time', SHOW_FOR + 'ms');
    start();
  }

  toasts.forEach(setup);

  function show(message, isError) {
    var stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    var toast = document.createElement('div');
    toast.className = 'toast ' + (isError ? 'toast-error' : 'toast-success');
    toast.setAttribute('data-toast', '');
    if (isError) toast.setAttribute('data-sticky', '');
    toast.innerHTML =
      '<span class="toast-icon" aria-hidden="true">' + svg(isError ? 'alert' : 'check') + '</span>' +
      '<div class="toast-text"><strong></strong><p></p></div>' +
      '<button type="button" class="toast-close" data-toast-close aria-label="Dismiss notification">' + svg('close') + '</button>' +
      (isError ? '' : '<span class="toast-progress" aria-hidden="true"></span>');
    toast.querySelector('strong').textContent = message.title || (isError ? 'Something went wrong' : 'Done');
    toast.querySelector('p').textContent = message.body || '';
    stack.appendChild(toast);
    setup(toast);
    if (live) live.textContent = (message.title || '') + '. ' + (message.body || '');
  }

  window.Notify = { show: show };

  if (live && toasts.length) {
    setTimeout(function () {
      live.textContent = toasts.map(function (t) {
        return t.querySelector('.toast-text').textContent.replace(/\s+/g, ' ').trim();
      }).join('. ');
    }, 300);
  }

  function buildDialog() {
    var d = document.createElement('dialog');
    d.className = 'modal';
    d.id = 'confirm-dialog';
    d.setAttribute('aria-labelledby', 'confirm-title');
    d.setAttribute('aria-describedby', 'confirm-body');
    d.innerHTML =
      '<form method="dialog" class="modal-box">' +
        '<span class="modal-icon" aria-hidden="true"><svg class="icon" viewBox="0 0 24 24"><path d="M4.5 7h15"/><path d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2"/><path d="M6.5 7l1 12a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-12"/><path d="M10 11v5.5M14 11v5.5"/></svg></span>' +
        '<h2 id="confirm-title">Are you sure?</h2>' +
        '<p id="confirm-body"></p>' +
        '<div class="modal-actions">' +
          '<button type="submit" value="cancel" class="btn btn-outline" autofocus>Cancel</button>' +
          '<button type="submit" value="confirm" class="btn" id="confirm-ok">Delete</button>' +
        '</div>' +
      '</form>';
    document.body.appendChild(d);
    return d;
  }

  var dialog = document.getElementById('confirm-dialog') || buildDialog();
  var pendingForm = null;

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form.matches || !form.matches('form[data-confirm]')) return;
    if (form.hasAttribute('data-confirmed')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    pendingForm = form;
    document.getElementById('confirm-title').textContent = form.getAttribute('data-confirm') || 'Are you sure?';
    document.getElementById('confirm-body').textContent = form.getAttribute('data-confirm-body') || '';
    document.getElementById('confirm-ok').textContent = form.getAttribute('data-confirm-ok') || 'Confirm';
    dialog.returnValue = '';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }, true);

  if (dialog) {
    dialog.addEventListener('close', function () {
      var form = pendingForm;
      pendingForm = null;
      if (form && dialog.returnValue === 'confirm') {
        form.setAttribute('data-confirmed', '');
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.submit();
      }
    });

    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) dialog.close('cancel');
    });
  }
})();