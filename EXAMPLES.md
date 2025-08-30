# ThemeCo Pro Safe Exporter - Examples

This document provides comprehensive examples of using the ThemeCo Pro Safe Exporter, including the new reporting features, local testing server, and audit tools.

## 🚀 **Quick Start Examples**

### Basic Export with Enhanced Reporting

```bash
# Export with default settings and comprehensive reports
node exporter_v2.js "https://example.com/page"

# View the detailed export report
cat dist/export-report.json

# Test the export locally
node serve-export.js dist 8080
# Open http://localhost:8080 in your browser
```

### Export with Custom Configuration

```bash
# Custom filename and mode
node exporter_v2.js "https://example.com/portfolio" \
  --outfile portfolio.html \
  --mode balanced

# Check the generated assets and report
ls -la dist/
cat dist/export-report.json | jq '.summary'
```

## 📋 **Understanding Export Reports**

Each export generates a comprehensive report at `dist/export-report.json`:

```json
{
  "sourceUrl": "https://example.com/page",
  "mode": "balanced",
  "timestamp": "2025-08-30T09:18:47.914Z",
  "summary": {
    "totalAssets": 45,
    "inlinedAssets": 3,
    "blockedAssets": 2,
    "networkOnlyAssets": 12,
    "interactiveElements": 7
  },
  "viewports": [
    { "name": "xs", "size": { "width": 375, "height": 667 }, "resourceCount": 18 },
    { "name": "xl", "size": { "width": 1366, "height": 900 }, "resourceCount": 22 }
  ],
  "assetBreakdown": {
    "css": 5,
    "js": 12,
    "images": 15,
    "fonts": 8,
    "other": 5
  },
  "recommendations": [
    "2 assets remain as remote URLs due to CORS restrictions",
    "12 assets were captured only through network monitoring"
  ]
}
```

### Key Report Metrics

- **totalAssets**: All discovered assets across viewports
- **inlinedAssets**: Small assets (<10KB) converted to data URIs
- **blockedAssets**: Assets kept as remote URLs due to CORS/network issues
- **networkOnlyAssets**: Assets discovered through network monitoring (not in DOM)
- **interactiveElements**: Number of UI selectors available for interaction

## 🖥️ **Local Testing Server**

### Basic Usage

```bash
# Serve the exported content
node serve-export.js dist 8080

# Alternative: use default settings
node serve-export.js  # serves ./dist on port 8080
```

### Advanced Testing Workflow

```bash
# 1. Export a page
node exporter_v2.js "https://example.com/complex-page" --mode balanced

# 2. Start local server
node serve-export.js dist 8080 &
SERVER_PID=$!

# 3. Test with headless browser (optional)
npx playwright test --config=test-config.js

# 4. Stop server
kill $SERVER_PID
```

### Testing Checklist

When testing your export locally:

- ✅ **Navigation**: All internal links work correctly
- ✅ **Media**: Images, videos, and fonts load properly
- ✅ **Interactions**: Accordions, tabs, modals function
- ✅ **Responsive**: Test multiple viewport sizes
- ✅ **Performance**: Check network panel for 404s
- ✅ **Console**: No JavaScript errors

## 🔍 **Static Export Auditor**

### English Auditor (Original)

```bash
# Basic audit of exported content
node audit-export.js "https://original-url.com" "./dist"

# Advanced audit with custom configuration
node audit-export.js config.json
```

### Post-Export Auditor (English)

Independent audit agent with comprehensive English reports:

```bash
# Comprehensive audit with English reports
node post-export-auditor.js "http://original-url.com" "./exported-directory"

# Quick audit of current export
node post-export-auditor.js "http://micro.local/1-2/" "./1-2"
```

**Unique Features:**
- 💫 **Read-Only Operation**: Never modifies export directory
- 📋 **Independent Analysis**: Works separately from export process
- 🇺🇸 **English Interface**: Professional English reporting and console output
- 📁 **Separate Output**: All reports saved to `audit/` directory
- 🔄 **Repeatable**: Can re-run anytime without affecting exports
- 📱 **7-Viewport Testing**: Comprehensive responsive analysis across all breakpoints

**English Configuration Example:**

