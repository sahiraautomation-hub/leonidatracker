'use strict';
/**
 * Shared layout: <head>, header/nav, ad containers, footer.
 * Pure string templates, no dependencies.
 */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Tiny inline formatter for authored copy: **bold** and [text](/internal/ or https://...) */
function inline(s) {
  let out = esc(s);
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[([^\]]+)\]\(((?:\/|https:\/\/)[^)\s]*)\)/g, (m, text, href) => {
    const ext = href.startsWith('https://');
    return `<a href="${href}"${ext ? ' rel="noopener" target="_blank"' : ''}>${text}</a>`;
  });
  return out;
}

const icons = {
  logo: `<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff3d9a"/><stop offset=".5" stop-color="#ff8a3d"/><stop offset="1" stop-color="#2de2e6"/></linearGradient></defs><rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="#120e22" stroke="url(#lg)" stroke-width="2"/><circle cx="16" cy="15" r="7.5" fill="url(#lg)"/><path d="M6 19h20M7.5 22h17M9.5 25h13" stroke="#120e22" stroke-width="1.6"/><path d="M12.5 15.2l2.4 2.4 4.8-5" fill="none" stroke="#120e22" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12.5l2.8 2.8L16.5 9"/></svg>`,
  gamepad: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 8h11a4 4 0 0 1 3.9 4.8l-.9 4.4a2.3 2.3 0 0 1-4 1L14.6 16H9.4l-1.9 2.2a2.3 2.3 0 0 1-4-1l-.9-4.4A4 4 0 0 1 6.5 8z"/><path d="M8 11v3M6.5 12.5h3M15.5 12h.01M17.5 13.5h.01"/></svg>`,
  calc: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2.5" width="14" height="19" rx="3"/><path d="M8.5 6.5h7M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5v3.5M8.5 18h.01M12 18h.01"/></svg>`,
  book: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M8 7.5h8M8 11h6"/></svg>`,
  map: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4L3 6.5v13.5L9 17.5l6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/></svg>`,
  save: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3M7 21v-7h10v7"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>`,
  star: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.4 8.1-8 9-4.6-.9-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>`
};

const NAV = [
  { href: '/', label: 'Home' },
  { href: '/tracker/', label: 'Tracker' },
  { href: '/cheats/', label: 'Cheats' },
  { href: '/calculators/', label: 'Calculators' },
  { href: '/guides/', label: 'Guides' }
];

/**
 * AdSense-safe ad container. Renders nothing until both the publisher ID and
 * the named slot ID are set in site.config.json, so the approval review never
 * sees empty boxes. Space is reserved in CSS to avoid layout shift.
 */
function adSlot(site, name) {
  const client = site.adsense && site.adsense.client;
  const slot = site.adsense && site.adsense.slots && site.adsense.slots[name];
  if (!client || !slot) return '';
  return `<aside class="ad-wrap" aria-label="Advertisement">
  <span class="ad-label">Advertisement</span>
  <ins class="adsbygoogle" style="display:block" data-ad-client="${esc(client)}" data-ad-slot="${esc(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</aside>`;
}

function header(active) {
  const items = NAV.map(n => {
    const cur = n.href === '/' ? active === '/' : active.startsWith(n.href);
    return `<li><a href="${n.href}"${cur ? ' aria-current="page"' : ''}>${n.label}</a></li>`;
  }).join('');
  return `<a class="skip" href="#main">Skip to content</a>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/" aria-label="LeonidaTracker home">${icons.logo}<span>Leonida<b>Tracker</b></span></a>
    <button class="nav-toggle" type="button" data-nav-toggle aria-controls="site-nav" aria-expanded="false" aria-label="Open menu">${icons.menu}</button>
    <nav id="site-nav" class="site-nav" aria-label="Main"><ul>${items}</ul></nav>
  </div>
</header>`;
}

