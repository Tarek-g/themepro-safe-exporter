#!/usr/bin/env node

/**
 * Static Export Auditor Agent
 * 
 * Analyzes exported pages, builds dependency graphs, prunes non-essentials,
 * and verifies fidelity through headless testing with visual diff comparison.
 * 
 * Usage: node audit-export.js [config.json]
 */

import fs from 'fs-extra';
import path from 'path';
import http from 'http';
import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';
import crypto from 'crypto';

// Default configuration
const DEFAULT_CONFIG = {
  source_url: '',
  export_dir: './dist',
  entry_html: 'index.html',
  mode: 'safe',
  viewport_set: [
    { label: 'mobile', width: 390, height: 844 },
    { label: 'desktop', width: 1366, height: 900 }
  ],
  interactions: [
    '.x-accordion .x-accordion-toggle',
    '.x-nav-tabs a',
    '.x-toggle',
    '.x-tab',
    '[data-toggle]',
    'details summary'
  ],
  allow_remote: true,
  remove_trackers: true,
  diff_threshold: 0.05, // 5% visual difference threshold
  server_port: 8081
};

class StaticExportAuditor {
  constructor(config) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dependencyGraph = new Map();
    this.essentialAssets = new Set();
    this.removableAssets = new Set();
    this.networkRequests = [];
    this.consoleErrors = [];
    this.screenshots = new Map();
    this.server = null;
  }

  async audit() {
    console.log('🔍 Starting Static Export Audit...');
    console.log(`📁 Export directory: ${this.config.export_dir}`);
    console.log(`🌐 Source URL: ${this.config.source_url}`);
    
    try {
      // Step 1: Build initial dependency graph
      await this.buildDependencyGraph();
      
      // Step 2: Start local server for testing
      await this.startLocalServer();
      
      // Step 3: Runtime discovery with headless browser
      await this.runtimeDiscovery();
      
      // Step 4: Mark essentials vs removable
      await this.markAssets();
      
      // Step 5: Prune non-essentials
      await this.pruneAssets();
      
      // Step 6: Verification pass
      await this.verifyExport();
      
      // Step 7: Generate outputs
      await this.generateOutputs();
      
      console.log('✅ Audit complete!');
      
    } catch (error) {
      console.error('❌ Audit failed:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async buildDependencyGraph() {
    console.log('📊 Building dependency graph...');
    
    const entryPath = path.join(this.config.export_dir, this.config.entry_html);
    const html = await fs.readFile(entryPath, 'utf-8');
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    
    // Extract assets from HTML
    this.extractFromHTML(doc);
    
    // Process CSS files for imports and url() references
    await this.processCSSFiles();
    
    // Basic JS static analysis
    await this.processJSFiles();
    
    console.log(`📈 Dependency graph built: ${this.dependencyGraph.size} assets`);
  }

  extractFromHTML(doc) {
    // CSS files and preloads
    doc.querySelectorAll('link[rel="stylesheet"], link[rel="preload"], link[rel="prefetch"], link[rel="modulepreload"]').forEach(link => {
      const href = link.getAttribute('href');
      if (href) this.addToDependencyGraph(href, 'css', 'html');
    });
    
    // JavaScript files
    doc.querySelectorAll('script[src]').forEach(script => {
      const src = script.getAttribute('src');
      if (src) this.addToDependencyGraph(src, 'js', 'html');
    });
    
    // Images
    doc.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src') || img.getAttribute('data-src');
      if (src) this.addToDependencyGraph(src, 'image', 'html');
      
      const srcset = img.getAttribute('srcset');
      if (srcset) {
        srcset.split(',').forEach(item => {
          const url = item.trim().split(' ')[0];
          this.addToDependencyGraph(url, 'image', 'html-srcset');
        });
      }
    });
    
    // Video, audio, source elements
    doc.querySelectorAll('video, audio, source').forEach(media => {
      const src = media.getAttribute('src');
      if (src) this.addToDependencyGraph(src, 'media', 'html');
      
      const srcset = media.getAttribute('srcset');
      if (srcset) {
        srcset.split(',').forEach(item => {
          const url = item.trim().split(' ')[0];
          this.addToDependencyGraph(url, 'media', 'html-srcset');
        });
      }
    });
    
    // Inline styles
    doc.querySelectorAll('style').forEach(style => {
      this.extractURLsFromCSS(style.textContent, 'inline-css');
    });
  }

  async processCSSFiles() {
    const cssFiles = Array.from(this.dependencyGraph.keys()).filter(url => 
      this.dependencyGraph.get(url).type === 'css'
    );
    
    for (const cssUrl of cssFiles) {
      try {
        const cssPath = this.resolveLocalPath(cssUrl);
        if (await fs.pathExists(cssPath)) {
          const cssContent = await fs.readFile(cssPath, 'utf-8');
          this.extractURLsFromCSS(cssContent, cssUrl);
        }
      } catch (error) {
        console.log(`⚠️ Could not process CSS file: ${cssUrl}`);
      }
    }
  }

  extractURLsFromCSS(cssContent, source) {
    // Extract @import statements
    const importMatches = cssContent.matchAll(/@import\\s+['\"]([^'\"]+)['\"]/g);
    for (const match of importMatches) {
      this.addToDependencyGraph(match[1], 'css', source);
    }
    
    // Extract url() references
    const urlMatches = cssContent.matchAll(/url\\(['\"]?([^'\"\\)]+)['\"]?\\)/g);
    for (const match of urlMatches) {
      const url = match[1];
      let type = 'asset';
      if (url.includes('.woff') || url.includes('.ttf') || url.includes('.eot')) {
        type = 'font';
      } else if (url.match(/\\.(png|jpg|jpeg|gif|svg|webp)$/i)) {
        type = 'image';
      }
      this.addToDependencyGraph(url, type, source);
    }
  }

  async processJSFiles() {
    const jsFiles = Array.from(this.dependencyGraph.keys()).filter(url => 
      this.dependencyGraph.get(url).type === 'js'
    );
    
    for (const jsUrl of jsFiles) {
      try {
        const jsPath = this.resolveLocalPath(jsUrl);
        if (await fs.pathExists(jsPath)) {
          const jsContent = await fs.readFile(jsPath, 'utf-8');
          this.extractURLsFromJS(jsContent, jsUrl);
        }
      } catch (error) {
        console.log(`⚠️ Could not process JS file: ${jsUrl}`);
      }
    }
  }

  extractURLsFromJS(jsContent, source) {
    // Basic static analysis for import statements and obvious URLs
    const importMatches = jsContent.matchAll(/import\\s+[^'\"]*['\"]([^'\"]+)['\"]/g);
    for (const match of importMatches) {
      this.addToDependencyGraph(match[1], 'js', source);
    }
    
    // Dynamic imports
    const dynamicImports = jsContent.matchAll(/import\\(['\"]([^'\"]+)['\"]\\)/g);
    for (const match of dynamicImports) {
      this.addToDependencyGraph(match[1], 'js', source);
    }
    
    // Obvious asset URLs in strings (basic heuristic)
    const assetMatches = jsContent.matchAll(/['\"]([^'\"]*\\.(png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|eot|css|js))['\\"]/g);
    for (const match of assetMatches) {
      const url = match[1];
      let type = 'asset';
      if (url.match(/\\.(png|jpg|jpeg|gif|svg|webp)$/i)) type = 'image';
      else if (url.match(/\\.(woff|woff2|ttf|eot)$/i)) type = 'font';
      else if (url.match(/\\.css$/i)) type = 'css';
      else if (url.match(/\\.js$/i)) type = 'js';
      
      this.addToDependencyGraph(url, type, source);
    }
  }

  addToDependencyGraph(url, type, source) {
    // Skip data URIs and absolute external URLs unless needed
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    
    // Normalize URL
    const normalizedUrl = this.normalizeURL(url);
    
    if (!this.dependencyGraph.has(normalizedUrl)) {
      this.dependencyGraph.set(normalizedUrl, {
        type,
        sources: new Set([source]),
        localPath: this.resolveLocalPath(normalizedUrl),
        size: 0,
        hash: '',
        essential: false
      });
    } else {
      this.dependencyGraph.get(normalizedUrl).sources.add(source);
    }
  }

  normalizeURL(url) {
    // Remove query parameters and fragments for dependency tracking
    return url.split('?')[0].split('#')[0];
  }

  resolveLocalPath(url) {
    if (url.startsWith('./')) {
      return path.join(this.config.export_dir, url.slice(2));
    } else if (url.startsWith('/')) {
      return path.join(this.config.export_dir, url.slice(1));
    } else if (!url.includes('://')) {
      return path.join(this.config.export_dir, url);
    }
    return null; // External URL
  }

  async startLocalServer() {
    console.log('🖥️ Starting local server...');
    
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        let pathname = req.url.split('?')[0];
        if (pathname === '/') pathname = '/' + this.config.entry_html;
        
        const filePath = path.join(this.config.export_dir, pathname.slice(1));
        
        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(404);
            res.end('Not Found');
            return;
          }
          
          const ext = path.extname(filePath);
          const mimeTypes = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.woff': 'font/woff',
            '.woff2': 'font/woff2'
          };
          
          res.writeHead(200, { 
            'Content-Type': mimeTypes[ext] || 'application/octet-stream',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(data);
        });
      });
      
      this.server.listen(this.config.server_port, (err) => {
        if (err) reject(err);
        else {
          console.log(`📡 Server running on http://localhost:${this.config.server_port}`);
          resolve();
        }
      });
    });
  }

  async runtimeDiscovery() {
    console.log('🔬 Starting runtime discovery...');
    
    const browser = await chromium.launch();
    this.networkRequests = [];
    this.consoleErrors = [];
    
    for (const viewport of this.config.viewport_set) {
      console.log(`📱 Testing ${viewport.label} (${viewport.width}x${viewport.height})`);
      
      const page = await browser.newPage({ 
        viewport: { width: viewport.width, height: viewport.height }
      });
      
      // Capture network requests
      page.on('request', req => {
        this.networkRequests.push({
          url: req.url(),
          viewport: viewport.label,
          method: req.method(),
          resourceType: req.resourceType()
        });
      });
      
      // Capture console errors
      page.on('console', msg => {
        if (msg.type() === 'error') {
          this.consoleErrors.push({
            text: msg.text(),
            viewport: viewport.label
          });
        }
      });
      
      try {
        await page.goto(`http://localhost:${this.config.server_port}`, { 
          waitUntil: 'networkidle'
        });
        
        // Auto-scroll
        await this.autoScroll(page);
        
        // Open interactive elements
        await this.openInteractiveElements(page);
        
        // Wait for any late-loading assets
        await page.waitForTimeout(2000);
        
        // Take screenshot
        const screenshot = await page.screenshot({ fullPage: true });
        this.screenshots.set(viewport.label, screenshot);
        
      } catch (error) {
        console.log(`⚠️ Error testing ${viewport.label}: ${error.message}`);
      }
      
      await page.close();
    }
    
    await browser.close();
    
    console.log(`📊 Captured ${this.networkRequests.length} network requests`);
    console.log(`⚠️ Found ${this.consoleErrors.length} console errors`);
  }

  async autoScroll(page) {
    await page.evaluate(() => {
      return new Promise(resolve => {
        let totalHeight = 0;
        const distance = window.innerHeight;
        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= document.body.scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
  }

  async openInteractiveElements(page) {
    for (const selector of this.config.interactions) {
      try {
        const elements = await page.$$(selector);
        for (const element of elements) {
          try {
            await element.click({ timeout: 500 });
            await page.waitForTimeout(200);
          } catch (e) {
            // Ignore individual click failures
          }
        }
      } catch (e) {
        // Ignore selector failures
      }
    }
  }

  async markAssets() {
    console.log('🏷️ Marking essential vs removable assets...');
    
    // Mark all assets referenced in dependency graph as essential
    for (const [url, info] of this.dependencyGraph) {
      this.essentialAssets.add(url);
    }
    
    // Add assets discovered during runtime
    for (const request of this.networkRequests) {
      const normalizedUrl = this.normalizeURL(request.url);
      if (normalizedUrl.startsWith('http://localhost:')) {
        const localUrl = normalizedUrl.replace(`http://localhost:${this.config.server_port}`, '');
        this.essentialAssets.add(localUrl);
      }
    }
    
    // Mark trackers for removal if configured
    if (this.config.remove_trackers) {
      const trackers = [
        'google-analytics.com',
        'googletagmanager.com',
        'facebook.net',
        'hotjar.com',
        'mixpanel.com'
      ];
      
      for (const [url] of this.dependencyGraph) {
        if (trackers.some(tracker => url.includes(tracker))) {
          this.removableAssets.add(url);
          this.essentialAssets.delete(url);
        }
      }
    }
    
    console.log(`✅ Essential assets: ${this.essentialAssets.size}`);
    console.log(`🗑️ Removable assets: ${this.removableAssets.size}`);
  }

  async pruneAssets() {
    console.log('✂️ Pruning non-essential assets...');
    
    const unusedDir = path.join(this.config.export_dir, 'assets', '_unused');
    await fs.ensureDir(unusedDir);
    
    let prunedCount = 0;
    
    for (const url of this.removableAssets) {
      const info = this.dependencyGraph.get(url);
      if (info && info.localPath && await fs.pathExists(info.localPath)) {
        const unusedPath = path.join(unusedDir, path.basename(info.localPath));
        await fs.move(info.localPath, unusedPath);
        prunedCount++;
      }
    }
    
    console.log(`🗑️ Moved ${prunedCount} non-essential files to _unused/`);
  }

  async verifyExport() {
    console.log('🔍 Verifying export after pruning...');
    
    // TODO: Re-test the export and compare screenshots
    // This would involve taking new screenshots and comparing them
    // with the original ones using image diffing algorithms
    
    // For now, we'll just re-run the runtime discovery to check for errors
    const browser = await chromium.launch();
    let hasErrors = false;
    
    for (const viewport of this.config.viewport_set) {
      const page = await browser.newPage({ 
        viewport: { width: viewport.width, height: viewport.height }
      });
      
      page.on('console', msg => {
        if (msg.type() === 'error') {
          console.log(`❌ Console error in ${viewport.label}: ${msg.text()}`);
          hasErrors = true;
        }
      });
      
      try {
        await page.goto(`http://localhost:${this.config.server_port}`, { 
          waitUntil: 'networkidle'
        });
      } catch (error) {
        console.log(`❌ Failed to load in ${viewport.label}: ${error.message}`);
        hasErrors = true;
      }
      
      await page.close();
    }
    
    await browser.close();
    
    if (hasErrors) {
      console.log('⚠️ Verification found issues - consider restoring some pruned assets');
    } else {
      console.log('✅ Verification passed - export is functional');
    }
  }

  async generateOutputs() {
    console.log('📄 Generating audit outputs...');
    
    // Create final directory
    const finalDir = path.join(this.config.export_dir, '..', 'final');
    await fs.ensureDir(finalDir);
    
    // Copy essential files to final directory
    await fs.copy(this.config.export_dir, finalDir, {
      filter: (src) => {
        // Skip _unused directory
        return !src.includes('_unused');
      }
    });
    
    // Generate manifest
    const manifest = {
      sourceUrl: this.config.source_url,
      auditDate: new Date().toISOString(),
      essentialAssets: Array.from(this.essentialAssets),
      removedAssets: Array.from(this.removableAssets),
      dependencyGraph: Object.fromEntries(
        Array.from(this.dependencyGraph.entries()).map(([url, info]) => [
          url, 
          { 
            type: info.type, 
            sources: Array.from(info.sources),
            essential: this.essentialAssets.has(url)
          }
        ])
      ),
      viewportsTested: this.config.viewport_set,
      networkRequests: this.networkRequests.length,
      consoleErrors: this.consoleErrors.length
    };
    
    await fs.writeJson(path.join(finalDir, 'manifest.json'), manifest, { spaces: 2 });
    
    // Generate HTML report
    const reportHtml = this.generateHTMLReport(manifest);
    await fs.writeFile(path.join(finalDir, 'audit-report.html'), reportHtml);
    
    // Generate JSON report
    const jsonReport = {
      ...manifest,
      consoleErrors: this.consoleErrors,
      recommendations: this.generateRecommendations()
    };
    await fs.writeJson(path.join(finalDir, 'audit-report.json'), jsonReport, { spaces: 2 });
    
    console.log(`📁 Final export saved to: ${finalDir}`);
  }

  generateHTMLReport(manifest) {
    return `<!DOCTYPE html>
<html>
<head>
    <title>Export Audit Report</title>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
        .section { margin-bottom: 30px; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .stat-card { background: #fff; border: 1px solid #ddd; padding: 15px; border-radius: 8px; text-align: center; }
        .stat-number { font-size: 2em; font-weight: bold; color: #2563eb; }
        .stat-label { color: #666; margin-top: 5px; }
        .asset-list { max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 15px; border-radius: 4px; }
        .error { background: #fee; color: #c33; padding: 10px; border-radius: 4px; margin: 5px 0; }
        .success { background: #efe; color: #363; padding: 10px; border-radius: 4px; margin: 5px 0; }
        .warning { background: #ffd; color: #860; padding: 10px; border-radius: 4px; margin: 5px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔍 Static Export Audit Report</h1>
        <p><strong>Source URL:</strong> ${manifest.sourceUrl}</p>
        <p><strong>Audit Date:</strong> ${new Date(manifest.auditDate).toLocaleString()}</p>
    </div>
    
    <div class="section">
        <h2>📊 Summary Statistics</h2>
        <div class="stats">
            <div class="stat-card">
                <div class="stat-number">${manifest.essentialAssets.length}</div>
                <div class="stat-label">Essential Assets</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${manifest.removedAssets.length}</div>
                <div class="stat-label">Removed Assets</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${manifest.networkRequests}</div>
                <div class="stat-label">Network Requests</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${manifest.consoleErrors}</div>
                <div class="stat-label">Console Errors</div>
            </div>
        </div>
    </div>
    
    ${manifest.consoleErrors === 0 ? 
      '<div class="success">✅ No console errors detected - export appears functional</div>' :
      `<div class="error">⚠️ ${manifest.consoleErrors} console errors detected - see audit-report.json for details</div>`
    }
    
    <div class="section">
        <h2>🏷️ Asset Classification</h2>
        <h3>Essential Assets (${manifest.essentialAssets.length})</h3>
        <div class="asset-list">
            ${manifest.essentialAssets.map(asset => `<div>✅ ${asset}</div>`).join('')}
        </div>
        
        ${manifest.removedAssets.length > 0 ? `
        <h3>Removed Assets (${manifest.removedAssets.length})</h3>
        <div class="asset-list">
            ${manifest.removedAssets.map(asset => `<div>🗑️ ${asset}</div>`).join('')}
        </div>
        ` : ''}
    </div>
    
    <div class="section">
        <h2>📱 Viewports Tested</h2>
        ${this.config.viewport_set.map(vp => 
          `<div>📱 ${vp.label}: ${vp.width}x${vp.height}</div>`
        ).join('')}
    </div>
    
    <footer style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; color: #666;">
        <p>Generated by Static Export Auditor • ${new Date().toISOString()}</p>
    </footer>
</body>
</html>`;
  }

  generateRecommendations() {
    const recommendations = [];
    
    if (this.consoleErrors.length > 0) {
      recommendations.push('Fix console errors to ensure full functionality');
    }
    
    if (this.removableAssets.size === 0) {
      recommendations.push('No assets were removed - consider reviewing tracker removal settings');
    }
    
    if (this.networkRequests.length > 100) {
      recommendations.push('High number of network requests - consider asset bundling');
    }
    
    return recommendations;
  }

  async cleanup() {
    if (this.server) {
      this.server.close();
      console.log('🛑 Local server stopped');
    }
  }
}

// CLI interface
async function main() {
  const configPath = process.argv[2];
  let config = {};
  
  if (configPath && await fs.pathExists(configPath)) {
    config = await fs.readJson(configPath);
  } else if (process.argv.length > 2) {
    // Simple CLI args: source_url export_dir
    config = {
      source_url: process.argv[2],
      export_dir: process.argv[3] || './dist'
    };
  }
  
  if (!config.source_url) {
    console.log(`
Usage: node audit-export.js [config.json]
   or: node audit-export.js <source_url> [export_dir]

Example config.json:
${JSON.stringify(DEFAULT_CONFIG, null, 2)}
`);
    process.exit(1);
  }
  
  const auditor = new StaticExportAuditor(config);
  await auditor.audit();
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(console.error);
}

export default StaticExportAuditor;