Create `audit-config-english.json`:
```json
{
  "source_url": "http://micro.local/1-2/",
  "export_dir": "./1-2",
  "entry_html": "index.html",
  "viewports": [
    { "label": "xs", "width": 375, "height": 667 },
    { "label": "sm", "width": 480, "height": 854 },
    { "label": "md", "width": 768, "height": 1024 },
    { "label": "lg", "width": 980, "height": 1200 },
    { "label": "xl", "width": 1366, "height": 900 },
    { "label": "mobile", "width": 390, "height": 844 },
    { "label": "desktop", "width": 1440, "height": 900 }
  ],
  "interactions": [
    ".x-accordion .x-accordion-toggle",
    ".x-nav-tabs a",
    ".x-toggle",
    "[data-x-toggle]",
    ".modal-trigger"
  ],
  "timeout_sec": 20,
  "max_scroll_depth": 4
}
```

**Sample English Output:**
```
🔍 Starting post-export audit...
📁 Export directory: /path/to/1-2
📋 Cataloging files...
📈 Inventoried 22 files
🔍 Static asset analysis...
📊 Found 19 assets in static analysis
🔬 Runtime analysis...
📊 Export Analysis Summary:
   📁 Total files: 22
   ✅ Used: 11 (575 KB)
   🗑️  Unused: 17 (834 KB)
   📈 Waste ratio: 59%

📱 Responsive Breakdown:
   XS (375px): 8 assets used
   SM (480px): 9 assets used  
   MD (768px): 11 assets used
   LG (980px): 11 assets used
   XL (1366px): 11 assets used
```

### Advanced Audit with Configuration

Create an audit configuration file `audit-config.json`:

```json
{
  "source_url": "https://example.com/themecosite",
  "export_dir": "./dist",
  "mode": "safe",
  "viewport_set": [
    { "label": "mobile", "width": 390, "height": 844 },
    { "label": "tablet", "width": 768, "height": 1024 },
    { "label": "desktop", "width": 1366, "height": 900 }
  ],
  "interactions": [
    ".x-accordion .x-accordion-toggle",
    ".x-nav-tabs a",
    ".x-toggle",
    "[data-x-toggle]",
    ".slider-next",
    ".modal-trigger"
  ],
  "allow_remote": true,
  "remove_trackers": true,
  "diff_threshold": 0.05
}
```

Run the audit:

```bash
node audit-export.js audit-config.json
```

### Audit Output Analysis

The auditor creates several outputs in the `final/` directory:

#### 1. Optimized Export (`final/`)
- Cleaned up version ready for production
- Non-essential assets moved to `_unused/`
- Preserved essential functionality

#### 2. HTML Report (`final/audit-report.html`)
```html
<!-- Comprehensive visual report showing: -->
<!-- • Summary statistics -->
<!-- • Asset classification -->
<!-- • Console errors (if any) -->
<!-- • Viewports tested -->
<!-- • Performance recommendations -->
```

#### 3. JSON Report (`final/audit-report.json`)
```json
{
  "sourceUrl": "https://example.com/page",
  "auditDate": "2025-08-30T09:20:26.948Z",
  "essentialAssets": ["./assets/main.css", "./assets/app.js"],
  "removedAssets": ["./assets/analytics.js", "./assets/tracking.js"],
  "dependencyGraph": { /* complete asset relationships */ },
  "networkRequests": 28,
  "consoleErrors": [],
  "recommendations": [
    "No console errors detected - export appears functional"
  ]
}
```

#### 4. Manifest (`final/manifest.json`)
```json
{
  "sourceUrl": "https://example.com/page",
  "auditDate": "2025-08-30T09:20:26.948Z",
  "essentialAssets": 15,
  "removedAssets": 3,
  "viewportsTested": ["mobile", "desktop"],
  "fileHashes": { /* SHA256 hashes for integrity */ }
}
```

---

# Original Quick Start Example

This example shows how to export a WordPress/ThemeCo page using the enhanced safe exporter with multi-viewport rendering.

## Prerequisites

```bash
# Install dependencies
npm install

# Install Playwright browsers (required for page rendering)
npx playwright install chromium
```

## Basic Usage Examples

