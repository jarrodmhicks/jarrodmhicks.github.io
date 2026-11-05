/* jarrodmhicks.com: small, dependency-free helpers.
   Menu on phones, copy-email buttons, papers filtering, and the random 404. */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* page entrance: the head script adds .enter the first time you open a page in a visit; clear it once the animation is done */
  if (document.documentElement.classList.contains('enter')) {
    try { sessionStorage.setItem('entered:' + location.pathname, '1'); } catch (e) {}
    setTimeout(function () { document.documentElement.classList.remove('enter'); }, 1800);
  }

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

  /* the email address is stored encoded in the page and filled in here, so it is not in the HTML for scrapers */
  var em = $('#em');
  if (em && em.getAttribute('data-e')) { try { em.textContent = atob(em.getAttribute('data-e')); } catch (e) {} }

  /* copy buttons: email, BibTeX, citation */
  $$('[data-copy], [data-e]').forEach(function (b) {
    if (b.tagName !== 'BUTTON') return;
    var label = b.textContent;
    b.addEventListener('click', function () {
      var text = b.getAttribute('data-copy');
      if (!text && b.getAttribute('data-e')) { try { text = atob(b.getAttribute('data-e')); } catch (e) { text = ''; } }
      var done = function () {
        b.textContent = 'copied';
        clearTimeout(b._t);
        b._t = setTimeout(function () { b.textContent = label; }, 2200);
      };
      var fallback = function () {
        var src = $('#em') && b.getAttribute('data-e') ? $('#em') : (b.closest('.paper') && $('pre', b.closest('.paper')));
        if (src && window.getSelection) {
          var r = document.createRange(); r.selectNodeContents(src);
          var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        }
        b.textContent = 'press ctrl/cmd + c';
        clearTimeout(b._t);
        b._t = setTimeout(function () { b.textContent = label; }, 3500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    });
  });

  /* cite panels on papers */
  $$('.cite-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var panel = b.closest('.paper').querySelector('.cw');
      var open = panel.classList.toggle('open');
      b.setAttribute('aria-expanded', String(open));
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
    var moving = false;
    nav.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || b.disabled || moving) return;
      var next = Math.max(0, Math.min(cards.length - 1, pos + (+b.getAttribute('data-d')))), old = cards[pos];
      if (next === pos) return;
      if (reduce || !old.animate) { pos = next; paint(); return; }
      moving = true;
      var done = function () { moving = false; };
      if (next > pos) {
        /* paging back: the top card is flicked off the stack and the next one settles forward */
        old.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(120%,-8%) rotate(14deg)', opacity: 0 }], { duration: 300, easing: 'cubic-bezier(.5,0,.8,.4)' }).onfinish = function () {
          pos = next; paint();
          cards[pos].animate([{ transform: 'scale(.95) translateY(8px)' }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.3,1.4,.5,1)' }).onfinish = done;
        };
      } else {
        /* coming forward: the card slides back in from the side */
        pos = next; paint();
        cards[pos].animate([{ transform: 'translate(110%,-6%) rotate(12deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 340, easing: 'cubic-bezier(.3,1.3,.5,1)' }).onfinish = done;
      }
    });
    paint();
  });

  /* papers and presentations: search, chip rows (topic, format), year dropdown */
  var list = $('#plist') || $('#tlist');
  if (list) {
    var papers = $$('.paper', list), groups = $$('.ygrp', list);
    var state = { q: '', topic: '', type: '', year: '', sort: 'year' };
    var order = papers.slice();
    var q = $('#q'), count = $('#cnt'), none = $('#none');
    var yb = $('#yb'), yl = $('#yl');

    /* cards fold away and open up instead of snapping, and re-sorting glides cards to their new places */
    var firstRun = true, edge = ['borderTopWidth', 'borderBottomWidth'], pad = ['paddingTop', 'paddingBottom'];
    var cancelFold = function (p) { if (p._a) { p._a.cancel(); p._a = null; p.style.overflow = ''; } };
    var foldOut = function (p) {
      cancelFold(p);
      var cs = getComputedStyle(p), from = { height: p.offsetHeight + 'px', marginTop: cs.marginTop, opacity: 1 }, to = { height: '0px', marginTop: '0px', opacity: 0 };
      pad.concat(edge).forEach(function (k) { from[k] = cs[k]; to[k] = '0px'; });
      p.style.overflow = 'hidden';
      var a = p._a = p.animate([from, to], { duration: 240, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
      a.onfinish = function () { if (p._a !== a) return; p._a = null; p.hidden = true; p.style.overflow = ''; a.cancel(); };
    };
    var foldIn = function (p) {
      cancelFold(p); p.hidden = false;
      var cs = getComputedStyle(p), to = { height: p.offsetHeight + 'px', marginTop: cs.marginTop, opacity: 1 }, from = { height: '0px', marginTop: '0px', opacity: 0 };
      pad.concat(edge).forEach(function (k) { to[k] = cs[k]; from[k] = '0px'; });
      p.style.overflow = 'hidden';
      var a = p._a = p.animate([from, to], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' });
      a.onfinish = function () { if (p._a !== a) return; p._a = null; p.style.overflow = ''; };
    };
    papers.forEach(function (p) { p._vis = true; });

    var apply = function () {
      var shown = 0, terms = state.q.toLowerCase().split(/\s+/).filter(Boolean), fancy = !firstRun && !reduce && !!document.body.animate;
      papers.forEach(function (p) {
        var ok = (!state.topic || (p.getAttribute('data-topics') || '').split('|').indexOf(state.topic) > -1) &&
                 (!state.type || p.getAttribute('data-type') === state.type) &&
                 (!state.year || (state.year === 'upcoming' ? p.getAttribute('data-upcoming') === '1' : p.getAttribute('data-year') === state.year)) &&
                 terms.every(function (t) { return p.getAttribute('data-text').indexOf(t) > -1; });
        if (ok) shown++;
        if (ok === p._vis) return;
        p._vis = ok;
        if (!fancy) { cancelFold(p); p.hidden = !ok; } else if (ok) foldIn(p); else foldOut(p);
      });
      if (list.id === 'plist') {
        var sorted = state.sort === 'cites' ? papers.slice().sort(function (a, b) { return (+b.getAttribute('data-cites')) - (+a.getAttribute('data-cites')); }) : order;
        var movers = fancy ? papers.filter(function (p) { return p._vis && !p._a; }) : [], tops = movers.map(function (p) { return p.getBoundingClientRect().top; });
        sorted.forEach(function (p) { list.appendChild(p); });
        movers.forEach(function (p, i) {
          var d = tops[i] - p.getBoundingClientRect().top;
          if (Math.abs(d) > 2) p.animate([{ transform: 'translateY(' + d + 'px)' }, { transform: 'none' }], { duration: 480, easing: 'cubic-bezier(.3,1.15,.4,1)' });
        });
      }
      count.textContent = shown + ' of ' + papers.length + ' ' + (count.getAttribute('data-unit') || 'papers');
      groups.forEach(function (g) {
        var any = $$('.paper', g).some(function (p) { return p._vis; });
        clearTimeout(g._t);
        if (any || !fancy) g.hidden = !any; else g._t = setTimeout(function () { g.hidden = true; }, 250);
      });
      none.hidden = shown !== 0;
      var sbox = q.parentNode; if (sbox && sbox.classList) sbox.classList.toggle('has', !!q.value);
      var cur = $('.paper.sel', list); if (cur && !cur._vis) cur.classList.remove('sel');
      $$('.chip').forEach(function (c) { c.setAttribute('aria-pressed', String((c.getAttribute('data-v') || '') === state[c.getAttribute('data-g')])); });
      yb.firstElementChild.textContent = state.year || 'all';
      $$('button', yl).forEach(function (b) { b.setAttribute('aria-selected', String((b.getAttribute('data-year') || '') === state.year)); });
      firstRun = false;
    };
    q.addEventListener('input', function () { state.q = q.value; apply(); });
    $$('.chip').forEach(function (c) { c.addEventListener('click', function () { state[c.getAttribute('data-g')] = c.getAttribute('data-v') || ''; apply(); }); });
    yb.addEventListener('click', function (e) { e.stopPropagation(); yl.hidden = !yl.hidden; yb.setAttribute('aria-expanded', String(!yl.hidden)); });
    $$('button', yl).forEach(function (b) { b.addEventListener('click', function () { state.year = b.getAttribute('data-year') || ''; yl.hidden = true; yb.setAttribute('aria-expanded', 'false'); apply(); }); });
    document.addEventListener('click', function () { yl.hidden = true; yb.setAttribute('aria-expanded', 'false'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !yl.hidden) { yl.hidden = true; yb.focus(); } });
    apply();
    if (location.hash === '#search') { q.focus(); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
  }

  /* keyboard shortcuts: 1-7 pages, / search, ? help, j/k cards, c cite, s sort, Esc clear */
  (function () {
    var tabs = $$('.tabs a.tab'), dlg = $('#keys'), kbtn = $('#kbtn');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var openKeys = function () { if (dlg && dlg.showModal && !dlg.open) dlg.showModal(); };
    if (kbtn) kbtn.addEventListener('click', openKeys);
    if (dlg) {
      var kc = $('#kclose'); if (kc) kc.addEventListener('click', function () { dlg.close(); });
      dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    }
    var sq = $('#q');
    if (sq) sq.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); sq.value = ''; sq.dispatchEvent(new Event('input')); sq.blur(); }
    });
    var cards = function () { return $$('.paper:not([hidden])', list || document); };
    var move = function (d) {
      var all = cards(); if (!all.length) return;
      var cur = $('.paper.sel', list), i = cur ? all.indexOf(cur) : -1;
      if (cur) cur.classList.remove('sel');
      var next = all[Math.max(0, Math.min(all.length - 1, i < 0 ? (d > 0 ? 0 : all.length - 1) : i + d))];
      next.classList.add('sel');
      next.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    };
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      var t = e.target, tn = t && t.tagName;
      if (tn === 'INPUT' || tn === 'TEXTAREA' || tn === 'SELECT' || (t && t.isContentEditable)) return;
      if (dlg && dlg.open) return;
      var k = e.key;
      if (/^[1-9]$/.test(k)) {
        var tab = tabs[+k - 1];
        if (tab && !tab.hasAttribute('aria-current')) { location.href = tab.getAttribute('href'); }
        else if (tab) window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
      } else if (k === '/') {
        e.preventDefault();
        if (sq) { sq.focus(); sq.select(); }
        else { var pt = tabs.filter(function (a) { return /(^|\/)papers\/(index\.html)?$/.test(a.getAttribute('href')); })[0]; if (pt) location.href = pt.getAttribute('href') + '#search'; }
      } else if (k === '?') { e.preventDefault(); openKeys(); }
      else if (list && k === 'j') move(1);
      else if (list && k === 'k') move(-1);
      else if (list && k === 'c') { var s = $('.paper.sel .cite-btn', list); if (s) s.click(); }
      else if (list && k === 's') { var sc = $('.chip[data-g="sort"]:not([aria-pressed="true"])'); if (sc) sc.click(); }
    });
  })();

  /* stickers (the totals in page headers and the badges on cards) flip like a coin when you point at or tap them, then settle */
  var flipSel = '.stat, .cbadge';
  var flip = function (e) {
    var s = e.target.closest && e.target.closest(flipSel);
    if (!s || s.classList.contains('flip') || (e.relatedTarget && s.contains(e.relatedTarget))) return;
    s.classList.add('flip');
  };
  document.addEventListener('mouseover', flip);
  document.addEventListener('pointerdown', flip); /* phones: tapping a non-link does not always send mouseover or click, but it always sends pointerdown */
  document.addEventListener('animationend', function (e) { if (e.target.classList && e.target.classList.contains('flip')) e.target.classList.remove('flip'); });

  /* totals count up from 0 the first time you open a page in a visit */
  (function () {
    var nums = $$('.phstats .stat b');
    if (!nums.length || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    var key = 'counted:' + location.pathname;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch (e) {}
    nums.forEach(function (el) {
      var txt = el.textContent.trim();
      if (!/^[\d,]+$/.test(txt)) return;
      var target = parseInt(txt.replace(/,/g, ''), 10), t0 = null, dur = 900 + Math.min(600, target * 2);
      el.textContent = '0';
      var step = function (t) {
        if (t0 === null) t0 = t;
        var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(target * e).toLocaleString('en-US');
        if (p < 1) requestAnimationFrame(step); else el.textContent = txt;
      };
      requestAnimationFrame(step);
    });
  })();

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
