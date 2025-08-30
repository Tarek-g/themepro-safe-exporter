#!/usr/bin/env node

/**
 * Post-Export Audit Agent
 * Analyzes the export directory separately and writes reports to an independent audit/ folder
 */

import fs from 'fs-extra';
import path from 'path';
import http from 'http';
import { chromium } from 'playwright';
import { JSDOM } from 'jsdom';

const DEFAULT_CONFIG = {
  source_url: '',
  export_dir: './dist',
  entry_html: 'index.html',
  viewports: [
    { label: 'mobile', width: 390, height: 844 },
    { label: 'desktop', width: 1366, height: 900 }
  ],
  interactions: [
    '.x-accordion .x-accordion-toggle',
    '.x-nav-tabs a',
    '.x-toggle',
    '[data-toggle]',
    'details summary'
  ],
  timeout_sec: 20,
  max_scroll_depth: 4,
  server_port: 8082
};

class PostExportAuditor {
  constructor(config) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.auditDir = path.resolve('./audit');
    this.exportDir = path.resolve(this.config.export_dir);
    
    this.staticAssets = new Map();
    this.runtimeAssets = new Set();
    this.networkLog = [];
    this.consoleErrors = [];
    this.fileInventory = new Map();
    this.server = null;
  }

  async audit() {
    console.log('🔍 Starting post-export audit...');
    console.log(`📁 Export directory: ${this.exportDir}`);
    console.log(`📊 Reports directory: ${this.auditDir}`);
    
    try {
      await this.setupAuditDirectory();
      await this.inventoryFiles();
      await this.staticAnalysis();
      await this.runtimeAnalysis();
      if (this.config.source_url) await this.visualComparison();
      await this.generateReports();
      
      console.log('✅ Audit completed successfully!');
    } catch (error) {
      console.error('❌ Audit failed:', error.message);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async setupAuditDirectory() {
    await fs.ensureDir(this.auditDir);
    await fs.ensureDir(path.join(this.auditDir, 'screenshots'));
    await fs.ensureDir(path.join(this.auditDir, 'visual-diff'));
    console.log('📁 Audit directory setup complete');
  }

  async inventoryFiles() {
    console.log('📋 Inventorying files...');
    
    const walkDir = async (dir, relativePath = '') => {
      const items = await fs.readdir(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relPath = path.join(relativePath, item);
        const stat = await fs.stat(fullPath);
        
        if (stat.isDirectory()) {
          await walkDir(fullPath, relPath);
        } else {
          this.fileInventory.set(relPath, {
            fullPath,
            size: stat.size,
            modified: stat.mtime,
            extension: path.extname(item)
          });
        }
      }
    };
    
    await walkDir(this.exportDir);
    console.log(`📈 Inventoried ${this.fileInventory.size} files`);
  }

  async staticAnalysis() {
    console.log('🔍 Static asset analysis...');
    
    const entryPath = path.join(this.exportDir, this.config.entry_html);
    if (!await fs.pathExists(entryPath)) {
      throw new Error(`Entry file not found: ${entryPath}`);
    }
    
    const html = await fs.readFile(entryPath, 'utf-8');
    const dom = new JSDOM(html);
    
    this.extractFromHTML(dom.window.document);
    await this.analyzeCSS();
    await this.analyzeJS();
    
    console.log(`📊 Found ${this.staticAssets.size} assets in static analysis`);
  }

  extractFromHTML(doc) {
    // CSS files
    doc.querySelectorAll('link[rel="stylesheet"], link[rel="preload"], link[rel="prefetch"]').forEach(link => {
      const href = link.getAttribute('href');
      if (href) this.addStaticAsset(href, 'css', 'html');
    });
    
    // JavaScript files
    doc.querySelectorAll('script[src]').forEach(script => {
      const src = script.getAttribute('src');
      if (src) this.addStaticAsset(src, 'js', 'html');
    });
    
    // Images
    doc.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src') || img.getAttribute('data-src');
      if (src) this.addStaticAsset(src, 'image', 'html');
      
      const srcset = img.getAttribute('srcset');
      if (srcset) {
        srcset.split(',').forEach(item => {
          const url = item.trim().split(' ')[0];
          this.addStaticAsset(url, 'image', 'html-srcset');
        });
      }
    });
    
    // Media elements
    doc.querySelectorAll('video, audio, source').forEach(media => {
      const src = media.getAttribute('src');
      if (src) this.addStaticAsset(src, 'media', 'html');
    });
  }

  async analyzeCSS() {
    const cssAssets = Array.from(this.staticAssets.keys()).filter(url => 
      this.staticAssets.get(url).type === 'css'
    );
    
    for (const cssUrl of cssAssets) {
      try {
        const cssPath = this.resolveLocalPath(cssUrl);
        if (cssPath && await fs.pathExists(cssPath)) {
          const cssContent = await fs.readFile(cssPath, 'utf-8');
          this.extractCSSUrls(cssContent, cssUrl);
        }
      } catch (error) {
        console.log(`⚠️ Cannot process CSS file: ${cssUrl}`);
      }
    }
  }

  extractCSSUrls(cssContent, source) {
    // @import statements
    const importMatches = cssContent.matchAll(/@import\s+['"]([^'"]+)['"]/g);
    for (const match of importMatches) {
      this.addStaticAsset(match[1], 'css', source);
    }
    
    // url() references
    const urlMatches = cssContent.matchAll(/url\(['"]?([^'")]+)['"]?\)/g);
    for (const match of urlMatches) {
      const url = match[1];
      const type = this.getAssetType(url);
      this.addStaticAsset(url, type, source);
    }
  }

  async analyzeJS() {
    const jsAssets = Array.from(this.staticAssets.keys()).filter(url => 
      this.staticAssets.get(url).type === 'js'
    );
    
    for (const jsUrl of jsAssets) {
      try {
        const jsPath = this.resolveLocalPath(jsUrl);
        if (jsPath && await fs.pathExists(jsPath)) {
          const jsContent = await fs.readFile(jsPath, 'utf-8');
          this.extractJSUrls(jsContent, jsUrl);
        }
      } catch (error) {
        console.log(`⚠️ Cannot process JS file: ${jsUrl}`);
      }
    }
  }

  extractJSUrls(jsContent, source) {
    // Import statements
    const importMatches = jsContent.matchAll(/import\s+[^'"]*['"]([^'"]+)['"]/g);
    for (const match of importMatches) {
      this.addStaticAsset(match[1], 'js', source);
    }
    
    // Asset URLs in strings
    const assetMatches = jsContent.matchAll(/['"]([^'"]*\.(png|jpg|jpeg|gif|svg|webp|woff2?|ttf|eot|css|js))['"`]/g);
    for (const match of assetMatches) {
      const url = match[1];
      const type = this.getAssetType(url);
      this.addStaticAsset(url, type, source);
    }
  }

  addStaticAsset(url, type, source) {
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    
    const normalizedUrl = this.normalizeURL(url);
    
    if (!this.staticAssets.has(normalizedUrl)) {
      this.staticAssets.set(normalizedUrl, {
        type,
        sources: new Set([source]),
        localPath: this.resolveLocalPath(normalizedUrl)
      });
    } else {
      this.staticAssets.get(normalizedUrl).sources.add(source);
    }
  }

  getAssetType(url) {
    const ext = path.extname(url).toLowerCase();
    if (ext.match(/\.(css)$/)) return 'css';
    if (ext.match(/\.(js)$/)) return 'js';
    if (ext.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) return 'image';
    if (ext.match(/\.(woff2?|ttf|eot)$/)) return 'font';
    if (ext.match(/\.(mp4|webm|mp3|wav)$/)) return 'media';
    return 'other';
  }

  normalizeURL(url) {
    return url.split('?')[0].split('#')[0];
  }

  resolveLocalPath(url) {
    if (url.startsWith('./')) return path.join(this.exportDir, url.slice(2));
    if (url.startsWith('/')) return path.join(this.exportDir, url.slice(1));
    if (!url.includes('://')) return path.join(this.exportDir, url);
    return null;
  }

  async startLocalServer() {
    console.log('🖥️ Starting local server...');
    
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        let pathname = req.url.split('?')[0];
        if (pathname === '/') pathname = '/' + this.config.entry_html;
        
        const filePath = path.join(this.exportDir, pathname.slice(1));
        
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

  async runtimeAnalysis() {
    console.log('🔬 Runtime analysis...');
    
    await this.startLocalServer();
    const browser = await chromium.launch();
    
    for (const viewport of this.config.viewports) {
      console.log(`📱 Testing ${viewport.label} (${viewport.width}x${viewport.height})`);
      
      const page = await browser.newPage({ 
        viewport: { width: viewport.width, height: viewport.height }
      });
      
      page.on('request', req => {
        this.networkLog.push({
          url: req.url(),
          viewport: viewport.label,
          method: req.method(),
          resourceType: req.resourceType(),
          timestamp: Date.now()
        });
      });
      
      page.on('response', res => {
        const request = this.networkLog.find(r => r.url === res.url());
        if (request) {
          request.status = res.status();
          request.size = res.headers()['content-length'] || 0;
        }
      });
      
      page.on('console', msg => {
        if (msg.type() === 'error') {
          this.consoleErrors.push({
            text: msg.text(),
            viewport: viewport.label,
            timestamp: Date.now()
          });
        }
      });
      
      try {
        await page.goto(`http://localhost:${this.config.server_port}`, { 
          waitUntil: 'networkidle',
          timeout: this.config.timeout_sec * 1000
        });
        
        await this.performAutoScroll(page);
        await this.performInteractions(page);
        await page.waitForTimeout(2000);
        
        const screenshot = await page.screenshot({ fullPage: true });
        const screenshotPath = path.join(this.auditDir, 'screenshots', `${viewport.label}.png`);
        await fs.writeFile(screenshotPath, screenshot);
        
      } catch (error) {
        console.log(`⚠️ Error testing ${viewport.label}: ${error.message}`);
      }
      
      await page.close();
    }
    
    await browser.close();
    
    // Add actually loaded assets
    this.networkLog.forEach(req => {
      if (req.url.startsWith(`http://localhost:${this.config.server_port}`)) {
        const localUrl = req.url.replace(`http://localhost:${this.config.server_port}`, '');
        this.runtimeAssets.add(localUrl);
      }
    });
    
    console.log(`📊 Recorded ${this.networkLog.length} network requests`);
    console.log(`⚠️ Found ${this.consoleErrors.length} console errors`);
  }

  async performAutoScroll(page) {
    for (let i = 0; i < this.config.max_scroll_depth; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(500);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  async performInteractions(page) {
    for (const selector of this.config.interactions) {
      try {
        const elements = await page.$$(selector);
        for (const element of elements) {
          try {
            await element.click({ timeout: 500 });
            await page.waitForTimeout(200);
          } catch (e) {}
        }
      } catch (e) {}
    }
  }

  async visualComparison() {
    console.log('📷 Visual comparison with original...');
    
    const browser = await chromium.launch();
    
    for (const viewport of this.config.viewports) {
      const page = await browser.newPage({ 
        viewport: { width: viewport.width, height: viewport.height }
      });
      
      try {
        await page.goto(this.config.source_url, { 
          waitUntil: 'networkidle',
          timeout: this.config.timeout_sec * 1000
        });
        
        const originalScreenshot = await page.screenshot({ fullPage: true });
        const originalPath = path.join(this.auditDir, 'visual-diff', `${viewport.label}-original.png`);
        await fs.writeFile(originalPath, originalScreenshot);
        
      } catch (error) {
        console.log(`⚠️ Failed to capture original for ${viewport.label}: ${error.message}`);
      }
      
      await page.close();
    }
    
    await browser.close();
  }

  async generateReports() {
    console.log('📄 Generating final reports...');
    
    // Classify files
    const usedFiles = new Set();
    const unusedFiles = [];
    
    // Add files from static analysis
    for (const [url, info] of this.staticAssets) {
      if (info.localPath) {
        const relativePath = path.relative(this.exportDir, info.localPath);
        usedFiles.add(relativePath);
      }
    }
    
    // Add files from runtime
    for (const url of this.runtimeAssets) {
      if (url.startsWith('/')) {
        usedFiles.add(url.slice(1));
      }
    }
    
    // Identify unused files
    for (const [filePath, info] of this.fileInventory) {
      if (!usedFiles.has(filePath) && !usedFiles.has('/' + filePath)) {
        unusedFiles.push({
          path: filePath,
          size: info.size,
          sizeKB: Math.round(info.size / 1024),
          extension: info.extension
        });
      }
    }
    
    unusedFiles.sort((a, b) => b.size - a.size);
    
    // Calculate statistics
    const totalFiles = this.fileInventory.size;
    const totalSize = Array.from(this.fileInventory.values()).reduce((sum, info) => sum + info.size, 0);
    const unusedSize = unusedFiles.reduce((sum, file) => sum + file.size, 0);
    const usedSize = totalSize - unusedSize;
    
    const report = {
      audit_date: new Date().toISOString(),
      source_url: this.config.source_url,
      export_dir: this.config.export_dir,
      summary: {
        total_files: totalFiles,
        used_files: usedFiles.size,
        unused_files: unusedFiles.length,
        total_size_kb: Math.round(totalSize / 1024),
        used_size_kb: Math.round(usedSize / 1024),
        unused_size_kb: Math.round(unusedSize / 1024),
        waste_percentage: Math.round((unusedSize / totalSize) * 100)
      },
      largest_unused_files: unusedFiles.slice(0, 10),
      unused_files_by_type: this.groupFilesByType(unusedFiles),
      console_errors: this.consoleErrors,
      network_requests: this.networkLog.length,
      viewports_tested: this.config.viewports.map(v => v.label),
      recommendations: this.generateRecommendations(unusedFiles, totalSize, unusedSize)
    };
    
    // Save reports
    await fs.writeJson(path.join(this.auditDir, 'audit-report.json'), report, { spaces: 2 });
    await fs.writeJson(path.join(this.auditDir, 'asset-graph.json'), this.buildAssetGraph(), { spaces: 2 });
    await fs.writeJson(path.join(this.auditDir, 'network-log.json'), this.networkLog, { spaces: 2 });
    await fs.writeJson(path.join(this.auditDir, 'console-errors.json'), this.consoleErrors, { spaces: 2 });
    
    const htmlReport = this.generateHTMLReport(report);
    await fs.writeFile(path.join(this.auditDir, 'audit-report.html'), htmlReport);
    
    console.log('📊 Audit Summary:');
    console.log(`   📁 Total files: ${totalFiles}`);
    console.log(`   ✅ Used: ${usedFiles.size} (${Math.round(usedSize / 1024)} KB)`);
    console.log(`   🗑️  Unused: ${unusedFiles.length} (${Math.round(unusedSize / 1024)} KB)`);
    console.log(`   📈 Waste ratio: ${Math.round((unusedSize / totalSize) * 100)}%`);
    
    if (this.consoleErrors.length > 0) {
      console.log(`   ⚠️  Console errors: ${this.consoleErrors.length}`);
    }
  }

  groupFilesByType(files) {
    const groups = {};
    files.forEach(file => {
      const ext = file.extension || 'no-extension';
      if (!groups[ext]) {
        groups[ext] = { count: 0, total_size_kb: 0 };
      }
      groups[ext].count++;
      groups[ext].total_size_kb += file.sizeKB;
    });
    return groups;
  }

  generateRecommendations(unusedFiles, totalSize, unusedSize) {
    const recommendations = [];
    
    if (unusedSize > totalSize * 0.3) {
      recommendations.push('High unused file ratio (>30%) - review asset collection logic');
    }
    
    const largeUnusedImages = unusedFiles.filter(f => 
      f.extension.match(/\.(png|jpg|jpeg|gif|webp)$/i) && f.sizeKB > 100
    );
    
    if (largeUnusedImages.length > 0) {
      recommendations.push(`${largeUnusedImages.length} large unused images - check srcset and responsive image handling`);
    }
    
    const unusedFonts = unusedFiles.filter(f => f.extension.match(/\.(woff2?|ttf|eot)$/i));
    if (unusedFonts.length > 0) {
      recommendations.push(`${unusedFonts.length} unused fonts - review conditional font loading`);
    }
    
    if (this.consoleErrors.length > 0) {
      recommendations.push('Console errors detected - check JavaScript integrity');
    }
    
    return recommendations;
  }

  buildAssetGraph() {
    const graph = {
      static_assets: {},
      runtime_assets: Array.from(this.runtimeAssets),
      analysis_summary: {
        static_count: this.staticAssets.size,
        runtime_count: this.runtimeAssets.size
      }
    };
    
    for (const [url, info] of this.staticAssets) {
      graph.static_assets[url] = {
        type: info.type,
        sources: Array.from(info.sources),
        local_path: info.localPath
      };
    }
    
    return graph;
  }

  generateHTMLReport(report) {
    return `<!DOCTYPE html>
<html dir="ltr" lang="en">
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
        .file-list { max-height: 300px; overflow-y: auto; border: 1px solid #ddd; padding: 15px; border-radius: 4px; }
        .error { background: #fee; color: #c33; padding: 10px; border-radius: 4px; margin: 5px 0; }
        .success { background: #efe; color: #363; padding: 10px; border-radius: 4px; margin: 5px 0; }
        .warning { background: #ffd; color: #860; padding: 10px; border-radius: 4px; margin: 5px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔍 Post-Export Audit Report</h1>
        <p><strong>Export Directory:</strong> ${report.export_dir}</p>
        <p><strong>Audit Date:</strong> ${new Date(report.audit_date).toLocaleString('en')}</p>
        ${report.source_url ? `<p><strong>Original Source:</strong> ${report.source_url}</p>` : ''}
    </div>
    
    <div class="section">
        <h2>📊 Summary Statistics</h2>
        <div class="stats">
            <div class="stat-card">
                <div class="stat-number">${report.summary.total_files}</div>
                <div class="stat-label">Total Files</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${report.summary.used_files}</div>
                <div class="stat-label">Used Files</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${report.summary.unused_files}</div>
                <div class="stat-label">Unused Files</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${report.summary.waste_percentage}%</div>
                <div class="stat-label">Waste Ratio</div>
            </div>
        </div>
    </div>
    
    ${report.console_errors.length === 0 ? 
      '<div class="success">✅ No Console errors - export working correctly</div>' :
      `<div class="error">⚠️ Found ${report.console_errors.length} Console errors</div>`
    }
    
    <div class="section">
        <h2>🗑️ Largest Unused Files</h2>
        <div class="file-list">
            ${report.largest_unused_files.map(file => 
              `<div>📄 ${file.path} (${file.sizeKB} KB)</div>`
            ).join('')}
        </div>
    </div>
    
    <div class="section">
        <h2>💡 Recommendations</h2>
        ${report.recommendations.map(rec => 
          `<div class="warning">• ${rec}</div>`
        ).join('')}
    </div>
    
    <div class="section">
        <h2>📱 Viewports Tested</h2>
        ${report.viewports_tested.map(vp => 
          `<div>📱 ${vp}</div>`
        ).join('')}
    </div>
    
    <footer style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; color: #666;">
        <p>Generated by Post-Export Auditor • ${new Date().toISOString()}</p>
    </footer>
</body>
</html>`;
  }

  async cleanup() {
    if (this.server) {
      this.server.close();
      console.log('🛑 Local server stopped');
    }
  }
}

// واجهة سطر الأوامر
async function main() {
  const configPath = process.argv[2];
  let config = {};
  
  if (configPath && await fs.pathExists(configPath)) {
    config = await fs.readJson(configPath);
  } else if (process.argv.length > 2) {
    config = {
      source_url: process.argv[2] || '',
      export_dir: process.argv[3] || './dist'
    };
  }
  
  if (!config.export_dir) {
    console.log(`
Usage: node post-export-auditor.js [config.json]
    or: node post-export-auditor.js [source_url] [export_dir]

Example config.json:
${JSON.stringify(DEFAULT_CONFIG, null, 2)}
`);
    process.exit(1);
  }
  
  const auditor = new PostExportAuditor(config);
  await auditor.audit();
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(console.error);
}

export default PostExportAuditor;