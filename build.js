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
  if (!fs.existsSync(dir)) { errors.push(`${rel}: folder is missing`); return []; }
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
const topics = readJSON('data/topics.json') || [];
const timeline = readJSON('data/timeline.json') || [];
const lately = readJSON('data/lately.json') || [];
const links = readJSON('data/links.json') || [];
const consulting = readJSON('data/consulting.json') || { cards: [] };
const topicIds = topics.map(t => t.id);

const PRES_TYPES = ['talk', 'poster'];
const PRES_COLOR = { talk: '#4D9BFF', poster: '#FF9F1C' };
const LINK_KEYS = ['slides', 'poster', 'video', 'code', 'data', 'demo'];

const papers = readFolder('data/papers').map(({ file, data }) => {
  need(file, data, 'title', v => typeof v === 'string');
  need(file, data, 'authors', v => Array.isArray(v) && v.length > 0, 'a list of names');
  need(file, data, 'venue', v => typeof v === 'string');
  need(file, data, 'year', v => Number.isInteger(v), 'a number like 2024');
  need(file, data, 'topics', v => Array.isArray(v) && v.length > 0 && v.every(t => topicIds.includes(t)), 'topics must be from data/topics.json: ' + topicIds.join(', '));
  if (data.placeholder) placeholders.push(file);
  return data;
}).sort((a, b) => b.year - a.year || a.title.localeCompare(b.title));

const talks = readFolder('data/presentations').map(({ file, data }) => {
  need(file, data, 'title', v => typeof v === 'string');
  need(file, data, 'type', v => PRES_TYPES.includes(v), 'one of: ' + PRES_TYPES.join(', '));
  need(file, data, 'venue', v => typeof v === 'string');
  need(file, data, 'date', v => /^\d{4}-\d{2}(-\d{2})?$/.test(v), 'like 2026-11 or 2026-11-02');
  if (data.placeholder) placeholders.push(file);
  return data;
}).sort((a, b) => String(b.date).localeCompare(String(a.date)));

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
links.forEach(l => { if (!l.url) warnings.push(`data/links.json: "${l.name}" has no url yet, so it is left off the Contact page`); });

/* ---------- shared pieces ---------- */
const TABS = [
  { id: 'home', label: 'Home', color: '#FF5A4A', href: '/' },
  { id: 'about', label: 'About', color: '#FF9F1C', href: '/about/' },
  { id: 'papers', label: 'Papers', color: '#FFD43B', href: '/papers/' },
  { id: 'presentations', label: 'Presentations', color: '#4CD07D', href: '/presentations/' },
  { id: 'lately', label: 'Lately', color: '#4D9BFF', href: '/lately/' },
  { id: 'consulting', label: 'Consulting', color: '#B08CFF', href: '/consulting/' },
  { id: 'contact', label: 'Contact', color: '#FF7EB6', href: '/contact/' }
];
const RAINBOW = TABS.map(t => t.color);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const head = (title, lede) => `<div class="phead"><h1><span>${esc(title)}</span></h1>${lede ? `<p>${rich(lede)}</p>` : ''}</div>`;

const an = site.analytics || {};
if (an.goatcounter && !/^[a-z0-9-]+$/i.test(an.goatcounter)) errors.push('data/site.json: analytics.goatcounter should be just your GoatCounter code, like "jarrodhicks"');
const analyticsTag = LOCAL ? '' :
  (an.goatcounter ? `\n<script data-goatcounter="https://${an.goatcounter}.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>` : '') +
  (an.cloudflare ? `\n<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${esc(an.cloudflare)}"}'></script>` : '');

