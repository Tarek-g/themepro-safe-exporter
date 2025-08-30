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

import { chromium } from 'playwright';
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
const SMALL_INLINE_MAX = 5 * 1024; // 5KB → inline only tiny images (NOT fonts) to avoid font loading/FCP issues

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
  try {
    // Check if page is still valid at the start
    if (page.isClosed()) {
      console.log('⚠️ Page already closed, skipping UI interactions');
      return;
    }

    // Wait for page to be stable before interacting
    await page.waitForLoadState('domcontentloaded').catch(() => {
      console.log('⚠️ Page navigation interrupted domcontentloaded wait');
    });
    
    // Check again after waiting
    if (page.isClosed()) return;

    // Expand <details> with error handling
    try {
      await page.evaluate(() => { 
        document.querySelectorAll('details').forEach(d => d.open = true); 
      });
    } catch (e) {
      if (e.message.includes('Execution context was destroyed')) {
        console.log('⚠️ UI interaction interrupted by navigation during details expansion');
        return;
      }
    }
    
    // Try click common accordion/tab toggles by heuristics (ThemeCo often uses x- classes)
    const selectors = [
      '[aria-controls]', '.accordion [role="button"]', '.tabs [role="tab"]',
      '.x-accordion .x-accordion-toggle', '.x-tab', '.x-toggle', '.x-nav-tabs [role="tab"]'
    ];
    
    for (const sel of selectors) {
      try {
        // Check if page is still valid before each selector
        if (page.isClosed()) {
          console.log('⚠️ Page closed during selector iteration, stopping UI interactions');
          break;
        }
        
        const handles = await page.$$(sel).catch((e) => {
          if (e.message.includes('Execution context was destroyed')) {
            console.log('⚠️ Execution context destroyed during element query, stopping UI interactions');
          }
          return [];
        });
        
        for (const h of handles) { 
          try { 
            if (!page.isClosed()) {
              await h.click({ timeout: 200, force: true }); 
            }
          } catch (clickError) {
            // Ignore individual click errors but log context destruction
            if (clickError.message.includes('Execution context was destroyed')) {
              console.log('⚠️ Click interrupted by navigation');
              return;
            }
          } 
        }
      } catch (e) {
        // Skip selector if execution context is destroyed
        if (e.message.includes('Execution context was destroyed')) {
          console.log('⚠️ Selector processing interrupted by navigation');
          break;
        }
      }
    }
  } catch (e) {
    // Log error but don't fail the entire export
    if (e.message.includes('Execution context was destroyed')) {
      console.log('⚠️ UI interaction completely interrupted by page navigation');
    } else {
      console.log('⚠️ UI interaction failed:', e.message);
    }
  }
}