function footer(site, guidesByCat) {
  const popular = (guidesByCat || []).slice(0, 6).map(g => `<li><a href="/guides/${g.slug}/">${esc(g.short || g.title)}</a></li>`).join('');
  return `<footer class="site-footer">
  <div class="wrap">
    <div class="cols">
      <div>
        <a class="brand" href="/">${icons.logo}<span>Leonida<b>Tracker</b></span></a>
        <p class="mt-2">${esc(site.tagline)}</p>
      </div>
      <div>
        <h3>Tools</h3>
        <ul>
          <li><a href="/tracker/">100% Tracker</a></li>
          <li><a href="/cheats/">Cheats Database</a></li>
          <li><a href="/calculators/">Calculators</a></li>
          <li><a href="/guides/">All Guides</a></li>
        </ul>
      </div>
      <div>
        <h3>Popular guides</h3>
        <ul>${popular}</ul>
      </div>
      <div>
        <h3>Site</h3>
        <ul>
          <li><a href="/about/">About</a></li>
          <li><a href="/updates/">Updates</a></li>
          <li><a href="/contact/">Contact</a></li>
          <li><a href="/privacy-policy/">Privacy Policy</a></li>
          <li><a href="/terms/">Terms of Use</a></li>
          <li><a href="/disclaimer/">Disclaimer</a></li>
        </ul>
      </div>
    </div>
    <p class="legal-note">${esc(site.name)} is an unofficial fan-made resource. It is not affiliated with, endorsed by, or sponsored by Rockstar Games or Take-Two Interactive. Grand Theft Auto, GTA and related names are trademarks of Take-Two Interactive Software, Inc., used here only to identify the game. All guide text and artwork on this site are original. © ${esc(site.year)} ${esc(site.name)}.</p>
  </div>
</footer>`;
}

/**
 * Full HTML document.
 * opts: { site, path, title, description, body, jsonLd[], noindex, data, ogType, footerGuides, assetVersion }
 */
function page(opts) {
  const { site } = opts;
  const url = site.url + opts.path;
  const fullTitle = opts.path === '/' ? opts.title : `${opts.title} | ${site.name}`;
  const ld = (opts.jsonLd || []).map(o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n');
  const dataTag = opts.data ? `<script type="application/json" id="lt-data">${JSON.stringify(opts.data).replace(/</g, '\\u003c')}</script>` : '';
  const adsense = site.adsense && site.adsense.client
    ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(site.adsense.client)}" crossorigin="anonymous"></script>`
    : '';
  const v = opts.assetVersion ? `?v=${opts.assetVersion}` : '';
  const gaId = site.analytics && /^G-[A-Z0-9]+$/.test(site.analytics.measurementId || '') ? site.analytics.measurementId : '';
  // Consent Mode v2: storage is denied by default for visitors in the EEA, UK and
  // Switzerland, so GA sends only cookieless pings there until a consent tool
  // (Google's AdSense consent message, once enabled) grants it. Granted elsewhere.
  const CONSENT_REGIONS = ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IS','IE','IT','LV','LI','LT','LU','MT','NL','NO','PL','PT','RO','SK','SI','ES','SE','GB','CH'];
  const analytics = gaId ? `<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500,region:${JSON.stringify(CONSENT_REGIONS)}});
gtag('consent','default',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});
gtag('js',new Date());gtag('config','${gaId}');
</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=${gaId}"></script>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(opts.description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="robots" content="${opts.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large'}">
<meta name="theme-color" content="#07060d">
<meta name="color-scheme" content="dark">
<meta property="og:type" content="${opts.ogType || 'website'}">
<meta property="og:site_name" content="${esc(site.name)}">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:locale" content="${esc(site.locale || 'en_US')}">
<meta property="og:image" content="${esc(site.url)}/assets/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(site.url)}/assets/og-image.png">
<meta name="twitter:title" content="${esc(opts.title)}">
<meta name="twitter:description" content="${esc(opts.description)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="/site.webmanifest">
<link rel="stylesheet" href="/assets/styles.css${v}">
${analytics}
${adsense}
${ld}
</head>
<body>
${header(opts.path)}
<main id="main">
${opts.body}
</main>
${footer(site, opts.footerGuides)}
${dataTag}
<script src="/assets/app.js${v}" defer></script>
</body>
</html>
`;
}

module.exports = { esc, inline, icons, adSlot, page, NAV };
