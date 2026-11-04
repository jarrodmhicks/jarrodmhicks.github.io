#!/usr/bin/env node
/* Looks up citation counts for every paper on OpenAlex and writes data/citations.json.
   The deploy workflow runs this before each build. To try it on your own computer:
     OPENALEX_API_KEY=your_key node tools/fetch-citations.js
   Without a key it prints a note and does nothing, and the site simply shows no counts. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const KEY = process.env.OPENALEX_API_KEY;
const API = 'https://api.openalex.org';
const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const lastName = a => (a || '').trim().split(/\s+/).pop().toLowerCase();

if (!KEY) { console.log('OPENALEX_API_KEY is not set, so citation counts are skipped.'); process.exit(0); }

async function get(url) {
  const res = await fetch(url + (url.includes('?') ? '&' : '?') + 'api_key=' + encodeURIComponent(KEY));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OpenAlex answered ${res.status} for ${url.split('?')[0]}`);
  return res.json();
}

/* every OpenAlex "work" that is this paper: the DOI match, plus same-title versions (a preprint is often its own record) */
async function findWorks(p) {
  const found = new Map();
  if (p.doi) {
    const w = await get(`${API}/works/https://doi.org/${p.doi}?select=id,title,cited_by_count`);
    if (w) found.set(w.id, w);
  }
  const q = encodeURIComponent(p.title.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim());
  const r = await get(`${API}/works?search=${q}&per-page=10&select=id,title,publication_year,cited_by_count,authorships`);
  const first = lastName(p.authors[0]);
  for (const w of (r && r.results) || []) {
    const sameTitle = norm(w.title) === norm(p.title);
    const nearYear = Math.abs((w.publication_year || p.year) - p.year) <= 2;
    const sameAuthor = (w.authorships || []).some(a => lastName(a.author && a.author.display_name) === first);
    if (sameTitle && nearYear && sameAuthor) found.set(w.id, w);
  }
  return [...found.values()];
}

(async () => {
  const papers = JSON.parse(execFileSync('node', ['build.js', '--papers-json'], { cwd: ROOT, encoding: 'utf8' }));
  const out = {};
  for (const p of papers) {
    try {
      const works = await findWorks(p);
      if (!works.length) { console.log(`not found on OpenAlex: ${p.title}`); continue; }
      out[p.id] = works.reduce((s, w) => s + (w.cited_by_count || 0), 0);
      console.log(`${String(out[p.id]).padStart(5)}  ${p.title.slice(0, 70)}${works.length > 1 ? `  (${works.length} versions added together)` : ''}`);
    } catch (e) {
      console.log('stopping: ' + e.message);
      if (!Object.keys(out).length) process.exit(1);
      break;
    }
  }
  fs.writeFileSync(path.join(ROOT, 'data/citations.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote counts for ${Object.keys(out).length} of ${papers.length} papers`);
})();