function page({ id, title, desc, body, file }) {
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
<link rel="preload" href="/assets/fonts/fraunces.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/inter-tight.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/site.css">
</head>
<body style="--pc:${cur.color}">
<a class="skip" href="#main">Skip to content</a>
<div class="wrap">
  <a class="brand" href="/">${esc(site.url.replace('https://', ''))}</a>
  <nav class="tabs" aria-label="Pages">${tabs}</nav>
  <div class="mnav"><button type="button" id="mbtn" style="--c:${cur.color}" aria-expanded="false" aria-controls="menu">${cur.label} ▾</button><div class="menu" id="menu" hidden>${menu}</div></div>
  <main class="panel" id="main">
${body}
  </main>
  <footer><span>© ${new Date().getFullYear()} ${esc(site.name)}</span><span>Last updated ${UPDATED}</span></footer>
</div>
<script src="/assets/js/site.js" defer></script>${analyticsTag}
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

const EMAIL_ENC = Buffer.from(site.email).toString('base64'); // the address is never written into the page as plain text

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
const aboutBody = `    <section>
      <div class="abt">
        <div>
          ${head('About', site.ledes.about)}
${site.about.map(p => `          <p>${rich(p)}</p>`).join('\n')}
        </div>
        <div>
          <h4>Path</h4>
          <ol class="tl">
${timeline.map((t, i) => `            <li style="--c:${RAINBOW[i % RAINBOW.length]}"><span class="when">${esc(t.when)}</span><b>${esc(t.title)}</b><span class="w">${esc(t.where)}</span></li>`).join('\n')}
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
  const names = p.authors.map(a => { const n = splitName(a); const ini = n.first.split(/\s+/).filter(Boolean).join(' '); return ini ? `${n.last}, ${ini}` : n.last; });
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
const topicColor = id => (topics.find(t => t.id === id) || { color: '#cccccc' }).color;
const years = [...new Set(papers.map(p => p.year))].sort((a, b) => b - a);
function authorsHTML(p) { return p.authors.map(a => a === site.me ? `<b>${esc(a)}</b>` : esc(a)).join(', '); }
function paperHTML(p) {
  const d = p.details || {};
  const vol = [d.volume && 'vol. ' + d.volume, d.pages].filter(Boolean).join(', ');
  const l = p.links || {};
  const tags = p.topics.map(t => `<span class="tag t" style="--c:${topicColor(t)}">${esc(t)}</span>`).join('') +
    (typeof p.citations === 'number' ? `<span class="tag">cited by ${p.citations}</span>` : '') +
    (l.doi ? `<a class="tag" href="https://doi.org/${esc(l.doi)}" target="_blank" rel="noopener">DOI ↗</a>` : '') +
    (l.pdf ? `<a class="tag" href="${esc(l.pdf)}">PDF ↗</a>` : '') +
    (l.code ? `<a class="tag" href="${esc(l.code)}" target="_blank" rel="noopener">code ↗</a>` : '') +
    (l.data ? `<a class="tag" href="${esc(l.data)}" target="_blank" rel="noopener">data ↗</a>` : '');
  const text = [p.title, p.authors.join(' '), p.venue, p.year].join(' ').toLowerCase();
  const bib = bibtex(p), cite = citation(p);
  return `      <article class="paper" data-year="${p.year}" data-topics="${esc(p.topics.join('|'))}" data-text="${esc(text)}">
        <span class="yrm">${p.year}</span>
        <h3>${esc(p.title)}</h3>
        <p class="meta">${authorsHTML(p)}<br>${esc(p.venue)}${vol ? ', ' + esc(vol) : ''}</p>
        <div class="pl">${tags}<button type="button" class="tag cite-btn" aria-expanded="false">cite</button></div>
        <div class="cite" hidden><pre>${esc(bib)}</pre><div class="cite-actions"><button type="button" class="tag" data-copy="${esc(bib)}">copy BibTeX</button><button type="button" class="tag" data-copy="${esc(cite)}">copy citation</button></div></div>
      </article>`;
}
const papersBody = `    <section>
      ${head('Papers', site.ledes.papers)}
      <input type="search" id="q" placeholder="search titles, authors, venues" aria-label="Search papers">
      <div class="filters">
        <div class="frow"><span class="flab">Topics</span><button type="button" class="chip all" data-topic="" aria-pressed="true">all</button>${topics.map(t => `<button type="button" class="chip" data-topic="${esc(t.id)}" style="--c:${t.color};--d:${t.dark || t.color}" aria-pressed="false">${esc(t.id)}</button>`).join('')}</div>
        <div class="frow"><span class="flab">Year</span><div class="dd"><button type="button" class="ddb" id="yb" aria-haspopup="listbox" aria-expanded="false"><span>all</span><span aria-hidden="true">▾</span></button><ul class="ddl" id="yl" role="listbox" hidden><li><button type="button" role="option" data-year="" aria-selected="true">all</button></li>${years.map(y => `<li><button type="button" role="option" data-year="${y}" aria-selected="false">${y}</button></li>`).join('')}</ul></div></div>
      </div>
      <div class="count" id="cnt">${papers.length} of ${papers.length} papers</div>
      <div id="plist">
${papers.map(paperHTML).join('\n')}
      </div>
      <p class="count" id="none" hidden>No papers match.</p>
    </section>`;

/* ---------- presentations ---------- */
function ticketHTML(t) {
  const [y, m] = t.date.split('-');
  const l = t.links || {};
  const lk = LINK_KEYS.filter(k => l[k]).map(k => `<a class="in" href="${esc(l[k])}" target="_blank" rel="noopener">${k}</a>`).join('');
  const text = [t.title, t.venue, t.city, t.type, y].filter(Boolean).join(' ').toLowerCase();
  return `        <article class="tk" data-year="${y}" data-topics="${esc(t.type)}" data-text="${esc(text)}"><div class="s"><i>${MON[+m - 1]}</i><b>${y}</b></div><div class="m"><span class="tag t" style="--c:${PRES_COLOR[t.type]}">${esc(t.type)}</span><h3>${esc(t.title)}</h3><p>${esc(t.venue)}${t.city ? ' · ' + esc(t.city) : ''}</p><div class="lk">${lk}</div></div></article>`;
}
const nTalks = talks.filter(t => t.type === 'talk').length;
const nPosters = talks.filter(t => t.type === 'poster').length;
const nConfs = talks.filter(t => t.conference !== false).length;
const cityCount = new Set(talks.map(t => (t.city || '').trim().toLowerCase()).filter(c => c && !c.startsWith('['))).size;
const presYears = [...new Set(talks.map(t => t.date.slice(0, 4)))].sort((a, b) => b - a);
const presGroups = presYears.map(y => {
  const items = talks.filter(t => t.date.startsWith(y));
  return `      <section class="ygrp" data-year="${y}"><h2><span>${y}</span><i>${items.length}</i></h2><div class="tix">\n${items.map(ticketHTML).join('\n')}\n      </div></section>`;
}).join('\n');
const presentationsBody = `    <section>
      ${head('Presentations', site.ledes.presentations)}
      <div class="stats"><div class="stat"><b>${nTalks}</b><span>talks</span></div><div class="stat"><b>${nPosters}</b><span>posters</span></div><div class="stat"><b>${nConfs}</b><span>conferences</span></div><div class="stat"><b>${cityCount || '–'}</b><span>cities</span></div></div>
      <input type="search" id="q" placeholder="search titles, venues, cities" aria-label="Search presentations">
      <div class="filters">
        <div class="frow"><span class="flab">Type</span><button type="button" class="chip all" data-topic="" aria-pressed="true">all</button>${PRES_TYPES.map(t => `<button type="button" class="chip" data-topic="${t}" style="--c:${PRES_COLOR[t]};--d:${PRES_COLOR[t]}" aria-pressed="false">${t}</button>`).join('')}</div>
        <div class="frow"><span class="flab">Year</span><div class="dd"><button type="button" class="ddb" id="yb" aria-haspopup="listbox" aria-expanded="false"><span>all</span><span aria-hidden="true">▾</span></button><ul class="ddl" id="yl" role="listbox" hidden><li><button type="button" role="option" data-year="" aria-selected="true">all</button></li>${presYears.map(y => `<li><button type="button" role="option" data-year="${y}" aria-selected="false">${y}</button></li>`).join('')}</ul></div></div>
      </div>
      <div class="count" id="cnt" data-unit="presentations">${talks.length} of ${talks.length} presentations</div>
      <div id="tlist">
${presGroups}
      </div>
      <p class="count" id="none" hidden>No presentations match.</p>
    </section>`;

/* ---------- lately ---------- */
const latelyBody = `    <section>
      ${head('Lately', site.ledes.lately)}
      <ul class="rows" id="lately">
${lately.map((c, i) => {
  const n = c.items.length;
  const cls = n <= 1 ? 'one' : n === 2 ? 'two' : '';
  const cards = c.items.map((t, k) => `<div class="card"${k ? ' hidden' : ''}>${rich(t)}</div>`).join('');
  const nav = n > 1 ? `<div class="nav" hidden><button type="button" data-d="1" aria-label="Go back in time">‹</button><button type="button" data-d="-1" aria-label="Go forward in time" disabled>›</button><span class="pos" aria-live="polite">now · 1 of ${n}</span></div>` : '';
  return `        <li class="row" style="--c:${RAINBOW[i % RAINBOW.length]}"><span class="lg">${esc(c.label)}</span><div class="tx"><div class="stk ${cls}">${cards}</div>${nav}</div></li>`;
}).join('\n')}
      </ul>
    </section>`;

/* ---------- consulting: three blind-spot scenes ---------- */
const ART = {
  check: `<svg viewBox="0 0 200 110" fill="none" stroke="#121826" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Magnifying glass over the blind spot test"><path d="M26 52h24M38 40v24"/><circle cx="150" cy="50" r="30" fill="#fff"/><circle cx="150" cy="50" r="10" fill="#B08CFF"/><path d="M172 72l18 20" stroke-width="7"/></svg>`,
  demo: `<svg viewBox="0 0 200 110" fill="none" stroke="#121826" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Eye looking at a card with the blind spot test"><path d="M6 55c8-14 28-14 36 0-8 14-28 14-36 0z" fill="#fff"/><circle cx="24" cy="55" r="5" fill="#121826"/><rect x="66" y="16" width="124" height="66" rx="12" fill="#fff"/><path d="M86 49h20M96 39v20"/><circle cx="168" cy="49" r="8" fill="#B08CFF"/><path d="M46 55h16" stroke-dasharray="2 7"/><path d="M80 98h96M88 92l-8 6 8 6M168 92l8 6-8 6"/></svg>`,
  explain: `<svg viewBox="0 0 200 110" fill="none" stroke="#121826" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Camera viewfinder around the blind spot test"><path d="M20 34V16h18M162 16h18v18M180 76v18h-18M38 94H20V76"/><path d="M62 55h22M73 44v22"/><circle cx="136" cy="55" r="9" fill="#B08CFF"/><circle cx="170" cy="28" r="5" fill="#B08CFF" stroke="none"/></svg>`
};
const consultingBody = `    <section>
      ${head('Consulting', site.ledes.consulting)}
      <div class="cards">
${consulting.cards.map(c => `        <div class="cc"><div class="art">${ART[c.art] || ''}</div><div class="bd"><h3>${esc(c.title)}</h3><p>${rich(c.text)}</p></div></div>`).join('\n')}
      </div>
    </section>`;

