// Landing behaviour: fade-up on scroll, and the drifting wall of diff cards behind the issue. Nothing here is needed to read the page.
(function () {
  document.documentElement.classList.add('js');
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function ready(fn) { if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  ready(function () {
    // the wall: columns of the small diffs tripwire actually files
    var diffs = [['customer_id', 'customer'], ['legacy_id', 'external_id'], ['DELETE /v1/charges', 3], ['webhook_secret?', 'webhook_secret'],
      ['GET /v2/messages', 1], ['amount_cents', 'amount'], ['Bearer {token}', 'ApiKey {token}'], ['POST /v1/refunds', 2],
      ['currency?', 'currency'], ['rate_limit_remaining', 'x-ratelimit-remaining'], ['GET /users/{id}', 4], ['card.brand', 'card.network']];
    function tile(d) {
      return typeof d[1] === 'number'
        ? '<div class="wtile">' + d[0] + '<br>&minus; gone, ' + d[1] + ' file' + (d[1] === 1 ? '' : 's') + '</div>'
        : '<div class="wtile">&minus; ' + d[0] + '<br>+ ' + d[1] + '</div>';
    }
    document.querySelectorAll('.wall').forEach(function (host) {
      var cols = Math.max(3, Math.min(8, Math.round(host.offsetWidth / 170)));
      for (var c = 0; c < cols; c++) {
        var items = '';
        for (var i = 0; i < 7; i++) items += tile(diffs[(c * 5 + i) % diffs.length]);
        var col = document.createElement('div');
        col.className = 'wall-col' + (c % 2 ? ' down' : '');
        col.style.setProperty('--dur', (60 + c * 9) + 's');
        col.innerHTML = items + items; // doubled so the loop is seamless
        host.appendChild(col);
      }
    });

    var items = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    if (still || !('IntersectionObserver' in window)) { items.forEach(function (e) { e.classList.add('in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (e) { io.observe(e); });
  });
})();
