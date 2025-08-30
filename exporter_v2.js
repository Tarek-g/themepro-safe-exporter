// Purpose: High-compat "Safe Mirror" exporter for ThemeCo Pro (or any WP page).
// Functionality:
// - Render page post-JS via Playwright
// - Trigger lazy loads (scroll), open common UI (details, tabs, accordions)
// - Collect ALL assets (CSS, JS, images, fonts, media) + entries from Performance API
// - Download assets locally and rewrite references; preserve ALL scripts/styles (no purging)
// - Multi-viewport pass (mobile+desktop) to catch responsive assets
// - Modes: safe (default), balanced (optional JS bundling), aggressive (placeholder for later)
//
// Usage:
// node exporter_v2.js "https://example.com/page" --outfile index.html --mode safe --mobile 390x844 --desktop 1366x900
//
// Notes:
// - Start with --mode safe to guarantee maximum fidelity.
// - Later you can try --mode balanced to bundle JS (still keeps everything).
// - Avoid "aggressive" unless you want to experiment with pruning.

import { chromium } from '@playwright/test';
import fs from 'fs-extra';
import path from 'path';
import { JSDOM } from 'jsdom';
import axios from 'axios';
import * as esbuild from 'esbuild';

const argv = process.argv.slice(2);
const url = argv.find(a => /^https?:\/\//i.test(a));
if (!url) {
  console.error('Usage: node exporter_v2.js "https://example.com/page" [--outfile index.html] [--mode safe|balanced|aggressive] [--mobile WxH] [--desktop WxH]');
  process.exit(1);
}
const outFileArgIndex = argv.indexOf('--outfile');
const outFileName = outFileArgIndex > -1 ? argv[outFileArgIndex + 1] : 'index.html';
const modeArgIndex = argv.indexOf('--mode');
const MODE = (modeArgIndex > -1 ? argv[modeArgIndex + 1] : 'safe').toLowerCase();

function parseSize(flag) {
  const i = argv.indexOf(flag);
  if (i === -1) return null;
  const [w,h] = (argv[i+1] || '').split('x').map(n => parseInt(n,10));
  if (!w || !h) return null;
  return { width: w, height: h };
}

// Updated responsive design breakpoints according to project specifications
const BREAKPOINTS = {
  xs: { width: 375, height: 667 },     // ≤480px - small phones
  sm: { width: 480, height: 854 },     // ≤767px - large phones  
  md: { width: 768, height: 1024 },    // ≤979px - tablets
  lg: { width: 980, height: 1200 },    // ≤1200px - small desktops
  xl: { width: 1366, height: 900 }     // >1200px - large screens
};

const MOBILE = parseSize('--mobile') || BREAKPOINTS.xs;
const TABLET = parseSize('--tablet') || BREAKPOINTS.md;
const DESKTOP = parseSize('--desktop') || BREAKPOINTS.xl;

const DIST_DIR = 'dist';
const ASSETS_DIR = path.join(DIST_DIR, 'assets');
const SMALL_INLINE_MAX = 10 * 1024; // 10KB → inline as data URI (images/fonts) to reduce requests in embeds

function isAbsolute(u) { try { new URL(u); return true; } catch { return false; } }
function toAbsolute(base, u) {
  if (!u) return null;
  if (isAbsolute(u)) return u;
  if (u.startsWith('//')) { const b = new URL(base); return `${b.protocol}${u}`; }
  return new URL(u, base).toString();
}
function localAssetPath(absUrl) {
  const u = new URL(absUrl);
  let p = u.pathname;
  if (p.endsWith('/')) p += 'index.html';
  return path.join(ASSETS_DIR, p);
}
function relFromIndex(absUrl) {
  const u = new URL(absUrl);
  let p = u.pathname;
  if (p.endsWith('/')) p += 'index.html';
  return `./assets${p}`;
}
function isLikelyFont(p) { return /\.(woff2?|ttf|otf|eot)(\?|#|$)/i.test(p); }
function isLikelyImage(p) { return /\.(png|jpe?g|gif|webp|svg|avif)(\?|#|$)/i.test(p); }
function isLikelyCSS(p) { return /\.css(\?|#|$)/i.test(p); }
function isLikelyJS(p) { return /\.m?js(\?|#|$)/i.test(p); }

async function download(absUrl) {
  const res = await axios.get(absUrl, { responseType: 'arraybuffer', timeout: 30000 });
  const buffer = Buffer.from(res.data);
  return { buffer, contentType: res.headers['content-type'] || '', status: res.status };
}
function toDataUri(buffer, contentType, fallbackExt='bin') {
  const ct = contentType || (fallbackExt === 'svg' ? 'image/svg+xml' : 'application/octet-stream');
  const base64 = buffer.toString('base64');
  return `data:${ct};base64,${base64}`;
}

async function openCommonUI(page) {
  // Expand <details>
  await page.evaluate(() => { document.querySelectorAll('details').forEach(d => d.open = true); });
  // Try click common accordion/tab toggles by heuristics (ThemeCo often uses x- classes)
  const selectors = [
    '[aria-controls]', '.accordion [role="button"]', '.tabs [role="tab"]',
    '.x-accordion .x-accordion-toggle', '.x-tab', '.x-toggle', '.x-nav-tabs [role="tab"]'
  ];
  for (const sel of selectors) {
    const handles = await page.$$(sel);
    for (const h of handles) { try { await h.click({ timeout: 200, force: true }); } catch {} }
  }
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let total = 0;
      const step = () => {
        const { scrollTop, scrollHeight, clientHeight } = document.scrollingElement || document.documentElement;
        const atEnd = scrollTop + clientHeight >= scrollHeight - 2;
        if (atEnd || total > 30) return resolve();
        window.scrollBy(0, clientHeight * 0.9);
        total++;
        setTimeout(step, 150);
      };
      step();
    });
  });
}

async function renderMultiViewport(browser, targetUrl) {
  console.log('🔄 Rendering multiple viewports for comprehensive responsive asset capture...');
  
  const results = [];
  
  // Render all breakpoints to capture responsive assets
  for (const [name, size] of Object.entries(BREAKPOINTS)) {
    console.log(`📱 Rendering ${name} viewport (${size.width}x${size.height})`);
    const result = await renderAndCollect(browser, targetUrl, size);
    results.push({ name, size, ...result });
    
    // Small delay between renders to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  return results;
}

async function renderAndCollect(browser, targetUrl, size) {
  const page = await browser.newPage({ viewport: size });
  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await openCommonUI(page);
  await autoScroll(page);
  // small wait for lazy assets
  await page.waitForTimeout(800);
  const html = await page.content();

  const resources = await page.evaluate(() => {
    const entries = performance.getEntriesByType('resource') || [];
    return entries.map(e => e.name).filter(Boolean);
  });

  await page.close();
  return { html, resources };
}

function extractDomAssets(baseUrl, html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const assets = new Set();

  // stylesheets
  doc.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
    const href = l.getAttribute('href'); const abs = toAbsolute(baseUrl, href);
    if (abs) assets.add(abs);
  });
  // scripts
  doc.querySelectorAll('script[src]').forEach(s => {
    const src = s.getAttribute('src'); const abs = toAbsolute(baseUrl, src);
    if (abs) assets.add(abs);
  });
  // images & srcset
  doc.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src') || img.getAttribute('data-src');
    const abs = toAbsolute(baseUrl, src); if (abs) assets.add(abs);
    const srcset = img.getAttribute('srcset');
    if (srcset) {
      srcset.split(',').forEach(part => {
        const urlOnly = part.trim().split(' ')[0];
        const a = toAbsolute(baseUrl, urlOnly); if (a) assets.add(a);
      });
    }
  });
  // video/audio/source
  doc.querySelectorAll('video, audio, source').forEach(el => {
    const src = el.getAttribute('src'); const abs = toAbsolute(baseUrl, src);
    if (abs) assets.add(abs);
  });
  // CSS @import in <style> tags (basic)
  doc.querySelectorAll('style').forEach(st => {
    const txt = st.textContent || '';
    const re = /@import\s+url\((['"]?)([^'")]+)\1\)/g;
    let m; while ((m = re.exec(txt))) {
      const a = toAbsolute(baseUrl, m[2]); if (a) assets.add(a);
    }
  });

  return { dom, doc, assets: Array.from(assets) };
}

async function ensureDirAndWrite(filePath, buffer) {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, buffer);
}

async function main() {
  await fs.emptyDir(DIST_DIR);
  await fs.ensureDir(ASSETS_DIR);

  console.log(`🚀 Starting export of: ${url}`);
  console.log(`📐 Using responsive breakpoints: XS(375), SM(480), MD(768), LG(980), XL(1366)`);

  const browser = await chromium.launch();
  
  // Multi-viewport rendering for comprehensive responsive capture
  const viewportResults = await renderMultiViewport(browser, url);
  
  await browser.close();

  // Use the largest viewport (desktop) as base HTML
  const baseResult = viewportResults.find(r => r.name === 'xl') || viewportResults[viewportResults.length - 1];
  let baseHTML = baseResult.html;

  // Collect all resources from all viewports
  const allResources = new Set();
  viewportResults.forEach(result => {
    result.resources.forEach(resource => allResources.add(resource));
  });

  console.log(`📆 Captured ${allResources.size} unique resources across ${viewportResults.length} viewports`);

  // Union of resources from performance + DOM parsing
  const { dom, doc, assets: domAssets } = extractDomAssets(url, baseHTML);
  const combinedAssets = new Set([...domAssets, ...allResources].filter(Boolean));

  // Remove <base> tags to avoid path confusion
  doc.querySelectorAll('base').forEach(b => b.remove());

  // Download each asset and rewrite references
  const cssFiles = [];
  const jsFiles = [];
  const otherFiles = [];

  // Map for rewriting
  const rewriteMap = new Map();

  console.log(`⬇️ Downloading ${combinedAssets.size} assets...`);

  for (const assetUrl of combinedAssets) {
    try {
      const outPath = localAssetPath(assetUrl);
      const rel = relFromIndex(assetUrl);
      const { buffer, contentType } = await download(assetUrl);

      // Inline tiny images/fonts to harden portability
      if ((isLikelyImage(assetUrl) || isLikelyFont(assetUrl)) && buffer.length <= SMALL_INLINE_MAX) {
        rewriteMap.set(assetUrl, toDataUri(buffer, contentType, isLikelyImage(assetUrl) ? 'png' : 'woff2'));
        console.log(`📦 Inlined small asset: ${assetUrl} (${buffer.length} bytes)`);
      } else {
        await ensureDirAndWrite(outPath, buffer);
        rewriteMap.set(assetUrl, rel);
        if (isLikelyCSS(assetUrl)) cssFiles.push(outPath);
        else if (isLikelyJS(assetUrl)) jsFiles.push(outPath);
        else otherFiles.push(outPath);
        console.log(`💾 Downloaded: ${assetUrl}`);
      }
    } catch (e) {
      // If third-party blocked by CORS for fetch, keep original URL (still works online)
      rewriteMap.set(assetUrl, assetUrl);
      console.log(`⚠️ CORS blocked, keeping original URL: ${assetUrl}`);
    }
  }

  // Rewrite DOM references
  // links
  doc.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
    const href = l.getAttribute('href');
    const abs = toAbsolute(url, href);
    if (abs && rewriteMap.has(abs)) l.setAttribute('href', rewriteMap.get(abs));
  });
  // scripts
  doc.querySelectorAll('script[src]').forEach(s => {
    const src = s.getAttribute('src');
    const abs = toAbsolute(url, src);
    if (abs && rewriteMap.has(abs)) s.setAttribute('src', rewriteMap.get(abs));
  });
  // images
  doc.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src') || img.getAttribute('data-src');
    const abs = toAbsolute(url, src);
    if (abs && rewriteMap.has(abs)) img.setAttribute('src', rewriteMap.get(abs));
    const srcset = img.getAttribute('srcset');
    if (srcset) {
      const out = srcset.split(',').map(part => {
        const [u, w] = part.trim().split(' ');
        const a = toAbsolute(url, u);
        const mapped = a && rewriteMap.has(a) ? rewriteMap.get(a) : u;
        return [mapped, w].filter(Boolean).join(' ');
      }).join(', ');
      img.setAttribute('srcset', out);
    }
  });
  // media
  doc.querySelectorAll('video, audio, source').forEach(el => {
    const src = el.getAttribute('src');
    const abs = toAbsolute(url, src);
    if (abs && rewriteMap.has(abs)) el.setAttribute('src', rewriteMap.get(abs));
  });

  // Optional: JS bundling in balanced mode (keeps all scripts)
  if (MODE === 'balanced' && jsFiles.length) {
    const out = path.join(ASSETS_DIR, 'app.bundle.js');
    await esbuild.build({
      entryPoints: jsFiles,
      bundle: true,
      minify: true,
      sourcemap: false,
      platform: 'browser',
      target: ['es2018'],
      outfile: out,
      logLevel: 'silent',
      allowOverwrite: true
    });
    // Remove original <script src> tags and append one tag to bundle
    doc.querySelectorAll('script[src]').forEach(s => s.remove());
    const tag = doc.createElement('script');
    tag.setAttribute('src', './assets/app.bundle.js');
    doc.body.appendChild(tag);
  }

  // Write final HTML
  const finalHTML = '<!doctype html>\n' + doc.documentElement.outerHTML;
  await fs.writeFile(path.join(DIST_DIR, outFileName), finalHTML, 'utf-8');

  // Enhanced manifest with viewport information
  await fs.writeJson(path.join(DIST_DIR, 'manifest.json'), {
    sourceUrl: url,
    mode: MODE,
    viewports: viewportResults.map(r => ({ 
      name: r.name, 
      size: r.size, 
      resourceCount: r.resources.length 
    })),
    totalAssets: combinedAssets.size,
    inlinedAssets: Array.from(rewriteMap.entries()).filter(([, v]) => v.startsWith('data:')).length,
    note: "Safe Mirror export with multi-viewport responsive asset capture. Third-party blocked downloads keep original remote URLs.",
    exportDate: new Date().toISOString()
  }, { spaces: 2 });

  console.log(`✅ Export complete → ${path.join(DIST_DIR, outFileName)} (mode=${MODE})`);
  console.log(`📱 Responsive viewports tested: ${viewportResults.length}`);
  console.log(`💾 Total assets downloaded: ${combinedAssets.size}`);
  console.log(`📦 Assets inlined as data URIs: ${Array.from(rewriteMap.values()).filter(v => v.startsWith('data:')).length}`);
}

main().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});