/* jarrodmhicks.com: small, dependency-free helpers.
   Menu on phones, copy-email buttons, papers filtering, and the random 404. */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* phone menu */
  var mbtn = $('#mbtn'), menu = $('#menu');
  if (mbtn && menu) {
    mbtn.addEventListener('click', function (e) {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
      mbtn.setAttribute('aria-expanded', String(!menu.hidden));
    });
    document.addEventListener('click', function () { menu.hidden = true; mbtn.setAttribute('aria-expanded', 'false'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { menu.hidden = true; mbtn.setAttribute('aria-expanded', 'false'); } });
  }

  /* copy email */
  $$('[data-copy]').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = b.getAttribute('data-copy');
      var done = function () {
        b.textContent = 'copied';
        clearTimeout(b._t);
        b._t = setTimeout(function () { b.textContent = 'copy email'; }, 2200);
      };
      var fallback = function () {
        var code = $('.email code');
        if (code && window.getSelection) {
          var r = document.createRange(); r.selectNodeContents(code);
          var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        }
        b.textContent = 'press ctrl/cmd + c';
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    });
  });

  /* lately: page back through the stack */
  $$('#lately .row').forEach(function (row) {
    var cards = $$('.card', row), nav = $('.nav', row);
    if (!nav || cards.length < 2) return;
    var stk = $('.stk', row), pos = 0, label = $('.pos', nav), btns = $$('button', nav);
    nav.hidden = false;
    var paint = function () {
      cards.forEach(function (c, i) { c.hidden = i !== pos; });
      var left = cards.length - pos;
      stk.classList.toggle('one', left <= 1);
      stk.classList.toggle('two', left === 2);
      label.textContent = (pos ? 'past' : 'now') + ' \u00b7 ' + (pos + 1) + ' of ' + cards.length;
      btns[0].disabled = pos >= cards.length - 1;
      btns[1].disabled = pos <= 0;
    };
    nav.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || b.disabled) return;
      pos = Math.max(0, Math.min(cards.length - 1, pos + (+b.getAttribute('data-d'))));
      paint();
    });
    paint();
  });

  /* papers: search, topic chips, year dropdown */
  var list = $('#plist') || $('#tlist');
  if (list) {
    var papers = $$('.paper, .tk', list), groups = $$('.ygrp', list);
    var state = { q: '', topic: '', year: '' };
    var q = $('#q'), count = $('#cnt'), none = $('#none');
    var yb = $('#yb'), yl = $('#yl');

    var apply = function () {
      var shown = 0, needle = state.q.toLowerCase();
      papers.forEach(function (p) {
        var ok = (!state.topic || p.getAttribute('data-topics').split('|').indexOf(state.topic) > -1) &&
                 (!state.year || p.getAttribute('data-year') === state.year) &&
                 (!needle || p.getAttribute('data-text').indexOf(needle) > -1);
        p.hidden = !ok;
        if (ok) shown++;
      });
      count.textContent = shown + ' of ' + papers.length + ' ' + (count.getAttribute('data-unit') || 'papers');
      groups.forEach(function (g) { g.hidden = !$$('.tk:not([hidden])', g).length; });
      none.hidden = shown !== 0;
      $$('.chip').forEach(function (c) { c.setAttribute('aria-pressed', String((c.getAttribute('data-topic') || '') === state.topic)); });
      yb.firstElementChild.textContent = state.year || 'all';
      $$('button', yl).forEach(function (b) { b.setAttribute('aria-selected', String((b.getAttribute('data-year') || '') === state.year)); });
    };
    q.addEventListener('input', function () { state.q = q.value; apply(); });
    $$('.chip').forEach(function (c) { c.addEventListener('click', function () { state.topic = c.getAttribute('data-topic') || ''; apply(); }); });
    yb.addEventListener('click', function (e) { e.stopPropagation(); yl.hidden = !yl.hidden; yb.setAttribute('aria-expanded', String(!yl.hidden)); });
    $$('button', yl).forEach(function (b) { b.addEventListener('click', function () { state.year = b.getAttribute('data-year') || ''; yl.hidden = true; yb.setAttribute('aria-expanded', 'false'); apply(); }); });
    document.addEventListener('click', function () { yl.hidden = true; yb.setAttribute('aria-expanded', 'false'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !yl.hidden) { yl.hidden = true; yb.focus(); } });
    apply();
  }


  /* click the period after "make sense" to change its color */
  var dot = $('.dot');
  if (dot) {
    var dotColors = ['#2457E6', '#FFD43B', '#FF7EB6', '#4CD07D', '#B08CFF', '#FF9F1C', '#FF5A4A', '#121826'], di = 0;
    dot.addEventListener('click', function () {
      di = (di + 1) % dotColors.length;
      dot.style.color = dotColors[di];
      dot.classList.remove('pop'); void dot.offsetWidth; dot.classList.add('pop');
    });
  }

  /* Konami code: up up down down left right left right b a  ->  highlighter rain.
     It stops by itself after about 15 seconds. Click anywhere, press Esc, press "stop",
     or enter the code again to stop sooner. */
  var seq = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'], kpos = 0;
  var rain = null, spawner = null, ender = null;
  var stopRain = function () {
    clearInterval(spawner); clearTimeout(ender); spawner = ender = null;
    if (!rain) return;
    var r = rain; rain = null;
    var pill = $('.rain-stop'); if (pill) pill.remove();
    setTimeout(function () { r.remove(); }, 6000); /* let the last strokes finish falling */
  };
  var startRain = function () {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (rain) { stopRain(); return; }
    var colors = ['#FF5A4A', '#FF9F1C', '#FFD43B', '#4CD07D', '#4D9BFF', '#B08CFF', '#FF7EB6'];
    rain = document.createElement('div'); rain.className = 'rain'; rain.setAttribute('aria-hidden', 'true');
    document.body.appendChild(rain);
    var pill = document.createElement('button'); pill.type = 'button'; pill.className = 'rain-stop'; pill.textContent = 'stop the rain (esc)';
    pill.addEventListener('click', function (e) { e.stopPropagation(); stopRain(); });
    document.body.appendChild(pill);
    var drop = function () {
      var el = document.createElement('i'), w = 36 + Math.random() * 70;
      el.style.cssText = '--c:' + colors[Math.floor(Math.random() * colors.length)] + ';--w:' + w + 'px;--h:' + (11 + Math.random() * 7) + 'px;left:' + (Math.random() * 100) + 'vw;--t:' + (2.6 + Math.random() * 2.6) + 's;--r0:' + (Math.random() * 40 - 20) + 'deg;--r1:' + (Math.random() * 120 - 60) + 'deg';
      el.addEventListener('animationend', function () { el.remove(); });
      rain.appendChild(el);
    };
    for (var n = 0; n < 14; n++) drop();
    spawner = setInterval(drop, 110);
    ender = setTimeout(stopRain, 15000);
  };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { stopRain(); return; }
    var t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') { kpos = 0; return; }
    var k = String(e.key).toLowerCase();
    if (k === seq[kpos]) { kpos++; if (kpos === seq.length) { kpos = 0; startRain(); } }
    else kpos = (k === seq[0]) ? 1 : 0;
  });
  document.addEventListener('click', function () { if (rain) stopRain(); });

  /* random 404: blind spot, Stroop, Müller-Lyer */
  var nf = $('#nf');
  if (nf) {
    var concepts = [
      '<svg viewBox="0 0 420 120" role="img" aria-label="Blind spot test"><g fill="none" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"><path d="M50 50h26M63 37v26"/></g><circle cx="340" cy="50" r="12" fill="var(--pri)"/><text x="210" y="110" text-anchor="middle" font-family="var(--f-mono)" font-size="12" fill="var(--mute)">close your left eye · stare at the +</text></svg><h1>404: it fell in your blind spot.</h1><p>Cover your left eye, stare at the plus and slowly move closer. At about arm\'s length the dot disappears. So did this page.</p>',
      '<p style="font:700 64px/1 var(--f-body);margin:0"><span style="color:var(--sec)">F</span><span style="color:var(--pri)">O</span><span style="color:#2e9e5b">U</span><span style="color:var(--ter)">R</span></p><p style="font:500 12px var(--f-mono);color:var(--mute)">name the ink colors, not the letters</p><h1>404: page not found.</h1><p>Reading the word is automatic, which is why naming the color is hard. The page is as missing as it is hard to say.</p>',
      '<svg viewBox="0 0 420 130" role="img" aria-label="Müller-Lyer illusion"><g fill="none" stroke="var(--ink)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M100 40h220M100 40l16-14M100 40l16 14M320 40l-16-14M320 40l-16 14"/><path d="M100 95h220M100 95l-16-14M100 95l-16 14M320 95l16-14M320 95l16 14"/></g></svg><h1>404: both lines are the same length.</h1><p>So is the distance between you and the page you wanted, which is to say it isn\'t there. Measure it if you don\'t believe me.</p>'
    ];
    nf.innerHTML = concepts[Math.floor(Math.random() * concepts.length)] + '<p><a class="btn pri" href="/">Back home</a></p>';
  }
})();