async function autoScroll(page) {
  try {
    // Check if page is valid before scrolling
    if (page.isClosed()) {
      console.log('⚠️ Page closed, skipping auto-scroll');
      return;
    }

    await page.evaluate(async () => {
      await new Promise(resolve => {
        let total = 0;
        const step = () => {
          try {
            const { scrollTop, scrollHeight, clientHeight } = document.scrollingElement || document.documentElement;
            const atEnd = scrollTop + clientHeight >= scrollHeight - 2;
            if (atEnd || total > 30) return resolve();
            window.scrollBy(0, clientHeight * 0.9);
            total++;
            setTimeout(step, 150);
          } catch (e) {
            // Handle any scrolling errors gracefully
            resolve();
          }
        };
        step();
      });
    });
  } catch (e) {
    // Handle execution context destroyed during scrolling
    if (e.message.includes('Execution context was destroyed')) {
      console.log('⚠️ Auto-scroll interrupted by navigation');
    } else {
      console.log('⚠️ Auto-scroll failed:', e.message);
    }
  }
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

async function waitForNetworkIdle(page, idleMs = 500, timeoutMs = 15000) {
  let inflight = 0; let fulfill;
  const idle = new Promise(res => (fulfill = res));
  const onReq = () => inflight++;
  const onDone = () => { inflight = Math.max(0, inflight - 1); if (inflight === 0) timer(); };

  let timerId; const timer = () => { clearTimeout(timerId); timerId = setTimeout(fulfill, idleMs); };
  page.on('request', onReq);
  page.on('requestfinished', onDone);
  page.on('requestfailed', onDone);

  const t = setTimeout(() => fulfill(), timeoutMs);
  // kick
  if (inflight === 0) timer();
  await idle;
  clearTimeout(t);
  page.off('request', onReq);
  page.off('requestfinished', onDone);
  page.off('requestfailed', onDone);
}

async function renderAndCollect(browser, targetUrl, size) {
  const page = await browser.newPage({ viewport: size });
  const reqUrls = new Set();

  try {
    // Capture ALL network requests to avoid missing cross-origin resources
    page.on('requestfinished', req => {
      try { 
        const u = req.url(); 
        if (u) reqUrls.add(u); 
      } catch {}
    });

    // Navigate with extended timeout and wait for network stability
    await page.goto(targetUrl, { 
      waitUntil: 'domcontentloaded', 
      timeout: 60000 
    });
    
    // Wait for network to settle before interacting
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {
      console.log('⚠️ Network idle wait timeout - proceeding with interactions');
    });
    
    // Small delay to ensure page is fully stable
    await page.waitForTimeout(1000);
    
    // Try UI interactions with comprehensive error handling
    try {
      await openCommonUI(page);
    } catch (e) {
      if (e.message.includes('Execution context was destroyed')) {
        console.log('⚠️ UI interactions skipped due to navigation during openCommonUI');
      }
    }
    
    try {
      await autoScroll(page);
    } catch (e) {
      if (e.message.includes('Execution context was destroyed')) {
        console.log('⚠️ Auto-scroll skipped due to navigation');
      }
    }
    
    // Wait for fonts to settle
    try { 
      if (!page.isClosed()) {
        await page.evaluate(() => window.document.fonts && window.document.fonts.ready); 
      }
    } catch (e) {
      if (e.message.includes('Execution context was destroyed')) {
        console.log('⚠️ Font loading wait interrupted by navigation');
      }
    }
    
    // Additional network idle wait for late-loading assets
    try {
      await waitForNetworkIdle(page, 500, 10000);
    } catch (e) {
      console.log('⚠️ Network idle wait failed, continuing anyway');
    }
    
    let html = '';
    try {
      html = await page.content();
    } catch (e) {
      if (e.message.includes('Execution context was destroyed')) {
        console.log('⚠️ Could not get page content due to navigation, using empty HTML');
        html = '<html><head></head><body><!-- Page content unavailable due to navigation --></body></html>';
      } else {
        throw e;
      }
    }

    // Get resources from both Performance API and network capture
    let perfResources = [];
    try {
      if (!page.isClosed()) {
        perfResources = await page.evaluate(() => {
          try {
            const entries = performance.getEntriesByType('resource') || [];
            return entries.map(e => e.name).filter(Boolean);
          } catch {
            return [];
          }
        });
      }
    } catch (e) {
      if (e.message.includes('Execution context was destroyed')) {
        console.log('⚠️ Performance API access interrupted by navigation');
      }
      perfResources = [];
    }

    // Merge network-captured URLs with Performance API results
    const allResources = [...new Set([...perfResources, ...reqUrls])];

    return { html, resources: allResources };
  } finally {
    // Always close the page, even if errors occurred
    try {
      await page.close();
    } catch {}
  }
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

  // <source> in <picture>/<video>/<audio> with srcset support
  doc.querySelectorAll('source').forEach(s => {
    const src = s.getAttribute('src');
    const srcset = s.getAttribute('srcset');
    if (src) { const a = toAbsolute(baseUrl, src); if (a) assets.add(a); }
    if (srcset) {
      srcset.split(',').forEach(part => {
        const u = part.trim().split(' ')[0];
        const a = toAbsolute(baseUrl, u); if (a) assets.add(a);
      });
    }
  });

  // preload/prefetch & modulepreload (fonts, images, scripts)
  doc.querySelectorAll('link[rel="preload"],link[rel="prefetch"],link[rel="modulepreload"]').forEach(l => {
    const href = l.getAttribute('href'); const a = toAbsolute(baseUrl, href); if (a) assets.add(a);
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

function generateExportReport(data) {
  const {
    url, mode, viewportResults, combinedAssets, rewriteMap, 
    cssFiles, jsFiles, otherFiles, allResources, domAssets
  } = data;

  // Count different asset types
  const inlinedAssets = Array.from(rewriteMap.values()).filter(v => v.startsWith('data:')).length;
  const blockedAssets = Array.from(rewriteMap.entries()).filter(([original, mapped]) => 
    original === mapped && (original.startsWith('http') || original.startsWith('//'))  
  ).length;
  
  // Network-only assets (captured by network events but not in DOM)
  const domAssetUrls = new Set(domAssets);
  const networkOnlyAssets = Array.from(allResources).filter(url => !domAssetUrls.has(url)).length;
  
  // Interactive elements that were opened (from openCommonUI)
  const interactiveSelectors = [
    '[aria-controls]', '.accordion [role="button"]', '.tabs [role="tab"]',
    '.x-accordion .x-accordion-toggle', '.x-tab', '.x-toggle', '.x-nav-tabs [role="tab"]'
  ];
  
  // Assets breakdown by type
  const assetBreakdown = {
    css: cssFiles.length,
    js: jsFiles.length,
    images: Array.from(combinedAssets).filter(url => isLikelyImage(url)).length,
    fonts: Array.from(combinedAssets).filter(url => url.includes('.woff') || url.includes('.ttf') || url.includes('.eot')).length,
    other: otherFiles.length
  };
  
  // Blocked assets details
  const blockedAssetsList = Array.from(rewriteMap.entries())
    .filter(([original, mapped]) => original === mapped && (original.startsWith('http') || original.startsWith('//')  ))
    .map(([url]) => {
      const reason = 'CORS/Network restriction';
      return { url, reason };
    });
    
  // Network-only assets details  
  const networkOnlyAssetsList = Array.from(allResources)
    .filter(url => !domAssetUrls.has(url))
    .map(url => ({ url, source: 'network_capture' }));

  return {
    sourceUrl: url,
    mode,
    timestamp: new Date().toISOString(),
    summary: {
      totalAssets: combinedAssets.size,
      inlinedAssets,
      blockedAssets,
      networkOnlyAssets,
      interactiveElements: interactiveSelectors.length
    },
    viewports: viewportResults.map(r => ({
      name: r.name,
      size: r.size,
      resourceCount: r.resources.length
    })),
    assetBreakdown,
    blockedAssetsList,
    networkOnlyAssetsList,
    recommendations: [
      blockedAssets > 0 ? `${blockedAssets} assets remain as remote URLs due to CORS restrictions` : null,
      networkOnlyAssets > 0 ? `${networkOnlyAssets} assets were captured only through network monitoring` : null,
      inlinedAssets > 0 ? `${inlinedAssets} small assets were inlined as data URIs for better performance` : null
    ].filter(Boolean)
  };
}

// Helper to rewrite URLs and remove integrity when using local assets
function rewriteTagUrl(el, attrName, baseUrl, rewriteMap) {
  const val = el.getAttribute(attrName);
  const abs = toAbsolute(baseUrl, val);
  if (abs && rewriteMap.has(abs)) {
    const mapped = rewriteMap.get(abs);
    el.setAttribute(attrName, mapped);
    // Remove integrity when using local files to avoid SRI failures
    if (mapped.startsWith('./assets')) {
      el.removeAttribute('integrity');
    }
  }
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

      // Inline only tiny images (NOT fonts) to avoid font loading/FCP issues
      if (isLikelyImage(assetUrl) && buffer.length <= SMALL_INLINE_MAX) {
        rewriteMap.set(assetUrl, toDataUri(buffer, contentType, 'png'));
        console.log(`📦 Inlined small image: ${assetUrl} (${buffer.length} bytes)`);
      } else {
        // Write to disk (fonts always go here for better performance)
        await ensureDirAndWrite(outPath, buffer);
        rewriteMap.set(assetUrl, rel);
        if (isLikelyCSS(assetUrl)) cssFiles.push(outPath);
        else if (isLikelyJS(assetUrl)) jsFiles.push(outPath);
        else otherFiles.push(outPath);
        console.log(`💾 Downloaded: ${assetUrl}`);
      }
    } catch (e) {
      // If third-party blocked by CORS/CORP, keep original URL (still works online)
      rewriteMap.set(assetUrl, assetUrl);
      const errorType = e.message.includes('CORS') ? 'CORS' : 
                       e.message.includes('CORP') ? 'CORP' : 'Network';
      console.log(`⚠️ ${errorType} blocked, keeping original URL: ${assetUrl}`);
    }
  }

  // Rewrite DOM references using helper function to handle integrity removal
  // stylesheets and preload links
  doc.querySelectorAll('link[rel="stylesheet"], link[rel="preload"], link[rel="modulepreload"], link[rel="prefetch"]').forEach(l => {
    rewriteTagUrl(l, 'href', url, rewriteMap);
  });
  // scripts
  doc.querySelectorAll('script[src]').forEach(s => {
    rewriteTagUrl(s, 'src', url, rewriteMap);
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
  // media elements and <source> with srcset support
  doc.querySelectorAll('video, audio, source').forEach(el => {
    rewriteTagUrl(el, 'src', url, rewriteMap);
    // Handle srcset in <source> elements
    const srcset = el.getAttribute('srcset');
    if (srcset) {
      const out = srcset.split(',').map(part => {
        const [u, w] = part.trim().split(' ');
        const a = toAbsolute(url, u);
        const mapped = a && rewriteMap.has(a) ? rewriteMap.get(a) : u;
        return [mapped, w].filter(Boolean).join(' ');
      }).join(', ');
      el.setAttribute('srcset', out);
    }
  });

  // Optional: JS bundling in balanced mode (keeps all scripts)
  if (MODE === 'balanced' && jsFiles.length) {
    console.log(`📦 Bundling ${jsFiles.length} JavaScript files in balanced mode...`);
    
    try {
      // Simple concatenation approach for better compatibility
      const bundleContent = [];
      for (const jsFile of jsFiles) {
        try {
          const content = await fs.readFile(jsFile, 'utf-8');
          bundleContent.push(`\n// === ${path.basename(jsFile)} ===\n`);
          bundleContent.push(content);
          bundleContent.push('\n');
        } catch (e) {
          console.log(`⚠️ Skipping JS file: ${jsFile}`);
        }
      }
      
      const bundledJs = bundleContent.join('');
      const bundlePath = path.join(ASSETS_DIR, 'app.bundle.js');
      await fs.writeFile(bundlePath, bundledJs, 'utf-8');
      
      // Remove original <script src> tags and append one tag to bundle
      doc.querySelectorAll('script[src]').forEach(s => s.remove());
      const tag = doc.createElement('script');
      tag.setAttribute('src', './assets/app.bundle.js');
      doc.body.appendChild(tag);
      
      console.log(`✨ Successfully bundled ${jsFiles.length} JavaScript files`);
    } catch (e) {
      console.log(`⚠️ JS bundling failed, keeping individual files: ${e.message}`);
      // Keep original script tags if bundling fails
    }
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

  // Generate comprehensive export report
  const report = generateExportReport({
    url,
    mode: MODE,
    viewportResults,
    combinedAssets,
    rewriteMap,
    cssFiles,
    jsFiles,
    otherFiles,
    allResources,
    domAssets
  });
  
  // Write detailed report to file
  const reportPath = path.join(DIST_DIR, 'export-report.json');
  await fs.writeJson(reportPath, report, { spaces: 2 });
  
  console.log(`\n📋 Export Report:`);
  console.log(`✅ Export complete → ${path.join(DIST_DIR, outFileName)} (mode=${MODE})`);
  console.log(`📱 Responsive viewports tested: ${viewportResults.length}`);
  console.log(`💾 Total assets downloaded: ${combinedAssets.size}`);
  console.log(`📦 Assets inlined as data URIs: ${report.summary.inlinedAssets}`);
  console.log(`⚠️  CORS/blocked assets: ${report.summary.blockedAssets}`);
  console.log(`🌐 Network-captured assets: ${report.summary.networkOnlyAssets}`);
  console.log(`🎛️  Interactive elements available: ${report.summary.interactiveElements}`);
  console.log(`📄 Detailed report saved: ${path.relative(process.cwd(), reportPath)}`);
  
  if (report.summary.blockedAssets > 0) {
    console.log(`\n⚠️  Note: ${report.summary.blockedAssets} assets kept as original URLs due to CORS/network restrictions`);
  }
  
  if (report.recommendations.length > 0) {
    console.log(`\n💡 Recommendations:`);
    report.recommendations.forEach(rec => console.log(`   • ${rec}`));
  }
}

main().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});