### 1. Export with Default Settings (Safe Mode)
```bash
node exporter_v2.js "https://example.com/my-page"
```
Output: `dist/index.html` with all assets in `dist/assets/`

### 2. Custom Output Filename
```bash
node exporter_v2.js "https://example.com/landing-page" --outfile landing.html
```
Output: `dist/landing.html`

### 3. Balanced Mode (Optimized but Safe)
```bash
node exporter_v2.js "https://example.com/page" --mode balanced --outfile optimized.html
```
Features: JS bundling and minification while preserving all functionality

### 4. Enhanced Multi-Viewport Rendering (Recommended)
```bash
node exporter_v2.js "https://example.com/responsive-page" \
  --mode safe \
  --outfile responsive-export.html
```
This automatically tests all 5 responsive breakpoints:
- XS (375x667) for mobile phones
- SM (480x854) for large phones  
- MD (768x1024) for tablets
- LG (980x1200) for small desktops
- XL (1366x900) for large screens

### 5. Custom Viewport Override
```bash
node exporter_v2.js "https://example.com/page" \
  --mobile 414x896 \
  --desktop 1920x1080 \
  --mode balanced
```
Note: Custom viewports will override the default XS and XL breakpoints

## Enhanced Output Information

The improved exporter now provides detailed information:

```
🚀 Starting export of: https://example.com/page
📐 Using responsive breakpoints: XS(375), SM(480), MD(768), LG(980), XL(1366)
🔄 Rendering multiple viewports for comprehensive responsive asset capture...
📱 Rendering xs viewport (375x667)
📱 Rendering sm viewport (480x854)
📱 Rendering md viewport (768x1024)
📱 Rendering lg viewport (980x1200)
📱 Rendering xl viewport (1366x900)
📆 Captured 34 unique resources across 5 viewports
⬇️ Downloading 34 assets...
💾 Downloaded: [asset URLs]
📦 Inlined small asset: [small assets]
⚠️ CORS blocked, keeping original URL: [blocked URLs]
✅ Export complete → dist/enhanced-test.html (mode=safe)
📱 Responsive viewports tested: 5
💾 Total assets downloaded: 34
📦 Assets inlined as data URIs: 6
```

## What Gets Exported

✅ **Will Work in Exported Version:**
- All visual layouts and styling
- JavaScript interactions (sliders, tabs, modals)
- Responsive design behaviors
- Embedded videos (YouTube, Vimeo)
- Contact forms (if they use external services)
- All animations and transitions

❌ **Won't Work (Requires Server):**
- WordPress login/authentication
- Dynamic content from database
- Contact forms using WordPress AJAX
- Plugin-specific server functionality
- Real-time data updates

## Troubleshooting

### Common Issues

**1. "Browser not found" error:**
```bash
npx playwright install chromium
```

**2. Export seems incomplete:**
Try increasing viewport sizes to capture more responsive assets:
```bash
node exporter_v2.js "URL" --desktop 1920x1080 --mobile 414x896
```

**3. Some assets missing:**
Check `dist/manifest.json` for details about blocked downloads. CORS-blocked assets will keep their original URLs.

### Directory Structure After Export

```
dist/
├── index.html              # Your exported page
├── manifest.json           # Export details and metadata
└── assets/                 # All downloaded assets
    ├── wp-content/         # WordPress assets
    ├── wp-includes/        # WordPress core assets
    ├── uploads/            # Media files
    └── themes/             # Theme assets
```

## Advanced Usage

### For ThemeCo Pro Pages
The exporter includes special handling for ThemeCo components:
- Automatically expands accordions and tabs
- Triggers lazy loading for images
- Handles responsive sliders and carousels

### Embedding the Result
Since small assets are inlined as data URIs, the exported HTML is highly portable and can be easily embedded in other sites or used in presentations.

## Next Steps

1. Test your exported page by opening `dist/index.html` in a browser
2. Deploy the `dist/` folder to any static hosting service
3. For production use, consider using `--mode balanced` for better optimization

## Support

If you encounter issues, check:
1. Your internet connection (for asset downloading)
2. The source page loads correctly in a regular browser
3. Node.js version is >=16.0.0