/* ---------- contact ---------- */
const ICON = {
  youtube: c => `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1.5" y="4.5" width="21" height="15" rx="4.5" fill="${c}"/><path d="M10 8.8l5.2 3.2-5.2 3.2z" fill="#fff"/></svg>`,
  instagram: c => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="${c}" stroke-width="2.4"><rect x="3" y="3" width="18" height="18" rx="5.5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.3" cy="6.7" r="1.2" fill="${c}" stroke="none"/></svg>`,
  github: c => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="${c}"><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.7.3 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3"/></svg>`,
  scholar: c => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="${c}"><path d="M12 3 1 9l11 6 9-4.9V17h2V9z"/><path d="M5 13.2V17c0 1.7 3.1 3 7 3s7-1.3 7-3v-3.8l-7 3.8z"/></svg>`,
  other: c => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>`
};
const ICON_COLOR = ['#FF5A4A', '#FF9F1C', '#4CD07D', '#4D9BFF', '#B08CFF', '#FF7EB6'];
const shown = links.filter(l => l.url);
const contactBody = `    <section>
      ${head('Contact', site.ledes.contact)}
      <div class="email"><code id="em" data-e="${EMAIL_ENC}">(turn on JavaScript to see my email)</code><button class="btn cp" type="button" data-e="${EMAIL_ENC}">copy email</button></div>
      <div class="pills">
${shown.map((l, i) => `        <a class="pill" href="${esc(l.url)}" target="_blank" rel="noopener">${(ICON[l.icon] || ICON.other)(ICON_COLOR[i % ICON_COLOR.length])}${esc(l.name)}</a>`).join('\n')}
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
page({ id: 'consulting', title: 'Consulting', desc: 'Perception science consulting for videos and shows: checking claims, demos and explaining on camera.', body: consultingBody, file: 'consulting/index.html' });
page({ id: 'contact', title: 'Contact', desc: 'How to reach ' + site.name + ' by email and on social media.', body: contactBody, file: 'contact/index.html' });
page({ id: '404', title: 'Page not found', desc: 'Page not found.', body: notFoundBody, file: '404.html' });

const urls = ['/', ...TABS.slice(1).map(t => t.href)];
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${site.url}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`);

console.log(`Built ${urls.length + 1} pages: ${papers.length} papers, ${talks.length} presentations, ${lately.length} lately labels.`);
if (warnings.length) { console.log('\nNotes:'); warnings.forEach(w => console.log('  - ' + w)); }
if (placeholders.length) { console.log('\nStill placeholders (set "placeholder": false or delete the file when real):'); placeholders.forEach(p => console.log('  - ' + p)); }
