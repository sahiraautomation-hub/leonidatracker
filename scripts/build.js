#!/usr/bin/env node
'use strict';
/**
 * LeonidaTracker static site generator.
 * Usage:  node scripts/build.js
 * Env:    SITE_URL=https://example.com  ADSENSE_CLIENT=ca-pub-123...  (optional overrides)
 * Output: deploy/  (upload its contents to Hostinger public_html)
 * Deterministic: the same inputs always produce byte-identical output.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const L = require('../src/templates/layout.js');
const { esc, inline, icons, adSlot } = L;

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'deploy');
const readJSON = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

/* ------------------------------------------------------------------ *
 * Load config + data
 * ------------------------------------------------------------------ */
const site = readJSON('site.config.json');
if (process.env.SITE_URL) site.url = process.env.SITE_URL;
if (process.env.ADSENSE_CLIENT) site.adsense.client = process.env.ADSENSE_CLIENT;
site.url = site.url.replace(/\/+$/, '');
site.year = site.lastUpdated.slice(0, 4);

const CH = readJSON('data/cheats.json');
const TR = readJSON('data/tracker-items.json');
const KW = readJSON('data/keywords.json');
const guides = KW.guides;
const UPDATES = readJSON('data/updates.json').updates;

/* ------------------------------------------------------------------ *
 * Validation: fail loudly on bad data instead of shipping broken pages
 * ------------------------------------------------------------------ */
const errors = [];
const warnings = [];
function uniq(list, label) {
  const seen = new Set();
  list.forEach(id => { if (seen.has(id)) errors.push(`Duplicate ${label}: ${id}`); seen.add(id); });
}
(function validate() {
  const itemIds = new Set(TR.items.map(i => i.id));
  const catIds = new Set(TR.categories.map(c => c.id));
  const cheatCats = new Set(CH.categories.map(c => c.id));
  uniq(TR.items.map(i => i.id), 'tracker id');
  uniq(CH.cheats.map(c => c.id), 'cheat id');
  uniq(guides.map(g => g.slug), 'guide slug');
  TR.items.forEach(i => {
    if (!/^[a-z0-9-]{1,60}$/.test(i.id)) errors.push(`Bad tracker id ${i.id}`);
    if (!catIds.has(i.cat)) errors.push(`Unknown tracker category ${i.cat} on ${i.id}`);
    if (i.type === 'counter' && !(i.target > 0)) errors.push(`Counter ${i.id} needs a positive target`);
  });
  CH.cheats.forEach(c => {
    if (!cheatCats.has(c.category)) errors.push(`Unknown cheat category ${c.category} on ${c.id}`);
    if (c.code && !c.code.every(k => 'UDLR'.includes(k))) errors.push(`Bad code input on ${c.id}`);
    if (c.unlockCounter && !itemIds.has(c.unlockCounter)) errors.push(`Cheat ${c.id} references missing counter ${c.unlockCounter}`);
    if (c.unlockCheck && !itemIds.has(c.unlockCheck)) errors.push(`Cheat ${c.id} references missing check ${c.unlockCheck}`);
  });
  if (CH.cheats.length !== CH.totalInGame) errors.push(`cheats.json has ${CH.cheats.length} cheats, expected ${CH.totalInGame}`);
  (TR.completionRequirements || []).forEach(r => {
    [r.check, r.counter].concat(r.counters || []).filter(Boolean).forEach(id => { if (!itemIds.has(id)) errors.push(`Requirement references missing ${id}`); });
  });
  const cheatIds = new Set(CH.cheats.map(c => c.id));
  guides.forEach(g => {
    if (!/^[a-z0-9-]+$/.test(g.slug)) errors.push(`Bad slug ${g.slug}`);
    ['title', 'description', 'h1', 'intro', 'keyword'].forEach(k => { if (!g[k]) errors.push(`Guide ${g.slug} missing ${k}`); });
    if (g.title.length > 65) warnings.push(`Title over 65 chars (${g.title.length}): ${g.slug}`);
    if (g.description.length < 70 || g.description.length > 165) warnings.push(`Description length ${g.description.length}: ${g.slug}`);
    if (g.data && g.data.filter && g.data.filter.ids) {
      g.data.filter.ids.forEach(id => { if (!cheatIds.has(id) && !itemIds.has(id)) errors.push(`Guide ${g.slug} references unknown id ${id}`); });
    }
    if (!g.faqs || g.faqs.length < 2) warnings.push(`Guide ${g.slug} has fewer than 2 FAQs`);
  });
  if (errors.length) {
    console.error('\nData validation failed:\n  - ' + errors.join('\n  - '));
    process.exit(1);
  }
})();

/* ------------------------------------------------------------------ *
 * Output helpers
 * ------------------------------------------------------------------ */
function rmrf(dir) { if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); }
function writeFile(rel, content) {
  const full = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}
const sitemap = [];
function writePage(urlPath, html, { priority = '0.6', changefreq = 'weekly', index = true } = {}) {
  writeFile(urlPath === '/' ? 'index.html' : path.join(urlPath, 'index.html'), html);
  if (index) sitemap.push({ loc: site.url + urlPath, priority, changefreq });
}

function minifyCss(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}').trim();
}

const css = minifyCss(fs.readFileSync(path.join(ROOT, 'src/assets/styles.css'), 'utf8'));
const js = fs.readFileSync(path.join(ROOT, 'src/assets/app.js'), 'utf8');
const assetVersion = crypto.createHash('sha1').update(css + js).digest('hex').slice(0, 10);

