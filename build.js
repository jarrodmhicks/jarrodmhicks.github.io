#!/usr/bin/env node
/* Build script for jarrodmhicks.com
   Reads the small JSON files in data/, checks them, and writes the finished site into dist/.
   No dependencies: just run  node build.js  (Node 16 or newer). */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const LOCAL = process.argv.includes('--local'); // preview build: relative paths, works by double-clicking dist/index.html
const OUT = path.join(ROOT, 'dist'); // everything the site serves is written here
const errors = [];
const placeholders = [];
const warnings = [];

/* "Last updated" = date of the newest commit that touched data/ (falls back to today, e.g. in a plain folder). */
const UPDATED = (() => {
  let d = new Date();
  try {
    const out = require('child_process').execSync('git log -1 --format=%cI -- data', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    if (out) d = new Date(out);
  } catch (e) { /* no git: use today */ }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
})();

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Text fields allow  [link text](https://...)  and  **bold**.  Everything else is escaped. */
const rich = t => esc(t)
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, url) => {
    const ext = /^https?:/.test(url);
    return `<a class="in" href="${url}"${ext ? ' target="_blank" rel="noopener"' : ''}>${txt}</a>`;
  })
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

/* ---------- reading and checking ---------- */
function readJSON(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); }
  catch (e) { errors.push(`${rel}: ${e.message}`); return null; }
}
function readFolder(rel) {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) return []; /* an empty folder is not saved by git, so a missing one just means no entries */
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()
    .map(f => ({ file: `${rel}/${f}`, data: readJSON(`${rel}/${f}`) })).filter(x => x.data);
}
function need(file, obj, field, ok, hint) {
  const v = obj[field];
  const good = v !== undefined && v !== null && v !== '' && (!ok || ok(v));
  if (!good) errors.push(`${file}: missing or invalid "${field}"${hint ? ' (' + hint + ')' : ''}`);
  return good;
}

const site = readJSON('data/site.json') || {};
/* topics.json is just a list of names. They are sorted A to Z and handed the site colors in order (then it repeats). */
const TOPIC_COLORS = ['#FF5A4A', '#FF9F1C', '#FFD43B', '#4CD07D', '#4D9BFF', '#B08CFF', '#FF7EB6'];
const topicIds = (readJSON('data/topics.json') || []).map(t => typeof t === 'string' ? t : t && t.id).filter(Boolean).sort((a, b) => a.localeCompare(b));
const timeline = readJSON('data/timeline.json') || [];
const lately = readJSON('data/lately.json') || [];
const links = readJSON('data/links.json') || [];
const consulting = readJSON('data/consulting.json') || { cards: [] };
const LEDES = site.ledes || {}; /* the short line under each page title; a missing or empty one just leaves no line */

const PRES_TYPES = ['talk', 'poster'];
const PRES_COLOR = { talk: '#FF5A4A', poster: '#FF9F1C' }; /* same as the first two stickers (talks, posters) at the top of Presentations */
const LINK_KEYS = ['slides', 'poster', 'video', 'code', 'data', 'demo'];
const LINK_LABEL = { poster: 'pdf' };
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); /* YYYY-MM-DD */
/* a talk is "upcoming" until its month (or its exact day, if you gave one) has passed; the site rebuilds daily so this stays current */
const isUpcoming = t => String(t.date).length > 7 ? String(t.date) >= TODAY : String(t.date) >= TODAY.slice(0, 7);

const papers = readFolder('data/papers').map(({ file, data }) => {
  need(file, data, 'title', v => typeof v === 'string');
  need(file, data, 'authors', v => Array.isArray(v) && v.length > 0, 'a list of names');
  need(file, data, 'venue', v => typeof v === 'string');
  need(file, data, 'year', v => Number.isInteger(v), 'a number like 2024');
  need(file, data, 'topics', v => Array.isArray(v) && v.length > 0 && v.every(t => topicIds.includes(t)), 'topics must be from data/topics.json: ' + topicIds.join(', '));
  if (data.placeholder) placeholders.push(file);
  return data;
});


