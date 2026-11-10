/* jarrodmhicks.com: small, dependency-free helpers.
   Menu on phones, the email sticker, papers filtering, keyboard shortcuts, Lately, and the random 404. */
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

  /* copy buttons (BibTeX, citation) */
  $$('[data-copy]').forEach(function (b) {
    if (b.tagName !== 'BUTTON') return;
    var label = b.textContent;
    b.addEventListener('click', function () {
      var text = b.getAttribute('data-copy');
      var done = function () {
        b.textContent = 'copied';
        clearTimeout(b._t);
        b._t = setTimeout(function () { b.textContent = label; }, 2200);
      };
      var fallback = function () {
        var pre = b.closest('.paper') && $('pre', b.closest('.paper'));
        if (pre && window.getSelection) {
          var r = document.createRange(); r.selectNodeContents(pre);
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

  /* contact: the Email sticker copies my address and shows a small toast with an "open mail app" button.
     On phones (no hover) it opens the mail app straight away. The address is stored encoded in the page. */
  (function () {
    var btn = $('#cs-mail'); if (!btn) return;
    var addr = ''; try { addr = atob(btn.getAttribute('data-mail')); } catch (e) {}
    var timer = 0;
    var closeToast = function () { clearTimeout(timer); var o = $('.pop'); if (o) o.remove(); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeToast(); });
    btn.addEventListener('click', function () {
      if (!addr) return;
      if (window.matchMedia && window.matchMedia('(hover: none)').matches) { location.href = 'mailto:' + addr; return; }
      closeToast();
      var el = document.createElement('div');
      el.className = 'pop pop-a'; el.setAttribute('role', 'status'); el.style.setProperty('--c', getComputedStyle(btn).getPropertyValue('--c'));
      var show = function (copied) {
        el.innerHTML = '<span class="tick"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span class="tx"><span class="lab">' + (copied ? 'copied' : 'my email') + '</span><code></code></span><a class="btn s" href="">open mail app</a><button class="x" type="button" aria-label="Dismiss">\u2715</button><span class="bar"></span>';
        $('code', el).textContent = addr;
        $('a.btn', el).setAttribute('href', 'mailto:' + addr);
        $('.x', el).addEventListener('click', closeToast);
        document.body.appendChild(el);
        timer = setTimeout(closeToast, 8000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(addr).then(function () { show(true); }, function () { show(false); });
      else show(false);
    });
  })();

  /* cite panels on papers */
  $$('.cite-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var panel = b.closest('.paper').querySelector('.cw');
      var open = panel.classList.toggle('open');
      b.setAttribute('aria-expanded', String(open));
    });
  });

  /* lately: page back through the stack of cards. The card you are moving to slides out from behind the pile
     (left for back, right for forward) and lands on top, while the current one drops back into the pile. */
  var latelyRows = [], latelyAct = -1;
  var setLatelyAct = function (i) {
    latelyAct = i;
    latelyRows.forEach(function (s, k) { s.row.classList.toggle('act', k === i); });
    if (i >= 0) latelyRows[i].row.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  };
  var latelyGo = function (st, d) {
    if (!st.go || st.busy) return; st.go(d);
  };
  $$('#lately .row').forEach(function (row, ri) {
    var cards = $$('.card', row), nav = $('.nav', row), stk = $('.stk', row), st = { row: row, busy: false };
    latelyRows.push(st);
    row.addEventListener('click', function () { setLatelyAct(ri); });
    if (!nav || cards.length < 2) return;
    var pos = 0, label = $('.pos', nav), btns = $$('.kb', nav);
    nav.hidden = false;
    var paint = function () {
      cards.forEach(function (c, i) { c.classList.toggle('off', i !== pos); c.style.zIndex = ''; });
      var left = cards.length - pos;
      stk.classList.toggle('one', left <= 1);
      stk.classList.toggle('two', left === 2);
      label.textContent = (pos ? 'past' : 'now') + ' \u00b7 ' + (pos + 1) + ' of ' + cards.length;
      btns[0].disabled = pos >= cards.length - 1;
      btns[1].disabled = pos <= 0;
    };
    st.go = function (d) {
      var nx = pos + d; if (nx < 0 || nx >= cards.length) return;
      var o = cards[pos], n = cards[nx];
      if (reduce || !o.animate) { pos = nx; paint(); return; }
      st.busy = true; n.style.visibility = 'visible'; o.style.visibility = 'visible';
      var dist = Math.min(stk.offsetWidth * 0.36, 230), sg = d > 0 ? -1 : 1, outAt = 'translate(' + (sg * dist) + 'px,-4%) rotate(' + (sg * 4) + 'deg)';
      var run = [
        n.animate([
          { transform: 'translate(8px,8px) scale(.98)', zIndex: 1, opacity: 0, offset: 0, easing: 'cubic-bezier(.2,.75,.3,1)' },
          { transform: outAt, zIndex: 1, opacity: 1, offset: .45 },
          { transform: outAt, zIndex: 5, offset: .5, easing: 'cubic-bezier(.55,0,.3,1)' },
          { transform: 'none', zIndex: 5, offset: 1 }], { duration: 320, fill: 'both' }),
        o.animate([{ transform: 'none', zIndex: 2 }, { transform: 'translate(6px,6px) scale(.985)', zIndex: 2 }], { duration: 320, easing: 'cubic-bezier(.2,.75,.3,1)', fill: 'both' })
      ], left = run.length;
      run.forEach(function (a) { a.onfinish = function () {
        if (--left) return;
        run.forEach(function (x) { x.cancel(); });
        cards.forEach(function (c) { c.style.opacity = ''; c.style.visibility = ''; });
        pos = nx; paint(); st.busy = false;
      }; });
    };
    nav.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || b.disabled) return;
      setLatelyAct(ri); latelyGo(st, +b.getAttribute('data-d'));
    });
    paint();
  });
  /* up and down choose a row, left and right page that row */
  if (latelyRows.length) document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    var t = e.target, tn = t && t.tagName;
    if (tn === 'INPUT' || tn === 'TEXTAREA' || tn === 'SELECT' || (t && t.isContentEditable)) return;
    var dlg = $('#keys'); if (dlg && dlg.open) return;
    var k = e.key;
    if (k === 'ArrowDown') { e.preventDefault(); setLatelyAct(latelyAct < 0 ? 0 : Math.min(latelyRows.length - 1, latelyAct + 1)); }
    else if (k === 'ArrowUp') { e.preventDefault(); setLatelyAct(latelyAct < 0 ? 0 : Math.max(0, latelyAct - 1)); }
    else if (k === 'ArrowLeft' && latelyAct >= 0) { e.preventDefault(); latelyGo(latelyRows[latelyAct], 1); }
    else if (k === 'ArrowRight' && latelyAct >= 0) { e.preventDefault(); latelyGo(latelyRows[latelyAct], -1); }
    else if (k === 'Escape') setLatelyAct(-1);
  });

  /* papers and presentations: search, chip rows (topic, format), year dropdown */
  var list = $('#plist') || $('#tlist');
  if (list) {
    var papers = $$('.paper', list), groups = $$('.ygrp', list);
    var state = { q: '', topic: [], author: [], venue: '', type: '', year: '', sort: 'year' }; /* topic is a list: a card has to carry every topic you picked */
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
        var have = (p.getAttribute('data-topics') || '').split('|');
        var by = (p.getAttribute('data-authors') || '').split('|');
        var ok = state.topic.every(function (t) { return have.indexOf(t) > -1; }) &&
                 state.author.every(function (a) { return by.indexOf(a) > -1; }) &&
                 (!state.venue || p.getAttribute('data-venue') === state.venue) &&
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
      /* filters picked on cards (and the topic and year chosen above) show as chips inside the search box */
      var sbox = q.parentNode, toks = [];
      state.author.forEach(function (a) { toks.push({ f: 'author', v: a }); });
      if (state.venue) toks.push({ f: 'venue', v: state.venue });
      if (state.year) toks.push({ f: 'year', v: state.year });
      state.topic.forEach(function (t) { toks.push({ f: 'topic', v: t }); });
      $$('.tok', sbox).forEach(function (t) { t.remove(); });
      toks.forEach(function (t) {
        var el = document.createElement('span'), lab = document.createElement('b'), val = document.createElement('span'), x = document.createElement('button');
        el.className = 'tok'; lab.textContent = t.f; val.className = 'v'; val.textContent = t.v; val.title = t.v;
        x.type = 'button'; x.textContent = '\u2715'; x.setAttribute('aria-label', 'Remove ' + t.f + ' filter: ' + t.v);
        x.addEventListener('click', function (e) { e.stopPropagation(); unfilter(t.f, t.v); q.focus(); });
        if (t.f === 'topic') { var ch = $$('.chip', document).filter(function (c) { return c.getAttribute('data-g') === 'topic' && c.getAttribute('data-v') === t.v; })[0]; if (ch) el.style.setProperty('--c', ch.style.getPropertyValue('--c')); }
        el.appendChild(lab); el.appendChild(val); el.appendChild(x); sbox.insertBefore(el, q);
      });
      q.placeholder = toks.length ? 'search within these' : q.getAttribute('data-ph');
      sbox.classList.toggle('has', !!(q.value || toks.length));
      var sc = $('.sclr', sbox); if (sc) sc.hidden = !(q.value || toks.length || state.type);
      $$('.fl', list).forEach(function (b) {
        var f = b.getAttribute('data-f'), v = b.getAttribute('data-v');
        b.classList.toggle('on', Array.isArray(state[f]) ? state[f].indexOf(v) > -1 : state[f] === v);
      });
      var cur = $('.paper.sel', list); if (cur && !cur._vis) cur.classList.remove('sel');
      $$('.chip').forEach(function (c) { var g = c.getAttribute('data-g'), v = c.getAttribute('data-v') || ''; c.setAttribute('aria-pressed', String(g === 'topic' ? (v ? state.topic.indexOf(v) > -1 : !state.topic.length) : v === state[g])); });
      yb.firstElementChild.textContent = state.year || 'all'; yb.classList.toggle('on', !!state.year);
      $$('button', yl).forEach(function (b) { b.setAttribute('aria-selected', String((b.getAttribute('data-year') || '') === state.year)); });
      firstRun = false;
    };
    q.setAttribute('data-ph', q.placeholder);
    var unfilter = function (f, v) {
      if (Array.isArray(state[f])) { var i = state[f].indexOf(v); if (i > -1) state[f].splice(i, 1); } else state[f] = '';
      apply();
    };
    /* back to everything: text, authors, venue, year, topics and format (the sort order stays) */
    var clearAll = function () { q.value = ''; state.q = ''; state.topic = []; state.author = []; state.venue = ''; state.year = ''; state.type = ''; apply(); };
    list.clearFilters = clearAll;
    list.hasFilters = function () { return !!(state.q || state.topic.length || state.author.length || state.venue || state.year || state.type); };
    q.addEventListener('input', function () { state.q = q.value; apply(); });
    q.addEventListener('keydown', function (e) { if (e.key === 'Backspace' && !q.value && (state.author.length || state.venue || state.year || state.topic.length)) { /* Backspace on an empty box removes the last chip */
      e.preventDefault();
      if (state.topic.length) state.topic.pop(); else if (state.year) state.year = ''; else if (state.venue) state.venue = ''; else state.author.pop();
      apply();
    } });
    var sbx = q.parentNode, scl = $('.sclr', sbx), nc = $('#nclr');
    if (scl) scl.addEventListener('click', function () { clearAll(); q.focus(); });
    if (nc) nc.addEventListener('click', clearAll);
    sbx.addEventListener('click', function (e) { if (e.target === sbx) q.focus(); });
    /* click an author, venue, year or topic on a card to filter by it; click it again to undo */
    list.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.fl'); if (!b) return;
      var f = b.getAttribute('data-f'), v = b.getAttribute('data-v');
      if (Array.isArray(state[f])) { var i = state[f].indexOf(v); if (i > -1) state[f].splice(i, 1); else state[f].push(v); } else state[f] = state[f] === v ? '' : v;
      apply();
      if (sbx.getBoundingClientRect().top < 0) sbx.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' }); /* so you can see the chip you just made */
    });
    $$('.chip').forEach(function (c) { c.addEventListener('click', function () {
      var g = c.getAttribute('data-g'), v = c.getAttribute('data-v') || '';
      if (g === 'topic') { /* topics add up; "all" clears them; unpicking the last one goes back to all */
        if (!v) state.topic = []; else { var i = state.topic.indexOf(v); if (i > -1) state.topic.splice(i, 1); else state.topic.push(v); }
      } else state[g] = v;
      apply();
    }); });
    yb.addEventListener('click', function (e) { e.stopPropagation(); yl.hidden = !yl.hidden; yb.setAttribute('aria-expanded', String(!yl.hidden)); });
    $$('button', yl).forEach(function (b) { b.addEventListener('click', function () { state.year = b.getAttribute('data-year') || ''; yl.hidden = true; yb.setAttribute('aria-expanded', 'false'); apply(); }); });
    document.addEventListener('click', function () { yl.hidden = true; yb.setAttribute('aria-expanded', 'false'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !yl.hidden) { yl.hidden = true; yb.focus(); } });
    apply();
    if (location.hash === '#search') { q.focus(); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
  }

  /* keyboard shortcuts: 1-7 pages, / search (Enter selects the top result), ? help,
     n/b or down/up step through cards, left/right move along a card's links, c cite, v view, Esc clear */
  (function () {
    var tabs = $$('.tabs a.tab'), dlg = $('#keys'), kbtn = $('#kbtn');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var openKeys = function () { if (dlg && dlg.showModal && !dlg.open) dlg.showModal(); };
    if (kbtn) kbtn.addEventListener('click', openKeys);
    if (dlg) {
      var kc = $('#kclose'); if (kc) kc.addEventListener('click', function () { dlg.close(); });
      dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    }
    var cards = function () { return $$('.paper', list || document).filter(function (p) { return !p.hidden && p._vis !== false; }); };
    var selected = function () { return $('.paper.sel', list || document); };
    var select = function (c, byClick) {
      var cur = selected(); if (cur) cur.classList.remove('sel');
      if (!byClick && document.activeElement && document.activeElement.blur && list && list.contains(document.activeElement)) document.activeElement.blur();
      if (!c) return;
      c.classList.add('sel');
      if (!byClick) c.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    };
    /* clicking a card selects it, the same as stepping to it with the keys (no scrolling, since you are already looking at it) */
    if (list) list.addEventListener('click', function (e) {
      var c = e.target.closest && e.target.closest('.paper');
      if (c && c !== selected()) select(c, true);
    });
    var move = function (d) {
      var all = cards(); if (!all.length) return;
      var cur = selected(), i = cur ? all.indexOf(cur) : -1;
      select(all[Math.max(0, Math.min(all.length - 1, i < 0 ? (d > 0 ? 0 : all.length - 1) : i + d))]);
    };
    var linksOf = function (c) { return $$('.ql a', c); };
    /* "view": a paper's PDF (else its DOI), a talk's slides (else its video) */
    var view = function (c) {
      var ls = linksOf(c), order = ['pdf', 'slides', 'poster', 'doi', 'video'];
      for (var i = 0; i < order.length; i++) { var a = ls.filter(function (x) { return x.getAttribute('data-k') === order[i]; })[0]; if (a) { a.click(); return; } }
    };
    var sq = $('#q');
    if (sq) sq.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); if (list && list.clearFilters) list.clearFilters(); else { sq.value = ''; sq.dispatchEvent(new Event('input')); } sq.blur(); }
      else if (e.key === 'Enter') { var first = cards()[0]; if (first) { e.preventDefault(); sq.blur(); select(first); } }
    });
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
      else if (list && (k === 'n' || k === 'ArrowDown')) { e.preventDefault(); move(1); }
      else if (list && ((k === 'b' && kpos < 8) || k === 'ArrowUp')) { e.preventDefault(); move(-1); } /* "b" is part of the Konami code, so it waits while that is mid-entry */
      else if (list && (k === 'ArrowRight' || k === 'ArrowLeft')) {
        var cur = selected(); if (!cur) return;
        var ls = linksOf(cur); if (!ls.length) return;
        e.preventDefault();
        var at = ls.indexOf(document.activeElement);
        ls[k === 'ArrowRight' ? (at < 0 ? 0 : Math.min(ls.length - 1, at + 1)) : (at < 0 ? ls.length - 1 : Math.max(0, at - 1))].focus();
      }
      else if (list && k === 'c') { var s = $('.paper.sel .cite-btn', list); if (s) s.click(); }
      else if (list && k === 'v') { var vc = selected(); if (vc) view(vc); }
      else if (list && k === 'Escape') { if (selected()) select(null); else if (list.hasFilters && list.hasFilters()) list.clearFilters(); }
    });
  })();

  /* stickers (the totals in page headers and the badges on cards) flip like a coin when you point at or tap them, then settle */
  var flipSel = '.stat, .cbadge, .sk, .cs, .tl .dt';
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
    var dotColors = ['#121826', '#FF5A4A', '#FF9F1C', '#FFD43B', '#4CD07D', '#4D9BFF', '#B08CFF', '#FF7EB6'], di = 0; /* starts black, then the rainbow, then black again */
    dot.addEventListener('click', function () {
      di = (di + 1) % dotColors.length;
      dot.style.color = dotColors[di];
      dot.classList.remove('pop'); void dot.offsetWidth; dot.classList.add('pop');
    });
  }

  /* Konami code: up up down down left right left right b a  ->  tiny colored raindrops that fall, splash,
     and bounce off your pointer. It stops by itself after about 15 seconds. Click anywhere, press Esc, press "stop",
     or enter the code again to stop sooner. Settings were tuned by eye: density 900 (scaled to the screen), speed 50, bounce 15, thickness 140. */
  var seq = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'], kpos = 0;
  var rain = null, pill = null, rainEnder = null;
  var stopRain = function () {
    clearTimeout(rainEnder); rainEnder = null;
    if (pill) { pill.remove(); pill = null; }
    if (rain) rain.ending = true; /* no new drops; the canvas goes away once the last ones have landed */
  };
  var startRain = function () {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (rain && !rain.ending) { stopRain(); return; }
    if (rain) return;
    var cv = document.createElement('canvas'); cv.id = 'rain-cv'; cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    var cx = cv.getContext('2d'), W = 0, H = 0;
    var COLORS = ['#FF5A4A', '#FF9F1C', '#FFD43B', '#4CD07D', '#4D9BFF', '#B08CFF', '#FF7EB6'];
    var drops = [], spl = [], acc = 0, last = performance.now(), raf = 0;
    var P = { x: -999, y: -999, vx: 0, vy: 0, on: false, lx: 0, ly: 0, lt: 0 }, R = 30;
    var SPEED = 0.5, BOUNCE = 0.15, THICK = 1.4;
    var size = function () { var dpr = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size();
    var onResize = size, onMove = function (e) {
      var t = performance.now(), dt = Math.max(8, t - P.lt) / 1000;
      P.vx = P.vx * .6 + ((e.clientX - P.lx) / dt) * .4; P.vy = P.vy * .6 + ((e.clientY - P.ly) / dt) * .4;
      P.x = P.lx = e.clientX; P.y = P.ly = e.clientY; P.lt = t; P.on = true;
    }, onLeave = function () { P.on = false; }, onUp = function (e) { if (e.pointerType !== 'mouse') P.on = false; };
    addEventListener('resize', onResize); addEventListener('pointermove', onMove); document.addEventListener('mouseleave', onLeave); addEventListener('pointerup', onUp);
    rain = { ending: false };
    pill = document.createElement('button'); pill.type = 'button'; pill.className = 'rain-stop'; pill.textContent = 'stop the rain (esc)';
    pill.addEventListener('click', function (e) { e.stopPropagation(); stopRain(); });
    document.body.appendChild(pill);
    var teardown = function () {
      cancelAnimationFrame(raf); cv.remove(); rain = null;
      removeEventListener('resize', onResize); removeEventListener('pointermove', onMove); document.removeEventListener('mouseleave', onLeave); removeEventListener('pointerup', onUp);
    };
    var step = function (now) {
      var dt = Math.min(.035, (now - last) / 1000 || .016); last = now;
      var g = 1500 * SPEED, term = 1250 * SPEED;
      if (!rain.ending) {
        acc += 900 * Math.min(1.4, Math.max(.3, W / 1440)) * dt; /* fewer drops on a phone, so it stays smooth */
        var n = acc | 0; acc -= n;
        for (var i = 0; i < n && drops.length < 2400; i++) drops.push({ x: Math.random() * (W + 120) - 60, y: -20 - Math.random() * 40, vx: 0, vy: (500 + Math.random() * 350) * SPEED, len: 7 + Math.random() * 9, w: (1.6 + Math.random() * 1.4) * THICK, c: COLORS[(Math.random() * 7) | 0] });
      }
      P.vx *= .9; P.vy *= .9;
      cx.clearRect(0, 0, W, H); cx.lineCap = 'round';
      for (var j = drops.length - 1; j >= 0; j--) {
        var d = drops[j];
        d.vy += g * dt; var sv = Math.hypot(d.vx, d.vy); if (sv > term) { d.vx *= term / sv; d.vy *= term / sv; }
        d.vx *= 1 - .7 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
        if (P.on) {
          var dx = d.x - P.x, dy = d.y - P.y, r = R + d.w, d2 = dx * dx + dy * dy;
          if (d2 < r * r) {
            var dd = Math.sqrt(d2) || 1, nx = dx / dd, ny = dy / dd; d.x = P.x + nx * r; d.y = P.y + ny * r;
            var rvx = d.vx - P.vx * .5, rvy = d.vy - P.vy * .5, vn = rvx * nx + rvy * ny;
            if (vn < 0) { d.vx -= (1 + BOUNCE) * vn * nx; d.vy -= (1 + BOUNCE) * vn * ny; d.vx += P.vx * .28 + (Math.random() - .5) * 60; d.vy += P.vy * .28; }
          }
        }
        if (d.y > H - 1 || d.x < -80 || d.x > W + 80) {
          if (d.y > H - 1 && spl.length < 700) for (var k = 0; k < 3; k++) spl.push({ x: d.x, y: H - 1, vx: (Math.random() - .5) * 160, vy: -(90 + Math.random() * 190), c: d.c, l: .34 + Math.random() * .2, r: d.w * .6 });
          drops[j] = drops[drops.length - 1]; drops.pop(); continue;
        }
        var sl = Math.hypot(d.vx, d.vy) || 1;
        cx.strokeStyle = d.c; cx.lineWidth = d.w; cx.globalAlpha = .95; cx.beginPath(); cx.moveTo(d.x, d.y); cx.lineTo(d.x - d.vx / sl * d.len, d.y - d.vy / sl * d.len); cx.stroke();
      }
      for (var m = spl.length - 1; m >= 0; m--) {
        var s = spl[m]; s.l -= dt;
        if (s.l <= 0) { spl[m] = spl[spl.length - 1]; spl.pop(); continue; }
        s.vy += 1300 * dt; s.x += s.vx * dt; s.y += s.vy * dt; if (s.y > H - 1) { s.y = H - 1; s.vy *= -.3; }
        cx.globalAlpha = Math.min(1, s.l * 3.5); cx.fillStyle = s.c; cx.beginPath(); cx.arc(s.x, s.y, s.r, 0, 6.3); cx.fill();
      }
      cx.globalAlpha = 1;
      if (rain.ending && !drops.length && !spl.length) { teardown(); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    rainEnder = setTimeout(stopRain, 15000);
  };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { stopRain(); return; }
    var t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') { kpos = 0; return; }
    var k = String(e.key).toLowerCase();
    if (k === seq[kpos]) { kpos++; if (kpos === seq.length) { kpos = 0; startRain(); } }
    else kpos = (k === seq[0]) ? 1 : 0;
  });
  document.addEventListener('click', function () { if (rain && !rain.ending) stopRain(); });

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
  /* the home badge is a pendulum: drag it, let go, and it swings and settles. A plain tap gives it a push. */
  (function () {
    var lan = document.querySelector('.p-lan'), pv = lan && lan.querySelector('.piv');
    if (!lan || !pv || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    var K = 7.5, DAMP = 1.3; /* stiffness (a swing takes about 2.3 s) and friction */
    var th = 0, om = 0, raf = 0, last = 0, drag = null, samples = [];
    var show = function () { lan.style.transform = 'rotate(' + (th * 180 / Math.PI).toFixed(3) + 'deg)'; };
    var pivot = function () { var r = pv.getBoundingClientRect(); return { x: r.left, y: r.top }; };
    var ang = function (e, p) { return Math.atan2(e.clientX - p.x, e.clientY - p.y); };
    var wrap = function (a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
    var step = function (t) {
      var dt = Math.min(0.033, (t - last) / 1000 || 0.016); last = t;
      om += (-K * Math.sin(th) - DAMP * om) * dt; th += om * dt; show();
      if (Math.abs(th) < 0.006 && Math.abs(om) < 0.03) { rest(); return; }
      raf = requestAnimationFrame(step);
    };
    var rest = function () { raf = 0; th = 0; om = 0; lan.style.transform = ''; lan.classList.remove('dr'); }; /* back to the slow idle sway */
    var go = function () { last = performance.now(); if (!raf) raf = requestAnimationFrame(step); };
    var current = function () { /* the angle the badge is at right now, even in the middle of the idle sway */
      var m = new DOMMatrix(getComputedStyle(lan).transform); return Math.atan2(m.b, m.a);
    };
    lan.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      if (raf) { cancelAnimationFrame(raf); raf = 0; } else th = current();
      var p = pivot(); lan.classList.add('dr'); show();
      drag = { p: p, a0: ang(e, p), th0: th, x: e.clientX, y: e.clientY, moved: false }; samples = [];
      lan.setPointerCapture(e.pointerId); e.preventDefault();
    });
    lan.addEventListener('pointermove', function (e) {
      if (!drag) return;
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
      if (!drag.moved) return;
      th = Math.max(-3.05, Math.min(3.05, drag.th0 + wrap(ang(e, drag.p) - drag.a0))); show();
      samples.push({ t: performance.now(), th: th }); if (samples.length > 8) samples.shift();
    });
    var up = function () {
      if (!drag) return;
      if (!drag.moved) om = (Math.random() < .5 ? -1 : 1) * 2.6; /* a tap */
      else {
        var n = performance.now(), s = samples.filter(function (q) { return n - q.t < 90; });
        om = s.length > 1 ? Math.max(-14, Math.min(14, (s[s.length - 1].th - s[0].th) / ((s[s.length - 1].t - s[0].t) / 1000))) : 0;
      }
      drag = null; go();
    };
    lan.addEventListener('pointerup', up); lan.addEventListener('pointercancel', up);
  })();
})();