const CAT_ORDER = ['Basics', 'Money', 'Vehicles', 'Weapons', 'Cheats', 'Collectibles', 'Progress', 'Missions', 'World'];
function orderedCats() {
  const all = [...new Set(guides.map(g => g.category))];
  return all.sort((x, y) => (CAT_ORDER.indexOf(x) + 1 || 99) - (CAT_ORDER.indexOf(y) + 1 || 99));
}
const footerGuides = (site.footerGuides || []).map(s => guides.find(g => g.slug === s)).filter(Boolean)
  .map(g => ({ slug: g.slug, short: g.title.replace(/\s*[:|(].*$/, '') }));

function render(opts) {
  return L.page(Object.assign({ site, assetVersion, footerGuides }, opts));
}

/* ------------------------------------------------------------------ *
 * Shared fragments
 * ------------------------------------------------------------------ */
const ARROW = { U: '↑', D: '↓', L: '←', R: '→' };
const WORD = { U: 'Up', D: 'Down', L: 'Left', R: 'Right' };
const words = code => code.map(k => WORD[k]).join(', ');
const cheatCat = id => CH.categories.find(c => c.id === id);
const trackerItem = id => TR.items.find(i => i.id === id);
const fmt = n => Number(n).toLocaleString('en-US');

/* Cheats with a verified code get their own page, unless a dedicated guide already
   targets that exact cheat (avoids two pages competing for the same search). */
const DEDICATED_GUIDE = { 'money-250k': 'gta-6-money-cheat', 'body-armor': 'gta-6-body-armor-cheat' };
const hasOwnPage = c => !!c.code && !DEDICATED_GUIDE[c.id];
const cheatUrl = c => !c.code ? null : (DEDICATED_GUIDE[c.id] ? `/guides/${DEDICATED_GUIDE[c.id]}/` : `/cheats/${c.id}/`);
const cheatLink = c => cheatUrl(c) ? `<a href="${cheatUrl(c)}">${esc(c.name)}</a>` : esc(c.name);

function holdKeys(platform) {
  if (platform === 'ps5') return `<kbd class="hold">L1 + R1</kbd>`;
  if (platform === 'xbox') return `<kbd class="hold">LB + RB</kbd>`;
  return `<kbd class="hold"><span class="act-ps5">L1 + R1</span><span class="act-xbox">LB + RB</span></kbd>`;
}
function codeHTML(code, platform = 'both') {
  if (!code) return `<span class="code-missing">Code not found yet</span>`;
  const keys = code.map(k => `<kbd>${ARROW[k]}</kbd>`).join('');
  return `<span class="code" role="img" aria-label="${esc(words(code))}">${holdKeys(platform)}<span class="plus">then</span>${keys}</span>`;
}

function cheatCard(c) {
  const cat = cheatCat(c.category);
  const search = [c.name, c.effect, c.unlock, cat.name, c.code ? 'code known ' + words(c.code) : 'code unknown'].join(' ').toLowerCase();
  return `<article class="cheat${c.code ? '' : ' locked-code'}" id="${c.id}" data-filter-item data-id="${c.id}" data-cat="${c.category}" data-known="${c.code ? 1 : 0}" data-search="${esc(search)}">
  <div class="cheat-top">
    <div>
      <h3>${cheatLink(c)}</h3>
      <div class="card-meta mt-1"><span class="chip">${esc(cat.name)}</span>${c.code ? '<span class="chip chip-cyan">Code known</span>' : '<span class="chip chip-warn">Code TBD</span>'}</div>
    </div>
    <div class="cheat-actions">
      ${c.code ? `<button class="icon-btn" type="button" data-copy="${esc(words(c.code))}" aria-label="Copy ${esc(c.name)} code">${icons.copy}</button>` : ''}
      <button class="icon-btn" type="button" data-fav="${c.id}" aria-pressed="false" aria-label="Favourite ${esc(c.name)}">${icons.star}</button>
    </div>
  </div>
  <p class="effect">${esc(c.effect)}</p>
  <div>${codeHTML(c.code)}</div>
  ${c.code ? `<p class="dim mb-0" style="font-size:.82rem">${esc(words(c.code))}</p>` : ''}
  <p class="unlock"><b>Unlock:</b> ${esc(c.unlock)}</p>
  <div class="unlock-progress" data-unlock-for="${c.id}" hidden></div>
  <p class="tip">${esc(c.tip)}</p>
</article>`;
}

function cheatsTable(list, platform, caption) {
  const rows = list.map(c => `<tr>
  <td><strong>${cheatLink(c)}</strong><br><small>${esc(cheatCat(c.category).name)}</small></td>
  <td>${codeHTML(c.code, platform || 'both')}${c.code ? `<br><small>${esc(words(c.code))}</small>` : ''}</td>
  <td>${esc(c.effect)}</td>
  <td>${esc(c.unlock)}</td>
</tr>`).join('');
  return `<div class="table-wrap"><table>
<caption>${esc(caption || 'Cheats')}</caption>
<thead><tr><th scope="col">Cheat</th><th scope="col">Code</th><th scope="col">Effect</th><th scope="col">Unlock</th></tr></thead>
<tbody>${rows}</tbody></table></div>`;
}

function countersTable(list, caption) {
  const rows = list.map(i => `<tr>
  <td><strong>${esc(i.name)}</strong>${i.chapter ? `<br><small>${esc(i.chapter)}</small>` : ''}</td>
  <td class="mono">${i.type === 'counter' ? (i.unit || '') + fmt(i.target) : 'Checklist'}</td>
  <td>${esc(i.note || '')}</td>
</tr>`).join('');
  return `<div class="table-wrap"><table>
<caption>${esc(caption)}</caption>
<thead><tr><th scope="col">Item</th><th scope="col">Target</th><th scope="col">Notes</th></tr></thead>
<tbody>${rows}</tbody></table></div>`;
}

function missionsTable(list, caption) {
  const rows = list.map((m, i) => `<tr><td class="mono">${i + 1}</td><td><strong>${esc(m.name)}</strong></td><td>${esc(m.note || '')}</td></tr>`).join('');
  return `<div class="table-wrap"><table>
<caption>${esc(caption)}</caption>
<thead><tr><th scope="col">#</th><th scope="col">Mission</th><th scope="col">Unlocks / notes</th></tr></thead>
<tbody>${rows}</tbody></table></div>`;
}

function selectCheats(f) {
  f = f || {};
  return CH.cheats.filter(c =>
    (!f.ids || f.ids.includes(c.id)) &&
    (!f.category || c.category === f.category) &&
    (f.known === undefined || !!c.code === f.known) &&
    (!f.unlockCheck || c.unlockCheck === f.unlockCheck));
}

/* Programmatic per-item notes: derived from the data (shared openers, shared
   counters, unlock chains) so each guide gets specific, non-duplicated detail. */
function commonPrefix(a, b) { let n = 0; while (n < a.length && n < b.length && a[n] === b[n]) n++; return n; }
function lcFirst(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
function cheatNotes(list) {
  if (list.length > 12) return '';
  const out = list.map(c => {
    let txt = `${esc(c.effect)} To unlock it, ${esc(lcFirst(c.unlock))}`;
    if (c.code) {
      txt += ` The input is ${c.code.length} presses: ${esc(words(c.code))}.`;
      const sib = CH.cheats.filter(o => o.code && o.id !== c.id).map(o => ({ o, n: commonPrefix(c.code, o.code) })).filter(x => x.n >= 5);
      if (sib.length) txt += ` It shares its first ${Math.min(...sib.map(x => x.n))} or more inputs with ${sib.map(x => esc(x.o.name)).join(', ')}, so slow down at the end.`;
    } else {
      txt += ' The code has not been confirmed yet. Work on the challenge now so it is ready when the code is published.';
    }
    if (c.unlockCounter) {
      const shared = CH.cheats.filter(o => o.unlockCounter === c.unlockCounter && o.id !== c.id);
      if (shared.length) txt += ` The same counter also unlocks ${shared.map(o => `${esc(o.name)} at ${fmt(o.unlockTarget)}`).join(' and ')}.`;
    }
    txt += ` ${esc(c.tip)}`;
    return `<h3 id="${c.id}">${esc(c.name)}</h3><p>${txt}</p>`;
  }).join('');
  return `<h2 id="notes">Cheat-by-cheat notes</h2>${out}`;
}
function counterNotes(list) {
  if (list.length > 8) return '';
  const out = list.map(i => {
    const unlocks = CH.cheats.filter(c => c.unlockCounter === i.id).sort((a, b) => a.unlockTarget - b.unlockTarget);
    let txt = i.type === 'counter' ? `The full count is ${i.unit || ''}${fmt(i.target)}. ${esc(i.note || '')}` : esc(i.note || '');
    if (unlocks.length) txt += ` On this counter: ${unlocks.map(c => `${esc(c.name)} unlocks at ${i.unit || ''}${fmt(c.unlockTarget)}`).join('; ')}.`;
    const req = (TR.completionRequirements || []).find(r => r.counter === i.id || (r.counters || []).includes(i.id));
    if (req) txt += ` For 100% completion: ${esc(lcFirst(req.note))}`;
    return `<h3>${esc(i.name)}</h3><p>${txt.trim()}</p>`;
  }).join('');
  return `<h2 id="notes">Item-by-item notes</h2>${out}`;
}

function notesBlock(g) {
  const d = g.data;
  if (!d) return '';
  if (d.type === 'cheats') {
    const list = d.filter && d.filter.ids ? d.filter.ids.map(id => CH.cheats.find(c => c.id === id)) : selectCheats(d.filter);
    return cheatNotes(list);
  }
  if (d.type === 'counters') {
    const f = d.filter || {};
    return counterNotes(f.ids ? f.ids.map(trackerItem) : TR.items.filter(i => i.cat === f.cat));
  }
  return '';
}

function genericTable(t) {
  if (!t) return '';
  return `<div class="table-wrap"><table>
${t.caption ? `<caption>${esc(t.caption)}</caption>` : ''}
<thead><tr>${t.headers.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
<tbody>${t.rows.map(r => `<tr>${r.map((c, i) => i === 0 ? `<td><strong>${inline(c)}</strong></td>` : `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function dataBlock(g) {
  const d = g.data;
  if (!d) return '';
  if (d.type === 'cheats') {
    let list = selectCheats(d.filter);
    if (d.filter && d.filter.ids) list = d.filter.ids.map(id => CH.cheats.find(c => c.id === id));
    return cheatsTable(list, d.platform, d.caption);
  }
  if (d.type === 'counters') {
    const f = d.filter || {};
    const list = f.ids ? f.ids.map(trackerItem) : TR.items.filter(i => i.cat === f.cat);
    return countersTable(list, d.caption);
  }
  if (d.type === 'missions') {
    const list = TR.items.filter(i => i.cat === 'missions' && i.chapter && i.chapter.startsWith(d.filter.chapterPrefix));
    return missionsTable(list, d.caption);
  }
  if (d.type === 'table') return genericTable(d);
  return '';
}

function breadcrumbs(trail) {
  const html = `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${trail.map((t, i) =>
    i === trail.length - 1 ? `<li aria-current="page">${esc(t.name)}</li>` : `<li><a href="${t.path}">${esc(t.name)}</a></li>`).join('')}</ol></nav>`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, item: site.url + t.path }))
  };
  return { html, ld };
}

function faqBlock(faqs, heading = 'Frequently asked questions') {
  if (!faqs || !faqs.length) return { html: '', ld: null };
  const html = `<section class="faq" aria-labelledby="faq-h"><h2 id="faq-h">${esc(heading)}</h2>${faqs.map(f =>
    `<details><summary>${esc(f.q)}</summary><p>${inline(f.a)}</p></details>`).join('')}</section>`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') } }))
  };
  return { html, ld };
}

const authorName = (site.author && site.author.name) || site.name;
const orgLd = { '@type': 'Organization', name: site.name, url: site.url + '/', logo: site.url + '/favicon.svg' };
const authorLd = site.author && site.author.type === 'Person' ? { '@type': 'Person', name: authorName, url: site.url + '/about/' } : orgLd;
const knownCount = CH.cheats.filter(c => c.code).length;
const trackedCount = TR.items.length;

/* ------------------------------------------------------------------ *
 * Page: Home
 * ------------------------------------------------------------------ */
function buildHome() {
  const toolCards = [
    { href: '/tracker/', icon: icons.check, t: '100% Completion Tracker', d: `${trackedCount} missions, collectibles, cheat challenges, trophies and garages. Progress saves in your browser, no account needed.` },
    { href: '/cheats/', icon: icons.gamepad, t: 'Cheats Database', d: `All ${CH.totalInGame} cheats with ${knownCount} verified codes, unlock challenges, a PS5/Xbox toggle and one-tap copy.` },
    { href: '/calculators/', icon: icons.calc, t: 'Completion Calculators', d: 'See which cheat you are closest to, what is left for 100%, and how many sessions it will take.' },
    { href: '/guides/', icon: icons.book, t: 'Strategy Guides', d: `${guides.length} original guides covering cheats, collectibles, missions and the map of Leonida.` }
  ].map(c => `<a class="card" href="${c.href}"><div class="icon">${c.icon}</div><h3>${c.t}</h3><p class="muted">${c.d}</p></a>`).join('');

  const featured = CH.cheats.filter(c => c.code).slice(0, 6).map(c => `<div class="card"><h3>${esc(c.name)}</h3><p class="muted" style="font-size:.92rem">${esc(c.effect)}</p>${codeHTML(c.code)}<p class="mt-1 mb-0"><small>Unlock: ${esc(c.unlock)}</small></p></div>`).join('');

  const cats = orderedCats();
  const guideCols = cats.map(cat => `<div class="card"><h3>${esc(cat)}</h3><ul class="mb-0">${guides.filter(g => g.category === cat).slice(0, 5)
    .map(g => `<li><a href="/guides/${g.slug}/">${esc(g.title)}</a></li>`).join('')}</ul></div>`).join('');

  const faqs = [
    { q: 'Is LeonidaTracker free?', a: 'Yes. Every tool and guide is free. Progress is stored in your own browser, so there is no sign-up.' },
    { q: 'Will my progress be lost if I clear my browser?', a: 'Clearing site data removes it. Use **Export save** on the [Tracker](/tracker/) to keep a backup code you can paste back in any time, on any device.' },
    { q: 'How accurate are the cheat codes?', a: `Only codes confirmed by multiple independent launch-week reports are listed. ${knownCount} of ${CH.totalInGame} have been found so far, and the rest show their unlock challenge until the code is confirmed.` },
    { q: 'Is this site official?', a: 'No. LeonidaTracker is an unofficial fan project and is not affiliated with Rockstar Games or Take-Two Interactive.' }
  ];
  const faq = faqBlock(faqs);

  const body = `
<section class="hero">
  <div class="wrap">
    <span class="eyebrow">Unofficial GTA 6 companion · Updated ${esc(site.lastUpdated)}</span>
    <h1>Track every mission, cheat and collectible in <span class="grad">Leonida</span></h1>
    <p class="lead">A free GTA 6 toolkit: a 100% completion tracker that saves in your browser, a searchable database of all ${CH.totalInGame} cheats, calculators that tell you what to do next, and ${guides.length} original guides.</p>
    <div class="btn-row">
      <a class="btn btn-primary" href="/tracker/">Open the Tracker</a>
      <a class="btn" href="/cheats/">Browse cheats</a>
    </div>
  </div>
</section>
${adSlot(site, 'top')}
<section class="section">
  <div class="wrap">
    <div class="grid grid-4">
      <div class="card stat"><b>${CH.totalInGame}</b><span>cheats catalogued</span></div>
      <div class="card stat"><b>${knownCount}</b><span>codes verified</span></div>
      <div class="card stat"><b>${trackedCount}</b><span>items you can track</span></div>
      <div class="card stat"><b>${guides.length}</b><span>original guides</span></div>
    </div>
  </div>
</section>
<section class="section">
  <div class="wrap">
    <h2 class="mt-0">Tools</h2>
    <div class="grid grid-2">${toolCards}</div>
  </div>
</section>
<section class="section">
  <div class="wrap">
    <h2 class="mt-0">How LeonidaTracker works</h2>
    <div class="grid grid-3">
      <div class="card"><div class="icon">${icons.check}</div><h3>Tick and count as you play</h3><p class="muted">Check off story missions and regions, and use plus and minus counters for collectibles and cheat challenges such as workouts or shooting-range medals.</p></div>
      <div class="card"><div class="icon">${icons.calc}</div><h3>See what unlocks next</h3><p class="muted">Your counters feed the Cheat Unlock Planner, which ranks every trackable cheat by how close you are, and the 100% gap calculator.</p></div>
      <div class="card"><div class="icon">${icons.save}</div><h3>Keep a backup</h3><p class="muted">Everything stays on your device. Export a save code to move progress between your phone and laptop, or keep it safe before clearing your browser.</p></div>
    </div>
  </div>
</section>
<section class="section">
  <div class="wrap">
    <div class="flex between items-center wrap-gap"><h2 class="mt-0 mb-0">Verified cheat codes</h2><a class="btn btn-sm" href="/cheats/">All ${CH.totalInGame} cheats</a></div>
    <p class="muted mt-2">Hold <kbd class="k">L1</kbd> + <kbd class="k">R1</kbd> on PS5 or <kbd class="k">LB</kbd> + <kbd class="k">RB</kbd> on Xbox with your phone out, then enter the arrows. Cheats unlock after the main story.</p>
    <div class="grid grid-3">${featured}</div>
  </div>
</section>
<section class="section">
  <div class="wrap">
    <div class="flex between items-center wrap-gap"><h2 class="mt-0 mb-0">Guides</h2><a class="btn btn-sm" href="/guides/">All ${guides.length} guides</a></div>
    <div class="grid grid-3 mt-2">${guideCols}</div>
  </div>
</section>
<section class="section">
  <div class="wrap">
    <div class="flex between items-center wrap-gap"><h2 class="mt-0 mb-0">Latest updates</h2><a class="btn btn-sm" href="/updates/">Full changelog</a></div>
    <div class="grid grid-3 mt-2">${UPDATES.slice(0, 3).map(u => `<div class="card"><small><time datetime="${esc(u.date)}">${esc(u.date)}</time></small><h3 class="mt-1">${esc(u.title)}</h3><p class="muted mb-0" style="font-size:.92rem">${esc(u.text)}</p></div>`).join('')}</div>
  </div>
</section>
<section class="section"><div class="narrow">${faq.html}</div></section>
${adSlot(site, 'bottom')}`;

  const jsonLd = [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: site.url + '/', description: site.tagline, inLanguage: 'en', publisher: orgLd },
    Object.assign({ '@context': 'https://schema.org' }, orgLd),
    faq.ld
  ];
  writePage('/', render({
    path: '/',
    title: 'LeonidaTracker: GTA 6 100% Tracker, Cheats and Guides',
    description: `Free GTA 6 companion: track missions and collectibles, browse all ${CH.totalInGame} cheats with verified PS5 and Xbox codes, and plan your 100% run.`,
    body, jsonLd
  }), { priority: '1.0', changefreq: 'daily' });
}

/* ------------------------------------------------------------------ *
 * Page: Tracker
 * ------------------------------------------------------------------ */
function stepFor(i) { return i.target >= 10000 ? 1000 : i.target >= 1000 ? 100 : 1; }

function trackerItemHTML(i) {
  const search = [i.name, i.chapter, i.note, i.cat].filter(Boolean).join(' ').toLowerCase();
  if (i.type === 'check') {
    const label = i.spoiler ? `<span class="spoiler" title="Tap to reveal">${esc(i.name)}</span>` : esc(i.name);
    return `<li class="titem" data-filter-item data-id="${i.id}" data-cat="${i.cat}" data-search="${esc(search)}">
  <input type="checkbox" id="c-${i.id}" data-check="${i.id}">
  <label for="c-${i.id}"><span class="name">${label}</span><span class="meta">${esc(i.chapter || '')}${i.note ? ' · ' + esc(i.note) : ''}</span></label>
  <span></span>
</li>`;
  }
  const max = i.unit ? 1000000000 : i.target;
  return `<li class="titem counter" data-filter-item data-id="${i.id}" data-cat="${i.cat}" data-target="${i.target}" data-unit="${esc(i.unit || '')}" data-search="${esc(search)}">
  <div><span class="name">${esc(i.name)}</span><span class="meta">${esc(i.note || '')}</span><div class="bar"><i></i></div></div>
  <div>
    <div class="stepper"><button type="button" data-step="-1" aria-label="Decrease ${esc(i.name)}">−</button><input type="number" inputmode="numeric" min="0" max="${max}" step="${stepFor(i)}" value="0" data-counter="${i.id}" aria-label="${esc(i.name)} count"><button type="button" data-step="1" aria-label="Increase ${esc(i.name)}">+</button></div>
    <span class="frac">${i.unit ? i.unit : ''}0 / ${i.unit ? i.unit : ''}${fmt(i.target)}</span>
  </div>
</li>`;
}

function saveManager() {
  return `<section class="card mt-3" id="save" aria-labelledby="save-h">
  <h2 id="save-h" class="mt-0">Save, backup and transfer</h2>
  <p class="muted">Your progress lives in this browser's local storage. Export a save code to back it up or move it to another device, then paste it into the box and press Import. Codes are plain Base64 text, nothing is uploaded.</p>
  <p class="notice" data-storage-warning hidden><strong>Storage is blocked.</strong> Your browser is not allowing local storage (private mode or strict settings), so progress will reset when you close the tab. Export a code before leaving.</p>
  <label class="sr-only" for="save-code">Save code</label>
  <textarea id="save-code" class="input" data-save-code placeholder="Your save code appears here. Paste a code here to import it." spellcheck="false"></textarea>
  <div class="btn-row">
    <button class="btn btn-primary" type="button" data-save-export>${icons.save} Export and copy</button>
    <button class="btn" type="button" data-save-download>Download .txt</button>
    <button class="btn" type="button" data-save-import>Import code</button>
    <label class="btn" for="save-file">Load file<input id="save-file" class="sr-only" type="file" accept=".txt,text/plain" data-save-file></label>
    <button class="btn btn-danger" type="button" data-save-reset>Reset all progress</button>
  </div>
</section>`;
}

function trackerData() {
  return {
    categories: TR.categories.map(c => ({ id: c.id, name: c.name, type: c.type })),
    items: TR.items.map(i => ({ id: i.id, cat: i.cat, type: i.type, target: i.target })),
    cheats: CH.cheats.map(c => ({ id: c.id, name: c.name, unlock: c.unlock, unlockCounter: c.unlockCounter, unlockTarget: c.unlockTarget, unlockCheck: c.unlockCheck, code: !!c.code })),
    requirements: TR.completionRequirements
  };
}

function buildTracker() {
  const bc = breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Tracker', path: '/tracker/' }]);
  const sections = TR.categories.map(c => {
    const items = TR.items.filter(i => i.cat === c.id);
    return `<section class="tcat" data-filter-group id="${c.id}">
  <header>
    <div class="progress-head"><h2>${esc(c.name)}</h2><strong data-cat-progress="${c.id}">0%</strong></div>
    <div class="bar"><i data-cat-bar="${c.id}"></i></div>
    <p>${esc(c.description)}</p>
  </header>
  <ul class="titems">${items.map(trackerItemHTML).join('')}</ul>
</section>`;
  }).join('');

  const body = `
<div class="wrap">
  <div class="page-head">
    ${bc.html}
    <h1>GTA 6 100% Completion Tracker</h1>
    <p class="lead">Tick off story missions, trophies, regions and garages, count collectibles and cheat challenges, and watch your completion climb. ${trackedCount} items across ${TR.categories.length} categories. Saved automatically in your browser.</p>
  </div>
  <div class="card">
    <div class="progress-head"><span>Overall progress</span><strong class="big-num" data-overall>0%</strong></div>
    <div class="bar"><i data-overall-bar></i></div>
    <p class="dim mt-1 mb-0" style="font-size:.85rem">Overall = average of the ${TR.categories.length} category percentages. Counters count proportionally (for example 50 of 125 flamingos = 40%). Totals verified ${esc(TR.lastVerified)}.</p>
  </div>
  ${adSlot(site, 'top')}
  <div data-filter-scope data-filter-url>
    <div class="toolbar" role="search">
      <label class="sr-only" for="tq">Search tracker</label>
      <input id="tq" class="input grow" type="search" placeholder="Search missions, collectibles, challenges…" data-filter-search autocomplete="off">
      <label class="sr-only" for="tcat">Category</label>
      <select id="tcat" class="input" data-filter-key="cat"><option value="all">All categories</option>${TR.categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      <label class="sr-only" for="tstatus">Status</label>
      <select id="tstatus" class="input" data-filter-status><option value="all">Any status</option><option value="todo">To do</option><option value="done">Done</option></select>
      <label class="inline"><input type="checkbox" data-spoiler-toggle checked> Blur spoilers</label>
      <span class="result-count" data-filter-count></span>
    </div>
    ${sections}
    <p class="empty" data-filter-empty hidden>Nothing matches that search. Try a different word or clear the filters.</p>
  </div>
  ${saveManager()}
  <section class="narrow mt-3">
    <h2>How to use the tracker</h2>
    <p>Checkboxes are for one-off milestones such as story missions, regions and race venues. Counters are for anything you collect or repeat: use the plus and minus buttons, or tap the number and type your exact total from the in-game Progress menu. Dollar counters step in hundreds or thousands so you can match big totals quickly.</p>
    <p>Mission names are blurred by default so you can track the story without reading ahead. Tap a blurred name to reveal just that one, or untick <strong>Blur spoilers</strong> to show all of them.</p>
    <p>Challenge counters link straight to the <a href="/calculators/">Cheat Unlock Planner</a> and the progress bars on the <a href="/cheats/">cheats database</a>, so updating them here shows you exactly which cheat is next.</p>
  </section>
  ${adSlot(site, 'bottom')}
</div>`;

  writePage('/tracker/', render({
    path: '/tracker/',
    title: 'GTA 6 100% Tracker: Missions, Collectibles and Challenges',
    description: `Free GTA 6 completion tracker with ${trackedCount} items: missions, collectibles, cheat challenges, trophies and garages. Saves in your browser.`,
    body, data: trackerData(),
    jsonLd: [bc.ld, { '@context': 'https://schema.org', '@type': 'WebApplication', name: 'GTA 6 100% Completion Tracker', applicationCategory: 'GameApplication', operatingSystem: 'Any (web browser)', url: site.url + '/tracker/', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, publisher: orgLd }]
  }), { priority: '0.9', changefreq: 'daily' });
}

/* ------------------------------------------------------------------ *
 * Page: Cheats
 * ------------------------------------------------------------------ */
function buildCheats() {
  const bc = breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Cheats', path: '/cheats/' }]);
  const groups = CH.categories.map(cat => {
    const list = CH.cheats.filter(c => c.category === cat.id);
    const known = list.filter(c => c.code).length;
    return `<section class="cheat-group" data-filter-group id="cat-${cat.id}">
  <h2>${esc(cat.name)} <small>(${list.length} cheats, ${known} codes found)</small></h2>
  <p class="muted">${esc(cat.description)}</p>
  <div class="cheat-grid">${list.map(cheatCard).join('')}</div>
</section>`;
  }).join('');

  const faqs = [
    { q: 'How do I enter cheats in GTA 6?', a: 'Press Up on the D-pad to take out the phone, hold L1 and press R1 on PS5 (LB and RB on Xbox), then enter the D-pad sequence. See the [full input guide](/guides/how-to-enter-cheats-gta-6/).' },
    { q: 'Why does my code not work?', a: 'The cheat has to be unlocked first: finish the main story, then complete that cheat\'s own challenge. Also keep both shoulder buttons held for the whole sequence.' },
    { q: 'Do cheats disable trophies?', a: 'Yes. Cheats disable saving, trophies and achievements for that session. Keep a separate save. More in [our trophies guide](/guides/gta-6-cheats-trophies-saving/).' },
    { q: 'When will the missing codes be added?', a: 'As soon as a code is confirmed by more than one independent source. Each missing entry already lists the challenge that unlocks it.' }
  ];
  const faq = faqBlock(faqs);

  const body = `
<div class="wrap">
  <div class="page-head">
    ${bc.html}
    <h1>GTA 6 Cheats for PS5 and Xbox Series X|S</h1>
    <p class="lead">All ${CH.totalInGame} cheats in GTA 6, grouped by type. ${knownCount} codes are verified so far, and every cheat lists the challenge that unlocks it. Switch platform to see the right shoulder buttons. Last verified ${esc(CH.lastVerified)}.</p>
  </div>
  <div class="grid grid-2">
    <div class="card">
      <div class="flex between items-center wrap-gap"><h2 class="mt-0 mb-0">How to enter a cheat</h2>
        <div class="segmented" role="group" aria-label="Platform"><button type="button" data-platform="ps5" aria-pressed="true">PS5</button><button type="button" data-platform="xbox" aria-pressed="false">Xbox</button></div>
      </div>
      <ol class="mt-2 mb-0">
        <li>${esc(CH.entry.openPhone)}</li>
        <li><span class="act-ps5">Hold <kbd class="k">L1</kbd> and press <kbd class="k">R1</kbd>.</span><span class="act-xbox">Hold <kbd class="k">LB</kbd> and press <kbd class="k">RB</kbd>.</span></li>
        <li>Keep holding and enter the D-pad arrows.</li>
        <li>Look for the confirmation message on screen.</li>
      </ol>
    </div>
    <div class="card">
      <h2 class="mt-0">Rules to know first</h2>
      <ul class="mb-0">${CH.entry.rules.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
    </div>
  </div>
  ${adSlot(site, 'top')}
  <div data-filter-scope data-filter-url>
    <div class="toolbar" role="search">
      <label class="sr-only" for="cq">Search cheats</label>
      <input id="cq" class="input grow" type="search" placeholder="Search by name, effect or unlock…" data-filter-search autocomplete="off">
      <label class="sr-only" for="ccat">Category</label>
      <select id="ccat" class="input" data-filter-key="cat"><option value="all">All types</option>${CH.categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
      <label class="inline"><input type="checkbox" data-filter-flag="known"> Known codes only</label>
      <label class="inline"><input type="checkbox" data-filter-flag="fav"> Favourites</label>
      <span class="result-count" data-filter-count></span>
    </div>
    ${groups}
    <p class="empty" data-filter-empty hidden>No cheats match. Clear the search or untick a filter.</p>
  </div>
  <div class="cta">
    <h2>Track your unlock progress</h2>
    <p class="muted">Update challenge counters in the <a href="/tracker/">Tracker</a> and each cheat above shows how close you are. The <a href="/calculators/">Cheat Unlock Planner</a> ranks them for you.</p>
  </div>
  <div class="narrow">${faq.html}</div>
  ${adSlot(site, 'bottom')}
</div>`;

  writePage('/cheats/', render({
    path: '/cheats/',
    title: `GTA 6 Cheats: All ${CH.totalInGame} Codes for PS5 and Xbox`,
    description: `Every GTA 6 cheat code for PS5 and Xbox Series X|S: ${knownCount} verified codes, unlock challenges for all ${CH.totalInGame}, search, filters and copy buttons.`,
    body, data: trackerData(),
    jsonLd: [bc.ld, faq.ld]
  }), { priority: '0.9', changefreq: 'daily' });
}

/* ------------------------------------------------------------------ *
 * Pages: one per verified cheat code (programmatic, built from cheats.json)
 * ------------------------------------------------------------------ */
function buildCheatPages() {
  const pages = CH.cheats.filter(hasOwnPage);
  pages.forEach(c => {
    const p = `/cheats/${c.id}/`;
    const cat = cheatCat(c.category);
    const w = words(c.code);
    const bc = breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Cheats', path: '/cheats/' }, { name: c.name, path: p }]);
    const siblings = CH.cheats.filter(o => o.code && o.id !== c.id).map(o => ({ o, n: commonPrefix(c.code, o.code) })).filter(x => x.n >= 5);
    const sibHTML = siblings.length ? `<h2 id="similar">Codes that look almost the same</h2>
<p>${esc(c.name)} belongs to a family of codes that open the same way. Entering the wrong ending triggers a different cheat, or nothing at all.</p>
<ul>${siblings.map(({ o, n }) => `<li>${cheatLink(o)} shares the first ${n} presses. It splits at press ${n + 1}: <strong>${WORD[c.code[n]] || 'end'}</strong> for ${esc(c.name)}, <strong>${WORD[o.code[n]] || 'end'}</strong> for ${esc(o.name)}.</li>`).join('')}</ul>
<p>Learn the shared opening once, then focus on the ending. The <a href="/guides/gta-6-cheat-code-patterns/">code patterns guide</a> covers every family.</p>` : '';
    const shared = c.unlockCounter ? CH.cheats.filter(o => o.unlockCounter === c.unlockCounter && o.id !== c.id) : [];
    const counter = c.unlockCounter ? trackerItem(c.unlockCounter) : null;
    let unlockHTML = `<p>${esc(c.unlock)} Like every cheat in GTA 6, it also stays locked until the main story is finished.</p>`;
    if (c.unlockCheck) unlockHTML = `<p>${esc(c.name)} is one of only four cheats that need nothing except the main story. Once the credits roll it appears in the Cheats list of the Progress menu, ready to use.</p>`;
    if (counter) unlockHTML += `<p>Keep count on the <strong>${esc(counter.name)}</strong> counter in the <a href="/tracker/">Tracker</a>. The target is ${counter.unit || ''}${fmt(c.unlockTarget)}.${shared.length ? ` The same counter also unlocks ${shared.map(o => `${cheatLink(o)} at ${counter.unit || ''}${fmt(o.unlockTarget)}`).join(' and ')}.` : ''}</p>`;
    const sameCat = CH.cheats.filter(o => o.category === c.category && o.id !== c.id && o.code).slice(0, 4);
    const fill = CH.cheats.filter(o => o.code && o.id !== c.id && !sameCat.includes(o)).slice(0, 4 - sameCat.length);
    const relHTML = sameCat.concat(fill).map(o => `<a class="card" href="${cheatUrl(o)}"><span class="chip">${esc(cheatCat(o.category).name)}</span><h3 class="mt-1">${esc(o.name)}</h3><p class="muted mb-0" style="font-size:.9rem">${esc(o.effect)}</p></a>`).join('');
    const faqs = [
      { q: `What is the ${c.name} cheat code in GTA 6?`, a: `Take out the phone, hold L1 and press R1 on PS5 (LB and RB on Xbox), then enter ${w}.` },
      { q: `How do I unlock ${c.name}?`, a: c.unlockCheck ? 'Finish the main story. No extra challenge is needed.' : `${c.unlock} You also need to have finished the main story.` },
      { q: `Is the ${c.name} code the same on PS5 and Xbox?`, a: 'Yes. The D-pad sequence is identical. Only the shoulder buttons differ: L1 and R1 on PS5, LB and RB on Xbox Series X|S.' }
    ];
    const faq = faqBlock(faqs);
    const body = `
<div class="wrap">
  <div class="page-head">${bc.html}</div>
  <div class="with-aside">
    <article class="prose">
      <h1>GTA 6 ${esc(c.name)} Cheat Code for PS5 and Xbox</h1>
      <div class="byline"><span class="chip chip-pink">${esc(cat.name)}</span><span class="chip chip-cyan">Code verified</span><span>Updated <time datetime="${esc(CH.lastVerified)}">${esc(CH.lastVerified)}</time></span></div>
      <p class="lead">${esc(c.name)} is one of GTA 6's ${esc({ player: 'player', combat: 'combat', vehicle: 'vehicle spawn', environment: 'environment', filter: 'screen filter' }[c.category])} cheats. ${esc(c.effect)} Below is the exact input for both consoles, what you need to do to unlock it, and how to avoid the common mistakes.</p>
      <div class="card">
        <table>
          <tbody>
            <tr><th scope="row">PS5</th><td>${codeHTML(c.code, 'ps5')}</td></tr>
            <tr><th scope="row">Xbox Series X|S</th><td>${codeHTML(c.code, 'xbox')}</td></tr>
            <tr><th scope="row">In words</th><td>${esc(w)} <button class="btn btn-sm" type="button" data-copy="${esc(w)}">${icons.copy} Copy</button></td></tr>
            <tr><th scope="row">Length</th><td>${c.code.length} D-pad presses</td></tr>
            <tr><th scope="row">Unlock</th><td>${esc(c.unlock)}</td></tr>
          </tbody>
        </table>
        <div class="unlock-progress mt-2" data-unlock-for="${c.id}" hidden></div>
      </div>
      <h2 id="enter">How to enter the ${esc(c.name)} code</h2>
      <ol>
        <li>Press <strong>Up</strong> on the D-pad during gameplay to take out the phone.</li>
        <li>On PS5, hold <strong>L1</strong> and press <strong>R1</strong>. On Xbox Series X|S, hold <strong>LB</strong> and press <strong>RB</strong>.</li>
        <li>Keep holding and press: <strong>${esc(w)}</strong>.</li>
        <li>Wait for the on-screen confirmation.</li>
      </ol>
      <p>${esc(c.tip)}</p>
      ${adSlot(site, 'inContent')}
      <h2 id="unlock">How to unlock ${esc(c.name)}</h2>
      ${unlockHTML}
      ${sibHTML}
      <h2 id="before">Before you use it</h2>
      <p>Using any cheat disables saving, trophies and achievements for that session. Make a manual save in a separate slot first, and reload your clean save when you are done. Details in <a href="/guides/gta-6-cheats-trophies-saving/">cheats, trophies and saving</a>. If the code does nothing, work through <a href="/guides/gta-6-cheats-not-working/">the seven common causes</a>.</p>
      ${faq.html}
    </article>
    <aside>
      <div class="aside-box">
        <div class="card toc"><h3>On this page</h3><a href="#enter">How to enter it</a><a href="#unlock">How to unlock it</a>${siblings.length ? '<a href="#similar">Similar codes</a>' : ''}<a href="#before">Before you use it</a><a href="#faq-h">FAQ</a></div>
        <a class="card" href="/cheats/"><div class="icon">${icons.gamepad}</div><h3>All ${CH.totalInGame} cheats</h3><p class="muted mb-0">Search the full database and switch between PS5 and Xbox buttons.</p></a>
        ${adSlot(site, 'sidebar')}
      </div>
    </aside>
  </div>
  <section class="mt-3"><h2>More cheat codes</h2><div class="grid grid-4">${relHTML}</div></section>
  ${adSlot(site, 'bottom')}
</div>`;
    const title = `GTA 6 ${c.name} Cheat Code (PS5, Xbox) and Unlock`;
    const article = {
      '@context': 'https://schema.org', '@type': 'Article', headline: `GTA 6 ${c.name} Cheat Code for PS5 and Xbox`,
      description: `${c.name} cheat code and unlock requirement for GTA 6.`, inLanguage: 'en',
      datePublished: site.published, dateModified: CH.lastVerified, author: authorLd, publisher: orgLd,
      mainEntityOfPage: { '@type': 'WebPage', '@id': site.url + p },
      about: { '@type': 'VideoGame', name: 'Grand Theft Auto VI', gamePlatform: ['PlayStation 5', 'Xbox Series X|S'] }
    };
    writePage(p, render({
      path: p, title, ogType: 'article',
      description: `GTA 6 ${c.name} cheat code for PS5 and Xbox: ${w}. Plus how to unlock it and enter it first time.`,
      body, data: { cheats: [{ id: c.id, name: c.name, unlock: c.unlock, unlockCounter: c.unlockCounter, unlockTarget: c.unlockTarget, unlockCheck: c.unlockCheck, code: true }] },
      jsonLd: [bc.ld, article, faq.ld]
    }), { priority: '0.7', changefreq: 'weekly' });
  });
  return pages.length;
}

function buildUpdates() {
  const bc = breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Updates', path: '/updates/' }]);
  const body = `<div class="narrow"><div class="page-head">${bc.html}<h1>Site updates and changelog</h1><p class="lead">Every data check, new code and new guide, newest first. Dates show when facts on the site were last verified.</p></div>
<div class="grid">${UPDATES.map(u => `<article class="card"><small><time datetime="${esc(u.date)}">${esc(u.date)}</time></small><h2 class="mt-1" style="font-size:1.2rem">${esc(u.title)}</h2><p class="muted mb-0">${esc(u.text)}</p></article>`).join('')}</div>
<p class="mt-3 muted">Found a code we are missing, or something out of date? <a href="/contact/">Send a correction</a>.</p></div>`;
  writePage('/updates/', render({ path: '/updates/', title: 'Updates and Changelog', description: 'LeonidaTracker changelog: newly verified GTA 6 cheat codes, data checks, new guides and tool improvements, newest first.', body, jsonLd: [bc.ld] }), { priority: '0.5', changefreq: 'daily' });
}

/* ------------------------------------------------------------------ *
 * Page: Calculators
 * ------------------------------------------------------------------ */
function buildCalculators() {
  const bc = breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Calculators', path: '/calculators/' }]);
  const faqs = [
    { q: 'How is completion calculated?', a: 'Each checkbox counts as 0 or 1. Each counter counts as your value divided by its target, capped at 1. A category is the average of its items, and overall is the average of the categories.' },
    { q: 'Why are some cheats missing from the planner?', a: 'Cheats that need every challenge on a track have no fixed number to measure, so they are listed on the cheats page instead.' },
    { q: 'Does this match the in-game percentage?', a: 'No. The in-game 100% uses Rockstar\'s own checklist. These tools measure the items you track here, and the 100% gap table uses the known in-game requirements.' }
  ];
  const faq = faqBlock(faqs);
  const body = `
<div class="wrap">
  <div class="page-head">
    ${bc.html}
    <h1>GTA 6 Completion Calculators</h1>
    <p class="lead">Four tools that read your <a href="/tracker/">Tracker</a> progress: a completion breakdown, a Cheat Unlock Planner, a 100% gap check and a play-time estimator. Everything runs in your browser.</p>
    <label class="inline"><input type="checkbox" data-check="story-complete"> I have finished the main story</label>
  </div>
  <div class="grid grid-2">
    <section class="card" aria-labelledby="calc1">
      <h2 id="calc1" class="mt-0">1. Completion breakdown</h2>
      <div class="progress-head"><span>Overall</span><strong class="big-num" data-overall>0%</strong></div>
      <div class="bar mb-2"><i data-overall-bar></i></div>
      <div data-calc="completion"><p class="dim">Loading your progress…</p></div>
    </section>
    <section class="card" aria-labelledby="calc4">
      <h2 id="calc4" class="mt-0">2. Play-time estimator</h2>
      <form data-calc="eta">
        <div class="field"><label for="eta-cat">Items remaining from</label>
          <select id="eta-cat" class="input" data-eta-cat><option value="all">Everything on my tracker</option>${TR.categories.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}<option value="custom">Custom number</option></select></div>
        <div class="grid grid-2">
          <div class="field"><label for="eta-n">Items remaining</label><input id="eta-n" class="input" type="number" min="0" value="0" data-eta-remaining></div>
          <div class="field"><label for="eta-per">Minutes per item</label><input id="eta-per" class="input" type="number" min="0" step="1" value="12" data-eta-per></div>
          <div class="field"><label for="eta-s">Session length (min)</label><input id="eta-s" class="input" type="number" min="1" value="90" data-eta-session></div>
          <div class="field"><label for="eta-w">Sessions per week</label><input id="eta-w" class="input" type="number" min="1" value="4" data-eta-weekly></div>
        </div>
        <div data-eta-out aria-live="polite"></div>
      </form>
    </section>
  </div>
  ${adSlot(site, 'inContent')}
  <section class="card mt-3" aria-labelledby="calc2">
    <h2 id="calc2" class="mt-0">3. Cheat Unlock Planner</h2>
    <p class="muted"><span data-planner-summary></span> Sorted by how close you are. Update counters in the <a href="/tracker/">Tracker</a> to move cheats up the list.</p>
    <label class="inline mb-2"><input type="checkbox" data-planner-all> Include cheats already unlocked</label>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Cheat</th><th scope="col">Progress</th><th scope="col">Remaining</th><th scope="col">Code</th></tr></thead>
      <tbody data-calc="planner"><tr><td colspan="4" class="dim">Loading…</td></tr></tbody>
    </table></div>
  </section>
  <section class="card mt-3" aria-labelledby="calc3">
    <h2 id="calc3" class="mt-0">4. 100% gap check</h2>
    <p class="muted">The known in-game requirements for 100% completion, compared with your counters. See the <a href="/guides/gta-6-100-percent-completion/">100% guide</a> for context.</p>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Requirement</th><th scope="col">You</th><th scope="col">Status</th></tr></thead>
      <tbody data-calc="gap"><tr><td colspan="3" class="dim">Loading…</td></tr></tbody>
    </table></div>
  </section>
  <section class="narrow mt-3">
    <h2>Picking a sensible minutes-per-item value</h2>
    <p>The estimator is only as good as its per-item time. A quick way to calibrate it: time yourself on your next three collectibles or challenge runs, including travel, and use the average. Strict lists such as underwater discoveries usually take longer per item than counters you advance during normal play, so run the estimator per category for a more honest number.</p>
    ${faq.html}
  </section>
  ${adSlot(site, 'bottom')}
</div>`;
  writePage('/calculators/', render({
    path: '/calculators/',
    title: 'GTA 6 Calculators: Cheat Unlock Planner and 100% Gap',
    description: 'Free GTA 6 calculators: see which cheat you are closest to unlocking, what is left for 100% completion, and how many sessions your run will take.',
    body, data: trackerData(), jsonLd: [bc.ld, faq.ld]
  }), { priority: '0.8' });
}

/* ------------------------------------------------------------------ *
 * Guides
 * ------------------------------------------------------------------ */
function wordCount(g) {
  const text = [g.intro].concat(...g.sections.map(s => [s.h2].concat(s.p || [], s.list || [], s.steps || [], s.after || [], s.table ? [].concat(s.table.headers, ...s.table.rows) : [])), ...g.faqs.map(f => [f.q, f.a])).join(' ');
  return text.split(/\s+/).filter(Boolean).length;
}

function related(g) {
  const same = guides.filter(x => x.category === g.category && x.slug !== g.slug);
  const other = guides.filter(x => x.category !== g.category);
  return same.slice(0, 3).concat(other.slice(guides.indexOf(g) % Math.max(other.length - 1, 1), (guides.indexOf(g) % Math.max(other.length - 1, 1)) + 1)).slice(0, 4);
}

const TOOL = {
  cheats: { href: '/cheats/', t: 'Cheats Database', d: 'Search all 61 cheats, switch PS5/Xbox buttons and copy codes.' },
  tracker: { href: '/tracker/', t: '100% Tracker', d: 'Tick missions and count collectibles. Saves in your browser.' },
  calculators: { href: '/calculators/', t: 'Calculators', d: 'See which cheat is next and what is left for 100%.' },
  guides: { href: '/guides/', t: 'All Guides', d: 'Browse every guide on money, vehicles, weapons, cheats and 100% completion.' }
};

function buildGuide(g, i) {
  const p = `/guides/${g.slug}/`;
  const bc = breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Guides', path: '/guides/' }, { name: g.title, path: p }]);
  const faq = faqBlock(g.faqs);
  const tool = TOOL[g.tool] || TOOL.tracker;
  const words = wordCount(g) + (notesBlock(g).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length);
  const mins = Math.max(2, Math.round(words / 220));
  const sectionHTML = g.sections.map((s, idx) => {
    const id = s.h2.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let html = `<h2 id="${id}">${esc(s.h2)}</h2>` +
      (s.list ? `<ul>${s.list.map(li => `<li>${inline(li)}</li>`).join('')}</ul>` : '') +
      (s.p || []).map(t => `<p>${inline(t)}</p>`).join('') +
      (s.steps ? `<ol>${s.steps.map(li => `<li>${inline(li)}</li>`).join('')}</ol>` : '') +
      (s.after ? `<p>${inline(s.after)}</p>` : '') +
      genericTable(s.table);
    if (idx === 0) html += dataBlock(g);
    if (idx === 1) html += adSlot(site, 'inContent');
    return html;
  }).join('');
  const notes = notesBlock(g);
  const toc = g.sections.map(s => `<a href="#${s.h2.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}">${esc(s.h2)}</a>`).join('') + (notes ? '<a href="#notes">Detailed notes</a>' : '') + (g.faqs.length ? '<a href="#faq-h">FAQ</a>' : '');
  const rel = related(g).map(r => `<a class="card" href="/guides/${r.slug}/"><span class="chip">${esc(r.category)}</span><h3 class="mt-1">${esc(r.title)}</h3><p class="muted mb-0" style="font-size:.9rem">${esc(r.description)}</p></a>`).join('');
  const prev = guides[i - 1], next = guides[i + 1];

  const body = `
<div class="wrap">
  <div class="page-head">${bc.html}</div>
  <div class="with-aside">
    <article class="prose">
      <h1>${esc(g.h1)}</h1>
      <div class="byline"><span class="chip chip-pink">${esc(g.category)}</span><span>By <a href="/about/">${esc(authorName)}</a></span><span>·</span><span>Updated <time datetime="${esc(KW.lastVerified)}">${esc(KW.lastVerified)}</time></span><span>·</span><span>${mins} min read</span></div>
      <p class="lead">${inline(g.intro)}</p>
      ${sectionHTML}
      ${notes}
      <div class="cta"><h3>${esc(tool.t)}</h3><p class="muted">${esc(tool.d)}</p><a class="btn btn-primary btn-sm" href="${tool.href}">Open ${esc(tool.t)}</a></div>
      ${faq.html}
      <p class="dim" style="font-size:.85rem">Facts on this page were checked against launch-week reports on ${esc(KW.lastVerified)}. Spot something out of date? <a href="/contact/">Tell us</a>.</p>
      <nav class="pager" aria-label="More guides">
        ${prev ? `<a class="card" href="/guides/${prev.slug}/"><small>Previous</small>${esc(prev.title)}</a>` : '<span></span>'}
        ${next ? `<a class="card next" href="/guides/${next.slug}/"><small>Next</small>${esc(next.title)}</a>` : '<span></span>'}
      </nav>
    </article>
    <aside>
      <div class="aside-box">
        <div class="card toc"><h3>On this page</h3>${toc}</div>
        <a class="card" href="${tool.href}"><div class="icon">${g.tool === 'cheats' ? icons.gamepad : g.tool === 'calculators' ? icons.calc : icons.check}</div><h3>${esc(tool.t)}</h3><p class="muted mb-0">${esc(tool.d)}</p></a>
        ${adSlot(site, 'sidebar')}
      </div>
    </aside>
  </div>
  <section class="mt-3"><h2>Related guides</h2><div class="grid grid-2">${rel}</div></section>
  ${adSlot(site, 'bottom')}
</div>`;

  const article = {
    '@context': 'https://schema.org', '@type': 'Article',
    headline: g.h1, description: g.description, inLanguage: 'en',
    datePublished: site.published, dateModified: KW.lastVerified,
    author: authorLd, publisher: orgLd,
    mainEntityOfPage: { '@type': 'WebPage', '@id': site.url + p },
    about: { '@type': 'VideoGame', name: 'Grand Theft Auto VI', gamePlatform: ['PlayStation 5', 'Xbox Series X|S'] },
    keywords: g.keyword, wordCount: words
  };
  writePage(p, render({
    path: p, title: g.title, description: g.description, body, ogType: 'article',
    jsonLd: [bc.ld, article, faq.ld].filter(Boolean)
  }), { priority: '0.7', changefreq: 'weekly' });
  return words;
}

function buildGuidesIndex() {
  const bc = breadcrumbs([{ name: 'Home', path: '/' }, { name: 'Guides', path: '/guides/' }]);
  const cats = orderedCats();
  const groups = cats.map(cat => `<section data-filter-group class="mb-2"><h2>${esc(cat)}</h2><div class="grid grid-2">${guides.filter(g => g.category === cat).map(g =>
    `<a class="card" href="/guides/${g.slug}/" data-filter-item data-id="${g.slug}" data-cat="${esc(cat.toLowerCase())}" data-search="${esc((g.title + ' ' + g.description + ' ' + g.keyword).toLowerCase())}"><h3>${esc(g.title)}</h3><p class="muted mb-0" style="font-size:.92rem">${esc(g.description)}</p></a>`).join('')}</div></section>`).join('');
  const list = {
    '@context': 'https://schema.org', '@type': 'ItemList', name: 'GTA 6 guides',
    itemListElement: guides.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: site.url + `/guides/${g.slug}/`, name: g.title }))
  };
  const body = `
<div class="wrap">
  <div class="page-head">
    ${bc.html}
    <h1>GTA 6 Guides</h1>
    <p class="lead">${guides.length} original guides on cheats, collectibles, missions and the world of Leonida. Every guide links to the tool that puts it into practice.</p>
  </div>
  ${adSlot(site, 'top')}
  <div data-filter-scope data-filter-url>
    <div class="toolbar" role="search">
      <label class="sr-only" for="gq">Search guides</label>
      <input id="gq" class="input grow" type="search" placeholder="Search guides…" data-filter-search autocomplete="off">
      <label class="sr-only" for="gcat">Topic</label>
      <select id="gcat" class="input" data-filter-key="cat"><option value="all">All topics</option>${cats.map(c => `<option value="${esc(c.toLowerCase())}">${esc(c)}</option>`).join('')}</select>
      <span class="result-count" data-filter-count></span>
    </div>
    ${groups}
    <p class="empty" data-filter-empty hidden>No guides match that search.</p>
  </div>
  ${adSlot(site, 'bottom')}
</div>`;
  writePage('/guides/', render({
    path: '/guides/', title: 'GTA 6 Guides: Cheats, Collectibles, Missions and Map',
    description: `${guides.length} original GTA 6 guides: how to enter cheats, every cheat unlock, collectible counts, 100% requirements, mission lists and Leonida's regions.`,
    body, jsonLd: [bc.ld, list]
  }), { priority: '0.8', changefreq: 'weekly' });
}

/* ------------------------------------------------------------------ *
 * Legal + info pages (required for AdSense review)
 * ------------------------------------------------------------------ */
function simplePage(p, title, description, h1, html, { index = true } = {}) {
  const bc = breadcrumbs([{ name: 'Home', path: '/' }, { name: h1, path: p }]);
  const body = `<div class="narrow"><div class="page-head">${bc.html}<h1>${esc(h1)}</h1></div><div class="prose">${html}</div></div>`;
  writePage(p, render({ path: p, title, description, body, jsonLd: [bc.ld] }), { priority: '0.3', changefreq: 'monthly', index });
}

function buildLegal() {
  const mail = `<a href="mailto:${esc(site.email)}">${esc(site.email)}</a>`;
  const updated = `<p class="dim">Last updated: ${esc(site.lastUpdated)}</p>`;

  simplePage('/about/', 'About LeonidaTracker', 'Who runs LeonidaTracker, how GTA 6 data is verified before it is published, and how the free tracker and cheat tools work.', 'About LeonidaTracker', `
<p>LeonidaTracker is an independent, unofficial companion site for Grand Theft Auto VI. It exists to answer the practical questions players have mid-session: what is the code, what unlocks it, how many are left, and what should I do next.</p>
<h2>What you will find here</h2>
<ul>
  <li><a href="/tracker/">A 100% tracker</a> with ${trackedCount} missions, collectibles, cheat challenges and regions, saved privately in your browser.</li>
  <li><a href="/cheats/">A cheats database</a> covering all ${CH.totalInGame} cheats, their unlock challenges and every verified code.</li>
  <li><a href="/calculators/">Calculators</a> that turn your progress into a plan.</li>
  <li><a href="/guides/">${guides.length} original guides</a> written for this site.</li>
</ul>
<h2>How we check facts</h2>
<p>GTA 6 is new, and early information is often wrong. A cheat code or collectible count is only published here once it has been confirmed by more than one independent source. Where something is still unconfirmed, the page says so plainly instead of guessing. Every guide shows the date its facts were last checked.</p>
<h2>What we do not do</h2>
<p>We do not copy wiki text, use Rockstar artwork or logos, or offer downloads, mods or anything that modifies the game. All text and graphics on this site are original.</p>
<h2>Get in touch</h2>
<p>Corrections and suggestions are welcome at ${mail} or through the <a href="/contact/">contact page</a>.</p>`);

  simplePage('/contact/', 'Contact LeonidaTracker', 'Contact LeonidaTracker to report an incorrect cheat code, suggest a tracker item or guide, or ask a question about the site.', 'Contact', `
<p>The fastest way to reach us is email: ${mail}.</p>
<h2>Reporting a correction</h2>
<p>If a code, count or mission name on this site looks wrong, please include:</p>
<ul><li>The page address.</li><li>What you think is incorrect and what it should be.</li><li>Your platform (PS5 or Xbox Series X|S) if it is about a cheat.</li></ul>
<p>Corrections are checked before the page is updated, which usually happens within a few days.</p>
<h2>Other questions</h2>
<p>For questions about privacy, see the <a href="/privacy-policy/">Privacy Policy</a>. For questions about using the content, see the <a href="/terms/">Terms of Use</a>.</p>`);

  simplePage('/privacy-policy/', 'Privacy Policy', 'How LeonidaTracker handles your data: progress stored only in your browser, Google Analytics, advertising cookies from Google AdSense, and your choices.', 'Privacy Policy', `
${updated}
<p>This policy explains what information ${esc(site.name)} (${esc(site.url)}) handles and the choices you have.</p>
<h2>Your tracker progress</h2>
<p>Checklist ticks, counters, favourites and preferences are stored in your browser's local storage on your own device. They are never sent to our servers. We do not offer accounts and do not collect names, emails or passwords through the tools. Save codes you export are generated in your browser and stay with you. Clearing your browser's site data deletes this information.</p>
<h2>Analytics</h2>
<p>We use Google Analytics to understand how visitors use the site, such as which pages are read and which countries visits come from. Google Analytics uses cookies or similar technologies and collects information such as pages viewed, approximate location, device and browser type. We do not send names, email addresses or tracker progress to Google Analytics. For visitors in the European Economic Area, the United Kingdom and Switzerland, analytics and advertising storage is turned off by default, so only limited, cookieless measurement is used unless you give consent.</p>
<ul>
  <li>Learn how Google uses this data at <a href="https://policies.google.com/technologies/partner-sites" rel="noopener" target="_blank">policies.google.com/technologies/partner-sites</a>.</li>
  <li>You can opt out of Google Analytics with the <a href="https://tools.google.com/dlpage/gaoptout" rel="noopener" target="_blank">Google Analytics opt-out browser add-on</a>.</li>
</ul>
<h2>Advertising</h2>
<p>This site may display ads served by Google AdSense. Google and its partners use cookies or similar technologies to serve ads based on your prior visits to this and other websites. Google's use of advertising cookies enables it and its partners to serve ads to you based on your visits to this site and/or other sites on the internet.</p>
<ul>
  <li>You can opt out of personalised advertising in <a href="https://myadcenter.google.com/" rel="noopener" target="_blank">Google's My Ad Center</a>.</li>
  <li>You can learn how Google uses information from sites that use its services at <a href="https://policies.google.com/technologies/partner-sites" rel="noopener" target="_blank">policies.google.com/technologies/partner-sites</a>.</li>
  <li>You can opt out of some third-party vendors' use of cookies for personalised advertising at <a href="https://www.aboutads.info/choices/" rel="noopener" target="_blank">aboutads.info</a>.</li>
</ul>
<p>Visitors in the European Economic Area, the United Kingdom and Switzerland are shown a consent message, provided through Google's certified consent management tools, before personalised ads or advertising cookies are used.</p>
<h2>Server logs</h2>
<p>Like any website, our hosting provider may record standard technical information such as IP address, browser type and the pages requested, for security and to keep the site running. We do not use these logs to identify individual visitors.</p>
<h2>Children</h2>
<p>This site is not directed to children under 13, and we do not knowingly collect personal information from children.</p>
<h2>Changes</h2>
<p>If this policy changes, the date at the top will be updated.</p>
<h2>Contact</h2>
<p>Questions about this policy: ${mail}.</p>`);

  simplePage('/terms/', 'Terms of Use', 'The terms for using LeonidaTracker, an unofficial GTA 6 fan site: acceptable use, accuracy, intellectual property and liability.', 'Terms of Use', `
${updated}
<p>By using ${esc(site.name)} you agree to these terms.</p>
<h2>Use of the site</h2>
<p>The tools and guides are free for personal, non-commercial use. Please do not copy guides wholesale onto other websites, scrape the site in bulk, or attempt to disrupt it.</p>
<h2>Accuracy</h2>
<p>We work to keep information accurate and show when it was last checked, but game details can change with updates. Content is provided as is, without warranties of any kind. Always make a backup save before trying cheats or anything that could affect your progress.</p>
<h2>Your data</h2>
<p>Tracker data is stored in your browser. You are responsible for exporting a backup if you want to keep it. We are not liable for progress lost when browser data is cleared.</p>
<h2>Intellectual property</h2>
<p>Original text, code and graphics on this site belong to ${esc(site.name)}. Game names and terms belong to their owners and are used only to identify the game. See the <a href="/disclaimer/">Disclaimer</a>.</p>
<h2>Links</h2>
<p>We may link to other websites. We are not responsible for their content or policies.</p>
<h2>Contact</h2>
<p>${mail}</p>`);

  simplePage('/disclaimer/', 'Disclaimer', 'LeonidaTracker is an unofficial fan resource not affiliated with Rockstar Games or Take-Two Interactive. Trademark and accuracy notice.', 'Disclaimer', `
<p>${esc(site.name)} is an unofficial fan-made website. It is not affiliated with, endorsed, sponsored or approved by Rockstar Games, Inc. or Take-Two Interactive Software, Inc.</p>
<p>Grand Theft Auto, Grand Theft Auto VI, GTA and related names, characters, locations and marks are trademarks or registered trademarks of Take-Two Interactive Software, Inc. They are referenced on this site only to identify the game, which is a nominative use.</p>
<p>No Rockstar artwork, logos, screenshots or copied wiki text are used. All icons and graphics are original vector artwork made for this site.</p>
<p>Information is checked before publishing and dated, but it can change with game updates. Nothing on this site modifies the game or provides downloads.</p>`);
}

/* ------------------------------------------------------------------ *
 * Static files: 404, robots, sitemap, ads.txt, .htaccess, icons
 * ------------------------------------------------------------------ */
function buildStatic() {
  writeFile('assets/styles.css', css);
  writeFile('assets/app.js', js);

  const favicon = icons.logo.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(' aria-hidden="true"', '');
  writeFile('favicon.svg', favicon);
  writeFile('site.webmanifest', JSON.stringify({
    name: site.name, short_name: site.name, start_url: '/', display: 'standalone',
    background_color: '#07060d', theme_color: '#07060d',
    icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }]
  }, null, 2));

  const body404 = `<div class="narrow center" style="padding:4rem 0"><p class="big-num">404</p><h1>That page is off the map</h1><p class="muted">The page you were looking for does not exist or has moved.</p><div class="btn-row" style="justify-content:center"><a class="btn btn-primary" href="/">Home</a><a class="btn" href="/tracker/">Tracker</a><a class="btn" href="/cheats/">Cheats</a><a class="btn" href="/guides/">Guides</a></div></div>`;
  writeFile('404.html', render({ path: '/404.html', title: 'Page not found', description: 'This page could not be found on LeonidaTracker.', body: body404, noindex: true }));

  const og = path.join(ROOT, 'src/assets/og-image.png');
  if (fs.existsSync(og)) writeFile('assets/og-image.png', fs.readFileSync(og));

  const llms = [`# ${site.name}`, '', `> ${site.tagline}`, '',
    'Unofficial fan resource for Grand Theft Auto VI. Cheat codes are listed only after confirmation by multiple independent sources.', '',
    '## Tools',
    `- [100% Tracker](${site.url}/tracker/): checklist and counters for missions, collectibles and cheat challenges`,
    `- [Cheats Database](${site.url}/cheats/): all ${CH.totalInGame} cheats, ${knownCount} verified codes, unlock requirements`,
    `- [Calculators](${site.url}/calculators/): cheat unlock planner, 100% gap check, play-time estimator`, '',
    '## Guides',
    ...guides.map(g => `- [${g.title}](${site.url}/guides/${g.slug}/): ${g.description}`), '',
    '## Cheat code pages',
    ...CH.cheats.filter(hasOwnPage).map(c => `- [${c.name}](${site.url}/cheats/${c.id}/): ${words(c.code)}. Unlock: ${c.unlock}`), ''].join('\n');
  writeFile('llms.txt', llms);

  writeFile('robots.txt', `User-agent: *\nAllow: /\nDisallow: /404.html\n\nSitemap: ${site.url}/sitemap.xml\n`);

  const urls = sitemap.map(u => `  <url>\n    <loc>${esc(u.loc)}</loc>\n    <lastmod>${site.lastUpdated}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`).join('\n');
  writeFile('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);

  if (site.adsense.client) {
    const pub = site.adsense.client.replace(/^ca-/, '');
    writeFile('ads.txt', `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`);
  }

  writeFile('.htaccess', `# LeonidaTracker - Apache / Hostinger (LiteSpeed) config
Options -Indexes
DirectoryIndex index.html
# Never serve version-control files
RedirectMatch 404 /\\.git
ErrorDocument 404 /404.html

<IfModule mod_rewrite.c>
  RewriteEngine On
  # Force HTTPS
  RewriteCond %{HTTPS} !=on
  RewriteCond %{HTTP:X-Forwarded-Proto} !=https
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
  # Force www-less host (delete these two lines if you prefer www)
  RewriteCond %{HTTP_HOST} ^www\\.(.+)$ [NC]
  RewriteRule ^ https://%1%{REQUEST_URI} [L,R=301]
  # Add trailing slash to folder URLs (e.g. /cheats -> /cheats/)
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteCond %{REQUEST_URI} !/$
  RewriteRule ^(.*)$ /$1/ [L,R=301]
</IfModule>

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"
  <FilesMatch "\\.(css|js|svg)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "\\.(html|xml|txt|webmanifest)$">
    Header set Cache-Control "public, max-age=600, must-revalidate"
  </FilesMatch>
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript text/javascript image/svg+xml application/xml text/xml text/plain application/manifest+json
</IfModule>

AddType application/manifest+json .webmanifest
AddType image/svg+xml .svg
`);
}

/* ------------------------------------------------------------------ *
 * Post-build checks: every internal link and asset must resolve
 * ------------------------------------------------------------------ */
function walk(dir, acc = []) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walk(full, acc); else acc.push(full);
  }
  return acc;
}
function verifyOutput() {
  const files = walk(OUT);
  const html = files.filter(f => f.endsWith('.html'));
  const broken = [];
  const titles = new Map();
  for (const f of html) {
    const s = fs.readFileSync(f, 'utf8');
    const t = (s.match(/<title>([^<]*)<\/title>/) || [])[1];
    if (!f.endsWith('404.html')) {
      if (titles.has(t)) broken.push(`Duplicate <title> "${t}" in ${path.relative(OUT, f)} and ${titles.get(t)}`);
      titles.set(t, path.relative(OUT, f));
    }
    const re = /(?:href|src)="(\/[^"#?]*)/g;
    let m;
    while ((m = re.exec(s))) {
      const u = m[1];
      const target = u.endsWith('/') ? path.join(OUT, u, 'index.html') : path.join(OUT, u);
      if (!fs.existsSync(target)) broken.push(`${path.relative(OUT, f)} -> ${u}`);
    }
    // In-page anchors used by TOC must exist
    const anchors = [...s.matchAll(/href="#([^"]+)"/g)].map(x => x[1]);
    anchors.filter(a => a !== 'main').forEach(a => { if (!s.includes(`id="${a}"`)) broken.push(`${path.relative(OUT, f)} -> #${a} (missing anchor)`); });
  }
  if (broken.length) {
    console.error('\nOutput check failed:\n  - ' + broken.join('\n  - '));
    process.exit(1);
  }
  return { files: files.length, html: html.length };
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */
rmrf(OUT);
fs.mkdirSync(OUT, { recursive: true });
buildHome();
buildTracker();
buildCheats();
const cheatPages = buildCheatPages();
buildCalculators();
buildUpdates();
buildGuidesIndex();
const guideWords = guides.map(buildGuide);
buildLegal();
buildStatic();
const stats = verifyOutput();

console.log(`\nLeonidaTracker built into deploy/`);
console.log(`  Site URL:        ${site.url}${site.url.includes('YOURDOMAIN') ? '   <- set "url" in site.config.json before uploading' : ''}`);
console.log(`  Pages (HTML):    ${stats.html}  (${guides.length} guides, ${cheatPages} cheat pages, avg ${Math.round(guideWords.reduce((a, b) => a + b, 0) / guideWords.length)} words of copy + data tables)`);
console.log(`  Files total:     ${stats.files}`);
console.log(`  Sitemap URLs:    ${sitemap.length}`);
console.log(`  Cheats:          ${CH.cheats.length} (${knownCount} with codes)`);
console.log(`  Tracker items:   ${trackedCount}`);
console.log(`  AdSense:         ${site.adsense.client ? 'enabled (' + site.adsense.client + ')' : 'off (add your ca-pub ID in site.config.json once approved)'}`);
if (warnings.length) console.log('\nWarnings:\n  - ' + warnings.join('\n  - '));
