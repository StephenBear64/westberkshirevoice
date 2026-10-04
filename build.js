// Builds the West Berkshire Voice website into the _site folder.
// Run with: node build.js   (no packages to install)
//
//   stories/*.json   one file per news story (edited through the CMS)
//   pages/*.html     the wording of the fixed pages
//   layout.html      the shared header, menu and footer
//   static/          stylesheet, icons and pictures, copied as they are
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, '_site');
const HOME_STORIES = 5;
// Drafts are hidden on the live site but shown on preview copies.
const branch = process.env.CF_PAGES_BRANCH || '';
const SHOW_DRAFTS = branch !== '' && branch !== 'main';

const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NAV = [['index.html', 'Home'], ['news.html', 'News'], ['about.html', 'About'], ['get-involved.html', 'Get Involved'], ['contact.html', 'Contact']];
const layout = read('layout.html');
const band = read('pages', '_band.html').trim();
const pageMeta = JSON.parse(read('pages', 'pages.json'));

function page({ title, description, nav, main, showBand = true, noindex = false }) {
  const links = NAV.map(([href, label]) => `<a href="${href}"${href === nav ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  const meta = (noindex || SHOW_DRAFTS) ? '<meta name="robots" content="noindex">' : `<meta name="description" content="${esc(description)}">`;
  return layout
    .replace('{{title}}', () => esc(title))
    .replace('{{meta}}', () => meta)
    .replace('{{nav}}', () => links)
    .replace('{{main}}', () => main)
    .replace('{{band}}', () => (showBand ? band : ''));
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function longDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!m) return '';
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

// The editor may save the story text as HTML or as Markdown. HTML is used as it is;
// Markdown gets a simple conversion (paragraphs, headings, lists, bold, italic, links, pictures).
function inline(text) {
  return esc(text)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}
function bodyHtml(body) {
  const text = String(body || '').trim();
  if (!text) return '';
  if (/<(p|h2|h3|ul|ol|figure|blockquote|div)[\s>]/i.test(text)) return text;
  return text.split(/\n\s*\n/).map((block) => {
    const b = block.trim();
    if (!b) return '';
    const h = /^(#{2,3})\s+(.*)$/.exec(b);
    if (h) return `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
    const lines = b.split('\n');
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`;
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\s*\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
    return `<p>${inline(lines.join(' '))}</p>`;
  }).join('\n');
}

// ---- Load the stories, newest first
const storyDir = path.join(ROOT, 'stories');
const problems = [];
const stories = fs.readdirSync(storyDir).filter((f) => f.endsWith('.json')).map((file) => {
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(storyDir, file), 'utf8')); } catch (e) { problems.push(`${file}: not valid JSON (${e.message})`); return null; }
  const slug = file.replace(/\.json$/, '');
  if (!data.title) problems.push(`${file}: no headline`);
  if (!longDate(data.date)) problems.push(`${file}: no date`);
  return { ...data, slug, url: `${slug}.html` };
}).filter(Boolean)
  .filter((s) => s.title && longDate(s.date))
  .filter((s) => SHOW_DRAFTS || !s.draft)
  .sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.title.localeCompare(b.title));

// ---- Safety check: every picture a story uses must exist in static/.
// On the live site a missing picture stops the build, so the last good version stays online.
// On preview and drafts copies the story is shown with a "Picture missing" box instead.
const IS_LIVE = branch === 'main';
const missing = [];
const localExists = (src) => !/^\/img\//.test(src) || fs.existsSync(path.join(ROOT, 'static', decodeURIComponent(src.split(/[?#]/)[0])));
// The caption goes under the picture; the credit sits over its bottom left corner.
const caption = (text) => (text ? `<figcaption>${esc(text)}</figcaption>` : '');
const pic = (img, credit) => `<span class="pic">${img}${credit ? `<span class="credit">Picture: ${esc(credit)}</span>` : ''}</span>`;
for (const s of stories) {
  // A story is a list of blocks: text and pictures. Older stories with a single "body" still work.
  s.parts = Array.isArray(s.content) && s.content.length ? s.content : [{ type: 'text', text: s.body || '' }];
  if (s.image && !localExists(s.image)) { missing.push(`${s.slug}: main picture ${s.image}`); s.imageMissing = true; }
  for (const part of s.parts) {
    if (part.type === 'picture' && part.image && !localExists(part.image)) { missing.push(`${s.slug}: picture in the story ${part.image}`); part.missing = true; }
    for (const m of String(part.text || '').matchAll(/<img[^>]+src="([^"]+)"/g)) {
      if (!localExists(m[1])) missing.push(`${s.slug}: picture in the story text ${m[1]}`);
    }
  }
}
if (missing.length) {
  console.log('Pictures missing from static/img:\n  ' + missing.join('\n  '));
  if (IS_LIVE) { console.error('Build stopped: restore the missing pictures or remove them from the stories.'); process.exit(1); }
}
// ---- House rule: news pictures are 16:9. Read each uploaded picture's size so the drafts copy can warn about other shapes.
function pictureSize(file) {
  try {
    const b = fs.readFileSync(file);
    if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b.toString('latin1', 0, 3) === 'GIF') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
    if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
      const kind = b.toString('latin1', 12, 16);
      if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
      if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
      if (kind === 'VP8L') { const n = b.readUInt32LE(21); return { w: 1 + (n & 0x3fff), h: 1 + ((n >> 14) & 0x3fff) }; }
      return null;
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2, turned = false;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i += 1; continue; }
        const m = b[i + 1];
        if (m === 0xff) { i += 1; continue; }
        if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
        const len = b.readUInt16BE(i + 2);
        // Phone photos are often stored sideways with a note saying how to turn them.
        if (m === 0xe1 && b.toString('latin1', i + 4, i + 8) === 'Exif') {
          const t = i + 10, le = b.toString('latin1', t, t + 2) === 'II';
          const u16 = (o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
          const u32 = (o) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
          const ifd = t + u32(t + 4), n = u16(ifd);
          for (let k = 0; k < n; k += 1) { const e = ifd + 2 + k * 12; if (u16(e) === 0x0112) turned = u16(e + 8) >= 5; }
        }
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          const h = b.readUInt16BE(i + 5), w = b.readUInt16BE(i + 7);
          return turned ? { w: h, h: w } : { w, h };
        }
        i += 2 + len;
      }
    }
  } catch (e) { /* unreadable: no warning */ }
  return null;
}
// True when an uploaded picture is clearly not 16:9. Pictures hosted elsewhere cannot be checked.
function wrongShape(src) {
  if (!/^\/img\//.test(String(src || ''))) return false;
  const size = pictureSize(path.join(ROOT, 'static', decodeURIComponent(src.split(/[?#]/)[0])));
  return !!size && size.h > 0 && Math.abs(size.w / size.h - 16 / 9) > 0.04;
}
const SHAPE_WARNING = '<p class="shape-warning"><strong>This picture is not 16:9.</strong> Part of it is being cut off, so it is likely not to look good online. <a href="crop.html">Crop it with the crop tool</a>, then upload the cropped picture in its place. This story will not appear on the live site until that is done. This message is only shown on the drafts copy.</p>\n';
const notOurs = (src) => /^(https?:)?\/\//i.test(String(src || ''));
// On the live site a story with a picture that is not 16:9, or is linked from another website, is held back, as if it were still a draft.
// Everything else publishes as normal, so one wrongly shaped picture never holds up other stories.
if (IS_LIVE) {
  for (let i = stories.length - 1; i >= 0; i -= 1) {
    const s = stories[i];
    const wrong = [];
    if (s.image && !s.imageMissing && (notOurs(s.image) || wrongShape(s.image))) wrong.push(s.image);
    for (const part of s.parts) if (part.type === 'picture' && part.image && !part.missing && (notOurs(part.image) || wrongShape(part.image))) wrong.push(part.image);
    for (const part of s.parts) for (const m of String(part.text || '').matchAll(/<img[^>]+src="([^"]+)"/g)) if (notOurs(m[1])) wrong.push(m[1]);
    if (wrong.length) { console.log(`Held back, not published (picture not 16:9 or not hosted on our site): ${s.slug}\n  ${wrong.join('\n  ')}`); stories.splice(i, 1); }
  }
}
// House rule: every picture is hosted on our own site, never linked from someone else's.
const linkedElsewhere = (src) => /^(https?:)?\/\//i.test(String(src || ''));
const LINK_WARNING = '<p class="shape-warning"><strong>This picture is linked from another website.</strong> All pictures must be uploaded to our own site. Download it, <a href="crop.html">crop it with the crop tool</a> if needed, then upload it in its place. This story will not appear on the live site until that is done. This message is only shown on the drafts copy.</p>\n';
const shapeWarning = (src) => (!SHOW_DRAFTS ? '' : linkedElsewhere(src) ? LINK_WARNING : wrongShape(src) ? SHAPE_WARNING : '');
const MISSING_BOX = '<span class="ph">Picture missing</span>';

function storyItem(s) {
  const thumb = s.image ? `<a class="thumb" href="${s.url}" tabindex="-1" aria-hidden="true">${s.imageMissing ? MISSING_BOX : `<img src="${esc(s.image)}" alt="" loading="lazy">`}</a>\n` : '';
  const where = [s.town, longDate(s.date)].filter(Boolean).map(esc).join(' · ');
  return `<article class="newsitem">\n${thumb}<div><p class="meta">${where}${s.draft ? ' · DRAFT' : ''}</p>\n<h2><a href="${s.url}">${esc(s.title)}</a></h2>\n<p>${esc(s.summary)}</p></div>\n</article>`;
}

function storyPage(s) {
  const figure = s.image ? `${s.imageMissing ? '' : shapeWarning(s.image)}<figure>${pic(s.imageMissing ? MISSING_BOX : `<img src="${esc(s.image)}" alt="${esc(s.imageAlt)}">`, s.credit)}${caption(s.caption)}</figure>\n` : '';
  const parts = s.parts.map((part) => {
    if (part.type === 'picture') {
      if (!part.image) return '';
      return `${part.missing ? '' : shapeWarning(part.image)}<figure class="inline">${pic(part.missing ? MISSING_BOX : `<img src="${esc(part.image)}" alt="${esc(part.imageAlt || part.caption)}">`, part.credit)}${caption(part.caption)}</figure>`;
    }
    return (SHOW_DRAFTS && /<img[^>]+src="(https?:)?\/\//i.test(String(part.text || '')) ? LINK_WARNING : '') + bodyHtml(part.text);
  }).filter(Boolean).join('\n');
  const main = `<article class="story">${s.town ? `<p class="kicker">${esc(s.town)}</p>` : ''}
<h1>${esc(s.title)}</h1>
<p class="meta">Published ${longDate(s.date)}${s.draft ? ' · DRAFT, not shown on the live site' : ''}</p>
${String(s.byline || '').trim() ? `<p class="byline">By ${esc(String(s.byline).trim().replace(/^by\s+/i, ''))}</p>\n` : ''}${figure}${s.summary ? `<p class="intro">${esc(s.summary)}</p>\n` : ''}${parts}
<p><a href="news.html">More news</a></p>
</article>`;
  return page({ title: `${s.title} | West Berkshire Voice`, description: s.summary || s.title, nav: 'news.html', main });
}

// ---- Write the site
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(path.join(ROOT, 'static'), OUT, { recursive: true, filter: (src) => path.basename(src) !== '.gitkeep' });
const write = (name, html) => fs.writeFileSync(path.join(OUT, name), html);

const latest = stories.slice(0, HOME_STORIES);
const latestBlock = latest.length ? `<section class="latest" aria-labelledby="latest-h">
<h2 id="latest-h">Latest news</h2>
<div class="newslist">
${latest.map(storyItem).join('\n')}
</div>
<p class="more"><a href="news.html">All news</a></p>
</section>\n` : '';
write('index.html', page({ ...pageMeta.index, showBand: pageMeta.index.band, main: `${read('pages', 'home-top.html').trim()}\n${latestBlock}${read('pages', 'home-bottom.html').trim()}` }));

write('news.html', page({
  title: 'News | West Berkshire Voice', description: 'News from West Berkshire Voice.', nav: 'news.html',
  main: `<div class="prose"><p class="kicker">News</p>\n<h1>News</h1></div>\n<div class="newslist">\n${stories.length ? stories.map(storyItem).join('\n') : '<p>No stories yet.</p>'}\n</div>`,
}));

for (const s of stories) write(s.url, storyPage(s));

for (const key of ['about', 'get-involved', 'contact', 'thanks', 'crop']) {
  const m = pageMeta[key];
  write(`${key}.html`, page({ title: m.title, description: m.description, nav: m.nav, showBand: m.band, noindex: m.noindex, main: read('pages', `${key}.html`).trim() }));
}

console.log(`Built ${stories.length} stories (${SHOW_DRAFTS ? 'drafts shown' : 'drafts hidden'}), home page shows ${latest.length}.`);
if (problems.length) console.log('Skipped or incomplete:\n  ' + problems.join('\n  '));