/* ---------- papers from .bib files: paste what Google Scholar gives you ---------- */
const BIB_EXTRA = ['topics', 'pdf', 'code', 'data', 'status', 'citations', 'new', 'equal'];
const NUM_WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const ACC = { "'": '́', '`': '̀', '"': '̈', '^': '̂', '~': '̃' };
const tex = s => s.replace(/\\(['`"^~])\s*\{?\\?([a-zA-Z])\}?/g, (m, a, c) => (c + ACC[a]).normalize('NFC'))
  .replace(/\\([&%$#_])/g, '$1').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
function parseBib(text, file) {
  const out = [], head = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g;
  let m;
  while ((m = head.exec(text))) {
    let i = m.index + m[0].length, depth = 1, start = i;
    for (; i < text.length && depth; i++) { if (text[i] === '{') depth++; else if (text[i] === '}') depth--; }
    const body = text.slice(start, i - 1), fields = {}, order = [];
    head.lastIndex = i;
    let p = 0;
    while (p < body.length) {
      const nm = /^[\s,]*([A-Za-z][\w-]*)\s*=\s*/.exec(body.slice(p));
      if (!nm) break;
      p += nm[0].length;
      let val;
      if (body[p] === '{') { let d = 1, q = p + 1; for (; q < body.length && d; q++) { if (body[q] === '{') d++; else if (body[q] === '}') d--; } val = body.slice(p + 1, q - 1); p = q; }
      else if (body[p] === '"') { let q = p + 1, d = 0; for (; q < body.length; q++) { if (body[q] === '{') d++; else if (body[q] === '}') d--; else if (body[q] === '"' && !d && body[q - 1] !== '\\') break; } val = body.slice(p + 1, q); p = q + 1; }
      else { const q = body.slice(p).search(/[,\n}]/); const e = q < 0 ? body.length : p + q; val = body.slice(p, e).trim(); p = e; }
      const key = nm[1].toLowerCase();
      fields[key] = val; order.push(key);
    }
    out.push({ type: m[1].toLowerCase(), key: m[2], fields, order, file });
  }
  return out;
}
function initials(first) {
  return first.split(/\s+/).filter(Boolean).map(tok => tok.split('-').map(x => {
    const c = x.replace(/\./g, '');
    return /^[A-Z]{2,3}$/.test(c) ? c.split('').map(l => l + '.').join(' ') : c.charAt(0).toUpperCase() + '.';
  }).join('-')).join(' ');
}
/* keeps full first names as written; a bare initial like "M" becomes "M." and run-together initials like "JM" become "J. M." */
const fullName = (first, last) => (first ? first.split(/\s+/).map(t => /^[A-Z]{2,3}$/.test(t) ? t.split('').map(l => l + '.').join(' ') : /^[A-Za-z]$/.test(t) ? t + '.' : t).join(' ') + ' ' : '') + last;
function bibAuthors(s) {
  return tex(s).split(/\s+and\s+/i).map(a => a.trim()).filter(a => a && !/^others$/i.test(a)).map(a => {
    if (a.includes(',')) { const [last, first] = a.split(/,(.*)/s); return fullName(first.trim(), last.trim()); }
    const t = a.split(/\s+/); return t.length > 1 ? fullName(t.slice(0, -1).join(' '), t[t.length - 1]) : a;
  });
}
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const monthNum = s => { s = String(s || '').trim().toLowerCase(); if (/^\d{1,2}$/.test(s) && +s >= 1 && +s <= 12) return +s; const i = MONTHS.indexOf(s.slice(0, 3)); return i > -1 ? i + 1 : 0; };
function bibToPaper(e) {
  const f = e.fields, g = k => (f[k] !== undefined ? tex(f[k]) : '');
  const tag = `${e.file} (${e.key})`;
  const kind = ['article', 'inproceedings', 'phdthesis'].includes(e.type) ? e.type : 'article';
  const venue = g('journal') || g('booktitle') || g('school') || g('publisher') || g('howpublished') || g('series');
  const topicsList = g('topics').split(/[,;]/).map(s => s.trim()).filter(Boolean);
  const equal = g('equal') ? parseInt(g('equal'), 10) : 0; /* equal = {2}: the first two authors contributed equally */
  const kept = e.order.filter(k => !BIB_EXTRA.includes(k)).map(k => `  ${k} = {${f[k].trim()}}`).join(',\n')
    + (equal > 1 && equal <= 10 && f.note === undefined ? `,\n  note = {The first ${NUM_WORD[equal]} authors contributed equally}` : '');
  const doi = g('doi').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
  const p = {
    title: g('title'), authors: f.author ? bibAuthors(f.author) : [], venue, year: parseInt(g('year'), 10), topics: topicsList,
    details: { volume: g('volume'), issue: g('number') || g('issue'), pages: g('pages').replace(/\s*[-–—]+\s*/, '–'), numpages: g('numpages') },
    links: { doi, pdf: g('pdf'), code: g('code'), data: g('data') },
    status: g('status') || 'published',
    bibtype: kind, bibraw: `@${e.type}{${e.key},\n${kept}\n}`
  };
  if (g('citations')) p.citations = parseInt(g('citations'), 10);
  if (g('equal')) {
    if (Number.isInteger(equal) && equal > 1 && equal <= Math.min(10, p.authors.length)) p.equal = equal;
    else errors.push(`${tag}: "equal" should be how many of the first authors contributed equally, like  equal = {2}  (and no more than the number of authors)`);
  }
  const mo = monthNum(g('month')); if (mo) p.month = mo;
  if (/^(true|false)$/i.test(g('new'))) p.new = g('new').toLowerCase() === 'true';
  need(tag, p, 'title'); need(tag, p, 'authors', v => v.length > 0, 'an author field');
  need(tag, p, 'venue', null, 'a journal, booktitle or school field'); need(tag, p, 'year', v => Number.isInteger(v));
  need(tag, p, 'topics', v => v.length > 0 && v.every(t => topicIds.includes(t)), 'add a line like  topics = {hearing}  inside the entry. Options: ' + topicIds.join(', '));
  return p;
}
function readBibFolder(rel) {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.bib')).sort()
    .flatMap(f => parseBib(fs.readFileSync(path.join(dir, f), 'utf8'), `${rel}/${f}`)).map(bibToPaper);
}

papers.push(...readBibFolder('data/papers'));
papers.sort((a, b) => b.year - a.year || a.title.localeCompare(b.title));

/* citation counts: data/citations.json is written by tools/fetch-citations.js (OpenAlex) before each build */
const paperId = p => p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
if (process.argv.includes('--papers-json')) {
  console.log(JSON.stringify(papers.map(p => ({ id: paperId(p), title: p.title, authors: p.authors, year: p.year, doi: (p.links || {}).doi || '' }))));
  process.exit(0);
}
{ const seen = new Set(); papers.forEach(p => { const id = paperId(p); if (seen.has(id)) warnings.push(`two papers have the same title: "${p.title}". Keep only one (your JSON files and papers.bib may overlap).`); seen.add(id); }); }
const cites = fs.existsSync(path.join(ROOT, 'data/citations.json')) ? (readJSON('data/citations.json') || {}) : {};
papers.forEach(p => { const n = cites[paperId(p)]; if (Number.isInteger(n)) p.citations = n; });
const totalCites = papers.reduce((s, p) => s + (Number.isInteger(p.citations) ? p.citations : 0), 0);
const hIndex = [...papers.map(p => p.citations || 0)].sort((a, b) => b - a).filter((c, i) => c >= i + 1).length;

const presFile = fs.existsSync(path.join(ROOT, 'data/presentations.json')) ? readJSON('data/presentations.json') : [];
if (!Array.isArray(presFile)) errors.push('data/presentations.json: should be a list, like [ {...}, {...} ]');
const presAll = [...readFolder('data/presentations'), ...(Array.isArray(presFile) ? presFile : []).map((data, i) => ({ file: `data/presentations.json (entry ${i + 1}${data && data.title ? ': ' + data.title : ''})`, data }))];
const talks = presAll.map(({ file, data }) => {
  need(file, data, 'title', v => typeof v === 'string');
  need(file, data, 'type', v => PRES_TYPES.includes(v), 'one of: ' + PRES_TYPES.join(', '));
  need(file, data, 'venue', v => typeof v === 'string');
  need(file, data, 'date', v => /^\d{4}-\d{2}(-\d{2})?$/.test(v), 'like 2026-11 or 2026-11-02');
  if (data.topics !== undefined && !(Array.isArray(data.topics) && data.topics.every(t => topicIds.includes(t)))) errors.push(`${file}: "topics" must be a list from data/topics.json: ${topicIds.join(', ')}`);
  if (data.authors !== undefined && !(Array.isArray(data.authors) && data.authors.length)) errors.push(`${file}: "authors" must be a list of names`);
  if (data.placeholder) placeholders.push(file);
  return data;
}).filter(t => t && typeof t.date === 'string').sort((a, b) => String(b.date).localeCompare(String(a.date)));

['name', 'url', 'email', 'me', 'intro', 'description'].forEach(f => need('data/site.json', site, f));
if (!Array.isArray(site.tagline) || site.tagline.length !== 2) errors.push('data/site.json: "tagline" must be two strings, like ["making senses", "make sense"]');
if (!Array.isArray(site.about)) errors.push('data/site.json: "about" must be a list of paragraphs');
timeline.forEach((t, i) => ['when', 'title', 'where'].forEach(f => need(`data/timeline.json[${i}]`, t, f)));
lately.forEach((c, i) => {
  need(`data/lately.json[${i}]`, c, 'label');
  need(`data/lately.json[${i}]`, c, 'items', v => Array.isArray(v) && v.length && v.every(x => typeof x === 'string' && x.trim()), 'a list of one or more texts, newest first');
  if (c.label && /\s/.test(c.label.trim())) warnings.push(`data/lately.json[${i}]: label "${c.label}" is more than one word`);
});
if (lately.length > 7) warnings.push('data/lately.json has more than 7 labels, so colors will repeat');
lately.forEach(c => (c.items || []).forEach(t => { if (/^\[/.test(t) && !/\]\(/.test(t)) placeholders.push(`data/lately.json: "${c.label}" still has a [bracketed] placeholder`); }));
links.forEach(l => { if (!l.url && !l.soon) warnings.push(`data/links.json: "${l.name}" has no url yet, so it is left off the Contact page (add "soon": true to show it greyed out as "soon")`); });

/* ---------- shared pieces ---------- */
const ALL_TABS = [
  { id: 'home', label: 'Home', color: '#FF5A4A', href: '/' },
  { id: 'about', label: 'About', color: '#FF9F1C', href: '/about/' },
  { id: 'papers', label: 'Papers', color: '#FFD43B', href: '/papers/' },
  { id: 'presentations', label: 'Presentations', color: '#4CD07D', href: '/presentations/' },
  { id: 'lately', label: 'Lately', color: '#4D9BFF', href: '/lately/' },
  { id: 'consulting', label: 'Consulting', color: '#B08CFF', href: '/consulting/' },
  { id: 'contact', label: 'Contact', color: '#FF7EB6', href: '/contact/' }
];
const HIDE = Array.isArray(site.hide) ? site.hide : [];
HIDE.forEach(id => { if (!ALL_TABS.slice(1).some(t => t.id === id)) errors.push(`data/site.json: "hide" has an unknown page "${id}". Use: ${ALL_TABS.slice(1).map(t => t.id).join(', ')}`); });
const TABS = ALL_TABS.filter(t => !HIDE.includes(t.id)); // hidden pages get no tab, no file and no sitemap entry
const RAINBOW = ALL_TABS.map(t => t.color); // colors stay put even when a tab is hidden
const HD_STYLE = 1;        /* how the totals at the top of Papers and Presentations look (1-6, see site.css) */
const BADGE_COLOR = 'yellow'; /* citation badge on paper cards: yellow, rainbow, topic, blue, pink, ink */
const STAT_TIP = { pages: 'published pages, from page ranges or numpages', 'days since': 'days since your last presentation', journals: 'different journals' };
const statBadge = (n, label, i) => `<div class="stat" style="--c:${RAINBOW[i % RAINBOW.length]}" title="${esc(STAT_TIP[label] || label)}"><b>${n}</b><span>${label}</span></div>`;
/* Totals shown in the page headers, in order. Colors follow the rainbow by position:
   1 red, 2 orange, 3 yellow, 4 green, 5 blue, 6 purple, 7 pink. Keep "citations" third so it matches the yellow paper badges.
   Papers can use: papers, citations, h-index, i10-index, most cited, cites per paper, co-authors, journals, venues, topics, pages, first author,
     solo papers, authors per paper, biggest team, with code, with data, with PDF, years active, papers per year, title words, titles with a colon
   Presentations can use: talks, posters, conferences, cities, countries, upcoming, days to next, days since, on video, with slides, demos, venues,
     topics, first author, co-presenters, years active, per year, best year */
const PAPER_STATS = ['papers', 'h-index', 'citations', 'most cited', 'co-authors', 'journals', 'first author'];
const PRES_STATS = ['total', 'upcoming', 'talks', 'posters', 'conferences', 'cities', 'days since'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const head = (title, lede, extra) => `<div class="phead">${extra ? `<div class="phrow"><h1><span>${esc(title)}</span></h1><div class="phstats">${extra}</div></div>` : `<h1><span>${esc(title)}</span></h1>`}${lede ? `<p>${rich(lede)}</p>` : ''}</div>`;

/* file fingerprints, so a changed CSS or JS file is never served stale from a cache */
const V = Object.fromEntries([['css', 'assets/css/site.css'], ['js', 'assets/js/site.js']].map(([k, f]) =>
  [k, require('crypto').createHash('md5').update(fs.readFileSync(path.join(ROOT, f))).digest('hex').slice(0, 8)]));
const an = site.analytics || {};
if (an.goatcounter && !/^[a-z0-9-]+$/i.test(an.goatcounter)) errors.push('data/site.json: analytics.goatcounter should be just your GoatCounter code, like "jarrodhicks"');
const analyticsTag = LOCAL ? '' :
  (an.goatcounter ? `\n<script data-goatcounter="https://${an.goatcounter}.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>` : '') +
  (an.cloudflare ? `\n<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${esc(an.cloudflare)}"}'></script>` : '');

/* one drawn arrow, rotated, so left/right/up/down are exactly the same size */
const AR = dir => `<svg class="ar ${dir}" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8M6.5 2.5 10 6l-3.5 3.5"/></svg>`;
const K = (...keys) => keys.map(k => ({ l: AR('l'), r: AR('r'), u: AR('u'), d: AR('d') }[k] ? `<kbd>${{ l: AR('l'), r: AR('r'), u: AR('u'), d: AR('d') }[k]}</kbd>` : `<kbd>${k}</kbd>`)).join(' <span class="or">or</span> ');
const keysDialog = `<dialog id="keys" aria-labelledby="keys-t">
  <h2 id="keys-t">Keyboard shortcuts</h2>
  <dl>
    <div><dt><kbd>1</kbd> to <kbd>${TABS.length}</kbd></dt><dd>jump to a page<div class="pgs">${TABS.map((t, i) => `<span class="pk" style="--c:${t.color}"><b>${i + 1}</b>${t.label}</span>`).join('')}</div></dd></div>
    <div><dt><kbd>/</kbd></dt><dd>search papers and presentations. press <kbd>Enter</kbd> to select the top result</dd></div>
    <div><dt><kbd>Esc</kbd></dt><dd>clear the search, close a menu or this box</dd></div>
    <div><dt><kbd>?</kbd></dt><dd>open this box</dd></div>
  </dl>
  <h3>On Papers and Presentations</h3>
  <dl>
    <div><dt><kbd>Enter</kbd></dt><dd>after searching: select the top result</dd></div>
    <div><dt>${K('n', 'd')}</dt><dd>next card</dd></div>
    <div><dt>${K('b', 'u')}</dt><dd>previous card</dd></div>
    <div><dt>${K('l', 'r')}</dt><dd>move along the card's links (DOI, PDF, slides, video). <kbd>Enter</kbd> opens the highlighted one</dd></div>
    <div><dt><kbd>c</kbd></dt><dd>open or close the BibTeX box on the selected paper</dd></div>
    <div><dt><kbd>v</kbd></dt><dd>view the selected card: a paper's PDF (or its DOI if there is no PDF), a talk's slides (or its video)</dd></div>
  </dl>
  <h3>On Lately</h3>
  <dl>
    <div><dt>${K('u', 'd')}</dt><dd>choose a row</dd></div>
    <div><dt>${K('l', 'r')}</dt><dd>go back in time, or forward again, on the chosen row</dd></div>
  </dl>
  <p class="kfoot">There is also a hidden code. Hint: it is a classic sequence.</p>
  <button type="button" class="btn" id="kclose">close</button>
</dialog>`;
function page({ id, title, desc, body, file }) {
  if (HIDE.includes(id)) return;
  const tab = TABS.find(t => t.id === id);
  const cur = tab || { label: '404', color: '#FF5A4A' };
  const full = id === 'home' ? `${site.name} | ${site.eyebrow}` : `${title} · ${site.name}`;
  const url = site.url + (tab ? tab.href : '/');
  const tabs = TABS.map(t => `<a class="tab" style="--c:${t.color}" href="${t.href}"${t.id === id ? ' aria-current="page"' : ''}>${t.label}</a>`).join('');
  const menu = TABS.map(t => `<a style="--c:${t.color}" href="${t.href}">${t.label}</a>`).join('');
  let html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${site.url}/assets/img/jarrod.jpg">
<meta name="theme-color" content="#FFFFFF">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/assets/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preload" href="/assets/fonts/fraunces.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/inter-tight.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/site.css?v=${V.css}">
<script>try{if(!sessionStorage.getItem('entered:'+location.pathname)&&!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.className='enter'}catch(e){}</script>
</head>
<body style="--pc:${cur.color}" data-hd="${HD_STYLE}" data-bc="${BADGE_COLOR}">
<a class="skip" href="#main">Skip to content</a>
<div class="wrap">
  <a class="brand" href="/">${esc(site.url.replace('https://', ''))}</a>
  <nav class="tabs" aria-label="Pages">${tabs}</nav>
  <div class="mnav"><button type="button" id="mbtn" style="--c:${cur.color}" aria-expanded="false" aria-controls="menu">${cur.label} ▾</button><div class="menu" id="menu" hidden>${menu}</div></div>
  <main class="panel" id="main">
${body}
  </main>
  <footer><span>© ${new Date().getFullYear()} ${esc(site.name)}</span><button type="button" class="klink" id="kbtn" aria-haspopup="dialog">keyboard shortcuts</button><span>Last updated ${UPDATED}</span></footer>
</div>
${keysDialog}
<script src="/assets/js/site.js?v=${V.js}" defer></script>${analyticsTag}
</body>
</html>
`;
  if (LOCAL) {
    const up = '../'.repeat(file.split('/').length - 1) || './';
    html = html.replace(/(href|src)="\/([^"]*)"/g, (m, a, p) => `${a}="${up}${p === '' || p.endsWith('/') ? p + 'index.html' : p}"`);
  }
  const out = path.join(OUT, file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
}

/* ---------- home: badge on a lanyard ---------- */
const LANYARD = `<svg viewBox="0 0 200 100" aria-hidden="true"><defs><path id="la" d="M31 0L96 66"/><path id="lb" d="M104 66L169 0"/></defs><polygon points="180,0 154,0 90,70 110,70" fill="#15181F"/><polygon points="20,0 46,0 110,70 90,70" fill="#15181F"/><g font-family="JetBrains Mono,monospace" font-size="7.6" fill="#fff" letter-spacing=".6"><text dy="2.7"><textPath href="#la" startOffset="9">psychophyshicks</textPath></text><text dy="2.7"><textPath href="#lb" startOffset="9">psychophyshicks</textPath></text></g><rect x="91" y="66" width="18" height="30" rx="4" fill="#15181F"/><rect x="88" y="74" width="24" height="8" rx="2.5" fill="#C9CED8" stroke="#121826" stroke-width="3"/><path d="M96 84v10M104 84v10" stroke="#fff" stroke-width="1.5" stroke-dasharray="2 3" opacity=".7"/></svg>`;

const EMAIL_ENC = Buffer.from(site.email).toString('base64'); // the address is never written into the page as plain text (a script decodes it when you click the Email sticker)

const homeBody = `    <section>
      <div class="hero">
        <div>
          <p class="eyebrow">${esc(site.name)} · ${esc(site.eyebrow)}</p>
          <h1>${esc(site.tagline[0])}<br><span class="hl">${esc(site.tagline[1])}</span><button type="button" class="dot" aria-label="Change the color of the period">.</button></h1>
          <p class="sub">${rich(site.intro)}</p>
        </div>
        <div class="pwrap">
          <div class="p-lan">${LANYARD}<div class="p-badge"><img src="/assets/img/jarrod.jpg" width="800" height="800" alt="Jarrod Hicks smiling, wearing glasses and a black t-shirt"><b>${esc(site.name)}</b><span>${esc(site.eyebrow)}</span><i></i></div></div>
        </div>
      </div>
    </section>`;

/* ---------- about ---------- */
/* the sticker on each Path entry shows the end year: "2017 – 2025" gives 2025, and "2025 – now" gives now */
const endLabel = when => { const parts = String(when).split(/\s*[–—-]\s*/).filter(Boolean); const last = parts[parts.length - 1] || ''; return /^\d{4}$/.test(last) ? last : 'now'; };
const aboutBody = `    <section>
      <div class="abt">
        <div>
          ${head('About', LEDES.about)}
${site.about.map(p => `          <p>${rich(p)}</p>`).join('\n')}
        </div>
        <div>
          <ol class="tl">
${timeline.map((t, i) => `            <li style="--c:${RAINBOW[i % RAINBOW.length]}"><span class="dt">${esc(endLabel(t.when))}</span><div><b>${esc(t.title)}</b><span class="w">${esc(t.where)}</span><span class="rng">${esc(t.when)}</span></div></li>`).join('\n')}
          </ol>
        </div>
      </div>
    </section>`;

/* ---------- citations: BibTeX and a plain-text reference, built from the paper data ---------- */
const STOP = new Set(['a', 'an', 'the', 'of', 'on', 'in', 'and', 'for', 'to', 'with', 'how', 'is', 'are']);
const ascii = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
const splitName = a => { const t = a.trim().split(/\s+/); return { last: t[t.length - 1], first: t.slice(0, -1).join(' ') }; };
const bibKinds = p => /thesis/i.test(p.venue) ? 'phdthesis' : /conference|symposium|workshop|meeting|\bCCN\b/i.test(p.venue) ? 'inproceedings' : 'article';
const bibEsc = s => String(s).replace(/([&%$#_])/g, '\\$1');
const usedKeys = new Set();
function bibtex(p) {
  if (p.bibraw) return p.bibraw;
  const kind = p.bibtype || bibKinds(p), d = p.details || {}, l = p.links || {};
  const first = splitName(p.authors[0]).last;
  const word = (p.title.toLowerCase().match(/[a-z0-9]+/g) || []).find(w => !STOP.has(w)) || 'paper';
  let key = ascii(first) + p.year + word, k = key, i = 0;
  while (usedKeys.has(k)) k = key + String.fromCharCode(97 + i++);
  usedKeys.add(k);
  const f = [['author', p.authors.map(a => { const n = splitName(a); return n.first ? `${n.last}, ${n.first}` : n.last; }).join(' and ')], ['title', '{' + bibEsc(p.title) + '}']];
  if (kind === 'article') f.push(['journal', bibEsc(p.venue)]);
  else if (kind === 'inproceedings') f.push(['booktitle', bibEsc(p.venue)]);
  else f.push(['school', bibEsc(p.venue.replace(/^PhD thesis,\s*/i, ''))]);
  f.push(['year', p.year]);
  if (d.volume && kind === 'article') f.push(['volume', d.volume]);
  if (d.issue && kind === 'article') f.push(['number', d.issue]);
  if (d.pages) f.push(['pages', String(d.pages).replace(/[–—]/g, '--')]);
  if (l.doi) f.push(['doi', l.doi]);
  return `@${kind}{${k},\n${f.map(([n, v]) => `  ${n} = {${v}}`).join(',\n')}\n}`;
}
function citation(p) {
  const kind = p.bibtype || bibKinds(p), d = p.details || {}, l = p.links || {};
  const names = p.authors.map(a => { const n = splitName(a); const ini = n.first ? initials(n.first) : ''; return ini ? `${n.last}, ${ini}` : n.last; });
  const au = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + (names.length > 2 ? ',' : '') + ' & ' + names[names.length - 1];
  let s = `${au} (${p.year}). ${p.title.replace(/[.?!]$/, '')}. `;
  if (kind === 'phdthesis') s += `[Doctoral dissertation, ${p.venue.replace(/^PhD thesis,\s*/i, '')}]. `;
  else if (kind === 'inproceedings') s += `In ${p.venue}. `;
  else s += `${p.venue}` + (d.volume ? `, ${d.volume}` : '') + (d.issue ? `(${d.issue})` : '') + (d.pages ? `, ${d.pages}` : '') + '. ';
  if (kind === 'inproceedings' && d.pages) s = s.trimEnd() + ` ${d.pages}. `;
  if (l.doi) s += `https://doi.org/${l.doi}`;
  return s.trim();
}

/* ---------- papers ---------- */
/* only topics that some paper or presentation really uses are shown, each page with its own list. Colors go to the used
   topics in A-Z order, so the same topic has the same color on every page. */
const paperTopicSet = new Set(papers.flatMap(p => p.topics)), presTopicSet = new Set(talks.flatMap(t => t.topics || []));
const topics = topicIds.filter(id => paperTopicSet.has(id) || presTopicSet.has(id)).map((id, i) => ({ id, color: TOPIC_COLORS[i % 7] }));
const byName = (a, c) => a.localeCompare(c);
const topicColor = id => (topics.find(t => t.id === id) || { color: '#cccccc' }).color;
const years = [...new Set(papers.map(p => p.year))].sort((a, b) => b - a);
const lastOf = a => a.trim().split(/\s+/).pop().toLowerCase();
const isMe = a => lastOf(a) === lastOf(site.me) && a.trim().charAt(0).toLowerCase() === site.me.trim().charAt(0).toLowerCase(); /* "J. M. Hicks" and "Jarrod M. Hicks" both match */
function authorsHTML(p) { return p.authors.map((a, i) => (isMe(a) ? `<b>${esc(a)}</b>` : esc(a)) + (i < (p.equal || 0) ? '<sup class="eq">*</sup>' : '')).join(', '); }
/* "new" sticker: shown on a paper that has no citation badge yet and is recent.
   With a month (month = {oct} in the .bib, or "month": 10 in a JSON file) it means published within the last 7 months.
   With only a year it means "this calendar year". Override either way with  new = {true}  or  new = {false}  (JSON: "new": true / false). */
function isNewPaper(p) {
  if (p.new === true || p.new === false) return p.new;
  if (p.month) { const days = (new Date(TODAY) - new Date(Date.UTC(p.year, p.month - 1, 1))) / 864e5; return days >= -31 && days <= 215; }
  return p.year === +TODAY.slice(0, 4);
}
function paperHTML(p) {
  const d = p.details || {};
  const vol = [d.volume && 'vol. ' + d.volume, d.pages].filter(Boolean).join(', ');
  const l = p.links || {};
  const ext = u => `href="${esc(u)}" target="_blank" rel="noopener"`;
  /* one quiet line: doi, then whatever links exist */
  const quiet = [l.doi && `<span>doi: <a data-k="doi" ${ext('https://doi.org/' + l.doi)}>${esc(l.doi)}</a></span>`, l.pdf && `<a data-k="pdf" ${ext(l.pdf)}>PDF</a>`, l.code && `<a data-k="code" ${ext(l.code)}>code</a>`, l.data && `<a data-k="data" ${ext(l.data)}>data</a>`].filter(Boolean).join('<i>·</i>');
  const tagsHTML = [...p.topics].sort(byName).map(t => `<span class="tag t" style="--c:${topicColor(t)}">${esc(t)}</span>`).join('');
  const badge = p.citations > 0 ? `<div class="cbadge" title="${p.citations} citations"><b>${p.citations}</b><span>cited</span></div>`
    : isNewPaper(p) ? `<div class="cbadge fmt new" title="recent paper, no citations yet">new</div>` : '';
  const text = [p.title, p.authors.join(' '), p.venue, p.year].join(' ').toLowerCase();
  const bib = bibtex(p), cite = citation(p);
  return `      <article class="paper${badge ? ' hc' : ''}" data-cites="${p.citations || 0}" style="--tc:${topicColor([...p.topics].sort(byName)[0])}" data-year="${p.year}" data-topics="${esc(p.topics.join('|'))}" data-text="${esc(text)}">
        ${badge}<span class="yrm">${p.year}</span>
        <h3>${esc(p.title)}</h3>
        <p class="meta"><span class="au">${authorsHTML(p)}${p.equal ? '<span class="eqn">* denotes equal contribution</span>' : ''}</span><span class="vb"><span class="ven">${esc(p.venue)}</span>${vol ? `<span class="loc">${esc(vol)}</span>` : ''}</span></p>${quiet ? `\n        <p class="ql">${quiet}</p>` : ''}
        <div class="pb"><div class="pl">${tagsHTML}</div><button type="button" class="tag cite-btn" aria-expanded="false">cite</button></div>
        <div class="cw"><div class="cwi"><div class="cite"><pre>${esc(bib)}</pre><div class="cite-actions"><button type="button" class="tag" data-copy="${esc(bib)}">copy BibTeX</button><button type="button" class="tag" data-copy="${esc(cite)}">copy citation</button></div></div></div></div>
      </article>`;
}
const chipRow = (g, items) => `<button type="button" class="chip all" data-g="${g}" data-v="" aria-pressed="true">all</button>` + items.map(t => `<button type="button" class="chip" data-g="${g}" data-v="${esc(t.id)}" style="--c:${t.color}" aria-pressed="false">${esc(t.id)}</button>`).join('');
const personKey = a => lastOf(a) + '|' + a.trim().charAt(0).toLowerCase();
function paperStats() {
  const have = totalCites > 0, n = papers.length, cs = papers.map(p => p.citations || 0), dash = x => have ? x : '–';
  const pageCount = p => { const m = /(\d+)\s*[–—-]\s*(\d+)/.exec(String((p.details || {}).pages || '')); return m ? Math.max(0, +m[2] - +m[1] + 1) : (+(p.details || {}).numpages || 0); };
  const isJournal = p => (p.bibtype || bibKinds(p)) === 'article' && p.status !== 'preprint' && !/arxiv|biorxiv|preprint/i.test(p.venue);
  const uniq = a => new Set(a).size, has = k => papers.filter(p => (p.links || {})[k]).length;
  const years = n ? Math.max(...papers.map(p => p.year)) - Math.min(...papers.map(p => p.year)) + 1 : 0;
  const v = {
    papers: n,
    citations: dash(totalCites.toLocaleString('en-US')),
    'h-index': dash(hIndex),
    'i10-index': have ? cs.filter(c => c >= 10).length : null,
    'most cited': dash(Math.max(0, ...cs)),
    'cites per paper': have ? (totalCites / n).toFixed(1) : null,
    'co-authors': uniq(papers.flatMap(p => p.authors.filter(a => !isMe(a)).map(personKey))),
    journals: uniq(papers.filter(isJournal).map(p => p.venue.trim().toLowerCase())),
    pages: papers.reduce((s, p) => s + pageCount(p), 0) || null,
    venues: uniq(papers.map(p => p.venue.trim().toLowerCase())),
    topics: uniq(papers.flatMap(p => p.topics)),
    'first author': papers.filter(p => isMe(p.authors[0])).length,
    'solo papers': papers.filter(p => p.authors.length === 1).length || null,
    'authors per paper': n ? (papers.reduce((s, p) => s + p.authors.length, 0) / n).toFixed(1) : null,
    'biggest team': n ? Math.max(...papers.map(p => p.authors.length)) : null,
    'with code': has('code') || null, 'with data': has('data') || null, 'with PDF': has('pdf') || null,
    'years active': years || null,
    'papers per year': years ? (n / years).toFixed(1) : null,
    'title words': papers.reduce((s, p) => s + p.title.split(/\s+/).length, 0),
    'titles with a colon': papers.filter(p => p.title.includes(':')).length || null
  };
  return PAPER_STATS.filter(k => v[k] !== null && v[k] !== undefined).map((k, i) => statBadge(v[k], k, i)).join('');
}
const papersBody = `    <section>
      ${head('Papers', LEDES.papers, paperStats())}
      <div class="sbox"><input type="search" id="q" placeholder="search titles, authors, venues" aria-label="Search papers" aria-keyshortcuts="/" autocomplete="off"><kbd aria-hidden="true">/</kbd></div>
      <p class="shint">Press <kbd>/</kbd> to search, <kbd>Esc</kbd> to clear, and <kbd>?</kbd> for more keyboard shortcuts.</p>
      <div class="filters">
        <div class="frow"><span class="flab">Topics</span>${chipRow('topic', topics.filter(t => paperTopicSet.has(t.id)))}</div>
        <div class="frow"><span class="flab">Year</span><div class="dd"><button type="button" class="ddb" id="yb" aria-haspopup="listbox" aria-expanded="false"><span>all</span><span aria-hidden="true">▾</span></button><ul class="ddl" id="yl" role="listbox" hidden><li><button type="button" role="option" data-year="" aria-selected="true">all</button></li>${years.map(y => `<li><button type="button" role="option" data-year="${y}" aria-selected="false">${y}</button></li>`).join('')}</ul></div></div>
        ${totalCites ? `<div class="frow"><span class="flab">Sort</span><button type="button" class="chip all" data-g="sort" data-v="year" aria-pressed="true">most recent</button><button type="button" class="chip all" data-g="sort" data-v="cites" aria-pressed="false">most cited</button></div>` : ''}
      </div>
      <div class="count" id="cnt">${papers.length} of ${papers.length} papers</div>
      <div id="plist">
${papers.map(paperHTML).join('\n')}
      </div>
      <p class="count" id="none" hidden>No papers match.</p>
    </section>`;

/* ---------- presentations ---------- */
function presHTML(t) {
  const [y, m] = t.date.split('-');
  const l = t.links || {}, up = isUpcoming(t), authors = t.authors && t.authors.length ? t.authors : [site.me], tps = [...(t.topics || [])].sort(byName);
  const quiet = LINK_KEYS.filter(k => l[k]).map(k => `<a data-k="${k}" href="${esc(l[k])}" target="_blank" rel="noopener">${LINK_LABEL[k] || k}</a>`).join('<i>·</i>');
  const tagsHTML = tps.map(x => `<span class="tag t" style="--c:${topicColor(x)}">${esc(x)}</span>`).join('');
  const text = [t.title, authors.join(' '), t.venue, t.city, t.type, y, tps.join(' ')].filter(Boolean).join(' ').toLowerCase();
  return `        <article class="paper hc" data-year="${y}" data-upcoming="${up ? 1 : 0}" data-type="${esc(t.type)}" data-topics="${esc(tps.join('|'))}" data-text="${esc(text)}">
          <div class="cbadge fmt" style="--bcol:${PRES_COLOR[t.type]}" title="${esc(t.type)}">${esc(t.type)}</div>
          <span class="yrm">${MON[+m - 1]} ${y}</span>
          <h3>${esc(t.title)}</h3>
          <p class="meta"><span class="au">${authors.map(a => isMe(a) ? `<b>${esc(a)}</b>` : esc(a)).join(', ')}</span><span class="vb"><span class="ven">${esc(t.venue)}</span>${t.city ? `<span class="loc">${esc(t.city)}</span>` : ''}</span></p>${quiet ? `\n          <p class="ql">${quiet}</p>` : ''}${tagsHTML ? `\n          <div class="pl">${tagsHTML}</div>` : ''}
        </article>`;
}
/* the stats count only what has already happened */
const given = talks.filter(t => !isUpcoming(t));
const nTalks = given.filter(t => t.type === 'talk').length;
const nPosters = given.filter(t => t.type === 'poster').length;
const nConfs = given.filter(t => t.conference !== false).length;
const cityCount = new Set(given.map(t => (t.city || '').trim().toLowerCase()).filter(c => c && !c.startsWith('['))).size;
const pastTalks = talks.filter(t => !isUpcoming(t)), soonTalks = talks.filter(isUpcoming).sort((a, c) => String(a.date).localeCompare(String(c.date)));
const presYears = [...new Set(pastTalks.map(t => t.date.slice(0, 4)))].sort((a, b) => b - a);
const presGroups = [
  ...(soonTalks.length ? [`      <section class="ygrp soon" data-year="upcoming"><h2><span>upcoming</span><i>${soonTalks.length}</i></h2><div>\n${soonTalks.map(presHTML).join('\n')}\n      </div></section>`] : []),
  ...presYears.map(y => {
    const items = pastTalks.filter(t => t.date.startsWith(y));
    return `      <section class="ygrp" data-year="${y}"><h2><span>${y}</span><i>${items.length}</i></h2><div>\n${items.map(presHTML).join('\n')}\n      </div></section>`;
  })
].join('\n');
const presTopics = topics.map(t => t.id).filter(id => presTopicSet.has(id));
const nUpcoming = talks.filter(isUpcoming).length;
function presStats() {
  const uniq = a => new Set(a.filter(Boolean)).size, n = given.length;
  const hasL = k => given.filter(t => t.links && t.links[k]).length;
  const yrs = given.map(t => +String(t.date).slice(0, 4));
  const span = n ? Math.max(...yrs) - Math.min(...yrs) + 1 : 0;
  const next = talks.filter(isUpcoming).map(t => String(t.date).length > 7 ? String(t.date) : t.date + '-01').sort()[0];
  const daysToNext = next ? Math.max(0, Math.ceil((new Date(next) - new Date(TODAY)) / 864e5)) : null;
  const endOf = d => { d = String(d); if (d.length > 7) return d; const [y, m] = d.split('-').map(Number); return d + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0'); };
  const lastGiven = n ? Math.max(0, Math.floor((new Date(TODAY) - new Date(given.map(t => endOf(t.date)).sort().pop())) / 864e5)) : null;
  const perYear = {}; yrs.forEach(y => { perYear[y] = (perYear[y] || 0) + 1; });
  const bestYear = n ? Object.keys(perYear).sort((a, b) => perYear[b] - perYear[a] || b - a)[0] : null;
  const v = {
    total: talks.length, talks: nTalks, posters: nPosters, conferences: nConfs, cities: cityCount || '–',
    countries: uniq(given.map(t => t.country && t.country.trim().toLowerCase())) || null,
    upcoming: nUpcoming, 'days to next': daysToNext, 'days since': lastGiven,
    'on video': hasL('video'), 'with slides': hasL('slides') || null, demos: hasL('demo') || null,
    venues: uniq(given.map(t => t.venue.trim().toLowerCase())),
    topics: uniq(given.flatMap(t => t.topics || [])) || null,
    'first author': given.some(t => t.authors) ? given.filter(t => t.authors && isMe(t.authors[0])).length : null,
    'co-presenters': given.some(t => t.authors) ? uniq(given.flatMap(t => (t.authors || []).filter(a => !isMe(a)).map(personKey))) : null,
    'years active': span || null, 'per year': span ? (n / span).toFixed(1) : null, 'best year': bestYear
  };
  return PRES_STATS.filter(k => v[k] !== null && v[k] !== undefined).map((k, i) => statBadge(v[k], k, i)).join('');
}
const presentationsBody = `    <section>
      ${head('Presentations', LEDES.presentations, presStats())}
      <div class="sbox"><input type="search" id="q" placeholder="search titles, venues, cities" aria-label="Search presentations" aria-keyshortcuts="/" autocomplete="off"><kbd aria-hidden="true">/</kbd></div>
      <p class="shint">Press <kbd>/</kbd> to search, <kbd>Esc</kbd> to clear, and <kbd>?</kbd> for more keyboard shortcuts.</p>
      <div class="filters">
${presTopics.length ? `        <div class="frow"><span class="flab">Topics</span>${chipRow('topic', presTopics.map(id => ({ id, color: topicColor(id) })))}</div>\n` : ''}        <div class="frow"><span class="flab">Format</span>${chipRow('type', PRES_TYPES.map(id => ({ id, color: PRES_COLOR[id] })))}</div>
        <div class="frow"><span class="flab">Year</span><div class="dd"><button type="button" class="ddb" id="yb" aria-haspopup="listbox" aria-expanded="false"><span>all</span><span aria-hidden="true">▾</span></button><ul class="ddl" id="yl" role="listbox" hidden><li><button type="button" role="option" data-year="" aria-selected="true">all</button></li>${nUpcoming ? '<li><button type="button" role="option" data-year="upcoming" aria-selected="false">upcoming</button></li>' : ''}${presYears.map(y => `<li><button type="button" role="option" data-year="${y}" aria-selected="false">${y}</button></li>`).join('')}</ul></div></div>
      </div>
      <div class="count" id="cnt" data-unit="presentations">${talks.length} of ${talks.length} presentations</div>
      <div id="tlist">
${presGroups}
      </div>
      <p class="count" id="none" hidden>No presentations match.</p>
    </section>`;

/* ---------- lately ---------- */
const latelyBody = `    <section>
      ${head('Lately', LEDES.lately)}
      <ul class="rows" id="lately">
${lately.map((c, i) => {
  const n = c.items.length;
  const cls = n <= 1 ? 'one' : n === 2 ? 'two' : '';
  /* every card stays in the layout (the unseen ones are only invisible), so the row is as tall as its tallest card and nothing below ever jumps */
  const cards = c.items.map((t, k) => `<div class="card${k ? ' off' : ''}">${rich(t)}</div>`).join('');
  const nav = n > 1 ? `<div class="nav" hidden><button type="button" class="kb" data-d="1" aria-label="Go back in time">${AR('l')}</button><button type="button" class="kb" data-d="-1" aria-label="Go forward in time" disabled>${AR('r')}</button><span class="pos" aria-live="polite">now · 1 of ${n}</span><span class="ud">${K('u', 'd').replace(/ <span class="or">or<\/span> /, '')} rows</span></div>` : '';
  return `        <li class="row" style="--c:${RAINBOW[i % RAINBOW.length]}"><span class="lg">${esc(c.label)}</span><div class="tx"><div class="stk ${cls}">${cards}</div>${nav}</div></li>`;
}).join('\n')}
      </ul>
    </section>`;

/* ---------- consulting: sticker cards ---------- */
const SV = (inner, vb) => `<svg viewBox="${vb || '0 0 24 24'}" aria-hidden="true">${inner}</svg>`;
const CICON = {
  check: SV('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M7.8 10.7l2.1 2.1 3.8-4.2"/><path d="M15.5 15.5 21 21"/>'),
  explain: SV('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 15.5h4"/>'),
  teach: SV('<path d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path d="M6.5 11.8v4.2c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6v-4.2"/><path d="M21.5 9.5V15"/>'),
  demo: SV('<path d="M2 12s3.7-6.5 10-6.5S22 12 22 12s-3.7 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>'),
  test: SV('<path d="M9 3h6M10 3v6l-5.4 9.4A1.6 1.6 0 0 0 6 21h12a1.6 1.6 0 0 0 1.4-2.6L14 9V3"/><path d="M7.4 15h9.2"/>'),
  guest: SV('<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.8 3.7-5.6 7-5.6s6.2 1.8 7 5.6"/>'),
  sources: SV('<path d="M3 5.5c3-1.3 6-1.3 9 .8 3-2.1 6-2.1 9-.8V19c-3-1.3-6-1.3-9 .8-3-2.1-6-2.1-9-.8z"/><path d="M12 6.3v13.5"/>')
};
/* checked here, once the icon list exists */
(consulting.cards || []).forEach((c, i) => {
  ['label', 'title', 'text'].forEach(f => need(`data/consulting.json[${i}]`, c, f));
  need(`data/consulting.json[${i}]`, c, 'icon', v => Object.keys(CICON).includes(v), 'one of: ' + Object.keys(CICON).join(', '));
});
const TILT = [-8, 7, -6, 8, -7, 6, -8];
const consultingBody = `    <section>
      ${head('Consulting', LEDES.consulting)}
      <div class="svcs">
${consulting.cards.map((c, i) => `        <div class="svc" style="--c:${RAINBOW[i % RAINBOW.length]}"><div class="sk" style="--r:${TILT[i % TILT.length]}deg">${CICON[c.icon] || ''}${esc(c.label)}</div><div class="cb"><h3>${esc(c.title)}</h3><p>${rich(c.text)}</p>${c.example ? `<div class="eg">${rich(c.example)}</div>` : ''}</div></div>`).join('\n')}
      </div>
    </section>`;

/* ---------- contact: colored stickers ---------- */
/* glyphs are black and drawn to the same visual size; the three brand logos use the official paths (simple-icons, CC0) */
const ICON = {
  mail: SV('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7.5l8 6 8-6"/>'),
  youtube: SV('<rect x="2.5" y="5" width="19" height="14" rx="4.5"/><path class="f" d="M10.2 9.2l4.6 2.8-4.6 2.8z"/>'),
  instagram: SV('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.9"/><circle class="f" cx="17.1" cy="6.9" r="1"/>'),
  tiktok: SV('<path d="M14 4v10.2a3.6 3.6 0 1 1-3.6-3.6"/><path d="M14 4c.3 2.4 1.9 4 4.4 4.2"/>'),
  bluesky: SV('<path class="f" d="M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037-.856 3.061-3.978 3.842-6.755 3.37 4.854.826 6.089 3.562 3.422 6.299-5.065 5.196-7.28-1.304-7.847-2.97-.104-.305-.152-.448-.153-.327 0-.121-.05.022-.153.327-.568 1.666-2.782 8.166-7.847 2.97-2.667-2.737-1.432-5.473 3.422-6.3-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026"/>'),
  threads: SV('<path class="f" d="M18.263 11.097c-.03-3.486-1.92-5.586-5.111-5.586-2.13 0-3.922.963-4.863 2.499l2.062 1.438c.535-.843 1.272-1.543 2.628-1.543 1.528 0 2.318.85 2.544 2.431a15 15 0 0 0-2.236-.173c-4.125 0-6.068 1.867-6.068 4.336s1.943 3.99 4.804 3.99c3.139 0 5.013-2.115 5.781-4.735.798.361 1.348 1.204 1.348 2.47 0 3.387-3.907 5.232-7.22 5.232-4.885 0-8.077-3.207-8.077-8.424 0-6.392 4.223-10.487 9.9-10.487 3.808 0 5.69 1.671 6.97 3.914l2.108-1.475C21.44 2.078 18.331 0 13.663 0 6.227 0 1.168 5.277 1.168 12.934c0 7 4.953 11.066 10.856 11.066 4.878 0 9.809-2.846 9.809-7.716 0-2.545-1.46-4.231-3.569-5.187m-6.33 4.855c-1.077 0-2.026-.512-2.026-1.453 0-1.483 1.822-1.934 3.606-1.934.678 0 1.34.045 1.927.173-.422 1.927-1.671 3.215-3.508 3.214Z"/>'),
  x: SV('<path class="f" d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"/>'),
  github: SV('<path class="f" d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.7.3 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3"/>'),
  scholar: SV('<path d="M2.5 9.5 12 5l9.5 4.5L12 14z"/><path d="M6.5 11.8v4.2c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6v-4.2"/><path d="M21.5 9.5V15"/>'),
  other: SV('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>')
};
const stickers = links.filter(l => l.url || l.soon);
const contactBody = `    <section>
      ${head('Contact', LEDES.contact)}
      <div class="cst">
        <button type="button" class="cs" id="cs-mail" style="--c:${RAINBOW[0]}" data-mail="${EMAIL_ENC}" aria-label="Email"><span class="gl">${ICON.mail}</span><small>Email</small></button>
${stickers.map((l, i) => {
  const c = RAINBOW[(i + 1) % RAINBOW.length], g = ICON[l.icon] || ICON.other, di = ` data-i="${esc(l.icon || 'other')}"`;
  return l.url
    ? `        <a class="cs" style="--c:${c}"${di} href="${esc(l.url)}" target="_blank" rel="noopener" aria-label="${esc(l.name)}"><span class="gl">${g}</span><small>${esc(l.name)}</small></a>`
    : `        <span class="cs soon" style="--c:${c}"${di} role="img" aria-label="${esc(l.name)}, coming soon"><span class="gl">${g}</span><small>${esc(l.name)}</small></span>`;
}).join('\n')}
      </div>
    </section>`;

/* ---------- 404 ---------- */
const notFoundBody = `    <section class="nf" id="nf">
      <h1>404: page not found.</h1>
      <p>That page is not here. <a href="/">Back to the home page.</a></p>
    </section>`;

/* ---------- write everything ---------- */
if (errors.length) {
  console.error('\nBuild stopped. Please fix these first:\n');
  errors.forEach(e => console.error('  - ' + e));
  console.error('');
  process.exit(1);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(ROOT, 'assets'), path.join(OUT, 'assets'), { recursive: true });
for (const f of ['CNAME', '.nojekyll']) if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

page({ id: 'home', title: site.name, desc: site.description, body: homeBody, file: 'index.html' });
page({ id: 'about', title: 'About', desc: 'About ' + site.name + ': training, research and path.', body: aboutBody, file: 'about/index.html' });
page({ id: 'papers', title: 'Papers', desc: 'Publications by ' + site.name + ', searchable by topic and year.', body: papersBody, file: 'papers/index.html' });
page({ id: 'presentations', title: 'Presentations', desc: 'Talks, posters and demos by ' + site.name + '.', body: presentationsBody, file: 'presentations/index.html' });
page({ id: 'lately', title: 'Lately', desc: 'What ' + site.name + ' has been writing, making, learning and brewing lately.', body: latelyBody, file: 'lately/index.html' });
page({ id: 'consulting', title: 'Consulting', desc: 'Perception science consulting for videos and shows: checking claims, explaining papers, teaching, demos and more.', body: consultingBody, file: 'consulting/index.html' });
page({ id: 'contact', title: 'Contact', desc: 'How to reach ' + site.name + ' by email and on social media.', body: contactBody, file: 'contact/index.html' });
page({ id: '404', title: 'Page not found', desc: 'Page not found.', body: notFoundBody, file: '404.html' });

const urls = ['/', ...TABS.slice(1).map(t => t.href)];
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${site.url}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`);

console.log(`Built ${urls.length + 1} pages: ${papers.length} papers, ${talks.length} presentations, ${lately.length} lately labels.`);
if (warnings.length) { console.log('\nNotes:'); warnings.forEach(w => console.log('  - ' + w)); }
if (placeholders.length) { console.log('\nStill placeholders (set "placeholder": false or delete the file when real):'); placeholders.forEach(p => console.log('  - ' + p)); }
