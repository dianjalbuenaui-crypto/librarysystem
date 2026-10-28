(function () {
  var SHOW_FOR = 6000;

  var live = document.getElementById('toast-live');
  var toasts = Array.prototype.slice.call(document.querySelectorAll('[data-toast]'));

  toasts.forEach(function (toast) {
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
  });

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

  document.querySelectorAll('form[data-confirm]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
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
    });
  });

  if (dialog) {
    dialog.addEventListener('close', function () {
      var form = pendingForm;
      pendingForm = null;
      if (form && dialog.returnValue === 'confirm') {
        form.setAttribute('data-confirmed', '');
        form.submit();
      }
    });

    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) dialog.close('cancel');
    });
  }
})();