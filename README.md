# ThemeCo Pro Safe Exporter

A high-compatibility static site exporter for ThemeCo Pro and WordPress pages that ensures everything works as intended without breaking functionality.

## ✨ **Recent Updates**

### Enhanced Reporting & Local Testing (v2.1)
- 📊 **Comprehensive Export Reports**: Detailed JSON reports with asset breakdowns, network captures, and recommendations
- 🖥️ **Local Test Server**: Built-in HTTP server for testing exports (avoiding `file://` CORS issues)
- 🔍 **Static Export Auditor**: Advanced dependency analysis, asset pruning, and fidelity verification
- 🛡️ **Enhanced Error Handling**: Better navigation interruption handling with graceful degradation

### Navigation-Resistant Export Engine (v2.0)
- 🛡️ **Robust Error Handling**: Handles "execution context destroyed" errors during page navigation
- 🔄 **Graceful Degradation**: Continues export even when UI interactions are interrupted
- 📱 **Multi-Viewport Rendering**: Captures responsive assets across 5 breakpoints (XS to XL)
- 🌐 **Dual Network Capture**: Uses both Playwright events + Performance API for complete asset discovery

---

## 🎯 Purpose

This tool creates a "Safe Mirror" of any WordPress/ThemeCo page by:
- Rendering the page post-JavaScript execution using Playwright
- Collecting ALL assets (CSS, JS, images, fonts, media) from both DOM and Performance API
- Downloading assets locally and rewriting references
- Preserving ALL scripts and styles (no purging in safe mode)
- Handling responsive designs with multi-viewport rendering
- Creating a fully portable static version that works offline

## ✨ Features

- **Enhanced Multi-Viewport Rendering**: Tests 5 responsive breakpoints (XS, SM, MD, LG, XL) for comprehensive asset capture
- **Advanced Network Capture**: Combines Playwright event monitoring with Performance API to capture cross-origin resources
- **Maximum Compatibility**: Safe mode preserves everything to ensure 1:1 functionality
- **Smart Asset Collection**: Captures assets from DOM parsing + Performance API + network events across all viewports
- **Comprehensive Media Support**: Handles `<picture>`, `<source>`, `srcset`, and preload hints for responsive assets
- **Performance Optimized**: Excludes fonts from data URI inlining to maintain FCP/CLS performance
- **Lazy Loading Support**: Auto-scrolling and UI interaction to trigger lazy-loaded content
- **Comprehensive Responsive Capture**: Multi-viewport rendering (XS: 375x667, SM: 480x854, MD: 768x1024, LG: 980x1200, XL: 1366x900)
- **Inline Optimization**: Small images (<5KB) are inlined as data URIs for better portability (fonts kept as files for performance)
- **ThemeCo Optimized**: Special handling for ThemeCo accordion, tabs, and UI components
- **CORS/CORP Fallback**: Keeps original URLs for blocked third-party resources with enhanced error detection
- **Detailed Logging**: Comprehensive progress information and asset statistics

## 🔧 Technical Improvements

### Network Capture Enhancement
- **Playwright Event Monitoring**: Captures all network requests via `page.on('requestfinished')` to supplement Performance API
- **Cross-Origin Asset Recovery**: Handles resources blocked by `Timing-Allow-Origin` restrictions
- **Smart Network Idle Detection**: Waits for true network quiet before asset capture

### Asset Collection Completeness
- **Responsive Image Support**: Full `<picture>`, `<source>`, and `srcset` handling
- **Preload Hint Collection**: Captures `rel="preload"`, `rel="prefetch"`, and `rel="modulepreload"` assets
- **SRI Integrity Handling**: Automatically removes `integrity` attributes when assets are localized

### Performance Best Practices
- **Font Performance**: Keeps fonts as external files to avoid data URI bloat and enable format selection
- **Selective Inlining**: Only small images (<5KB) are inlined for portability without performance impact
- **Proper Library Usage**: Uses `playwright` instead of `@playwright/test` for production builds

## 🚀 Installation

```bash
# Clone the repository
git clone https://github.com/Tarek-g/themepro-safe-exporter.git
cd themepro-safe-exporter

# Install dependencies
npm install

# Install Playwright browsers (required)
npx playwright install chromium
```

## 📖 Usage

### Basic Usage

```bash
# Export a page with default settings (safe mode)
node exporter_v2.js "https://yoursite.com/page"

# Specify output filename
node exporter_v2.js "https://yoursite.com/page" --outfile my-page.html

# Choose export mode
node exporter_v2.js "https://yoursite.com/page" --mode safe
```

### Advanced Usage

```bash
# Custom viewport sizes for responsive capture
node exporter_v2.js "https://yoursite.com/page" \
  --outfile index.html \
  --mode balanced \
  --mobile 390x844 \
  --desktop 1440x900
```

### Export Modes

1. **`safe` (default)**: Maximum compatibility
   - Preserves ALL scripts and styles
   - No bundling or minification
   - Highest fidelity to original

2. **`balanced`**: Optimized but safe
   - Optional JS bundling and minification
   - Still preserves all functionality
   - Better performance

3. **`aggressive`**: Experimental (placeholder)
   - Reserved for future CSS purging features
   - Not recommended for production use

### Viewport Options

- `--mobile WxH`: Mobile viewport size (default: 390x844)
- `--desktop WxH`: Desktop viewport size (default: 1366x900)

## 📁 Output Structure

```
dist/
├── index.html          # Main exported page
├── manifest.json       # Export metadata with viewport details
└── assets/            # All downloaded assets
    ├── css/           # Stylesheets
    ├── js/            # JavaScript files
    ├── images/        # Images and media
    ├── fonts/         # Font files
    └── wp-content/    # WordPress theme and plugin assets
```

## 🔧 How It Works

1. **Multi-Viewport Page Rendering**: Opens the page in Chromium across 5 different viewport sizes
2. **Responsive Breakpoint Testing**: 
   - XS (375x667) for ≤480px devices
   - SM (480x854) for ≤767px devices  
   - MD (768x1024) for ≤979px devices
   - LG (980x1200) for ≤1200px devices
   - XL (1366x900) for >1200px devices
3. **Content Activation**: 
   - Auto-scrolls to trigger lazy loading
   - Opens `<details>` elements
   - Clicks common accordion/tab toggles
   - 500ms delay between viewports to protect server resources
4. **Comprehensive Asset Collection**: Gathers resources from DOM + Performance API across all viewports
5. **Download & Rewrite**: Downloads assets locally and updates all references
6. **Optimization**: Inlines small assets, optionally bundles JS
7. **Output**: Creates portable static site in `dist/` folder with detailed manifest

## 🎨 ThemeCo Pro Compatibility

Special handling for ThemeCo components:
- `.x-accordion` and `.x-accordion-toggle`
- `.x-tab` and `.x-nav-tabs`
- `.x-toggle` elements
- Responsive sliders and carousels
- Modal and popup components

## ⚠️ Limitations

**Will Work:**
- All front-end interactions (sliders, tabs, modals, animations)
- Static content and media
- CSS/JS functionality
- YouTube/Vimeo embeds
- Contact forms (with external endpoints)

**Won't Work:**
- WordPress-specific server functionality
- AJAX requests to WordPress REST API
- User authentication/login
- Dynamic content requiring server-side processing
- Plugin-specific database interactions

## 🔧 **Additional Tools**

### Local Test Server

Test your exported content with the included HTTP server to avoid CORS restrictions:

```bash
# Serve the dist/ folder on localhost:8080
node serve-export.js dist 8080

# Or use default settings (serves ./dist on port 8080)
node serve-export.js
```

**Why use a local server?**
- Avoids `file://` protocol CORS restrictions
- Tests the export exactly as it would work online
- Enables proper relative URL resolution
- Required for testing dynamic features

### Static Export Auditor

Analyze and optimize your exported content with comprehensive auditing:

```bash
# Basic audit of exported content
node audit-export.js "https://original-url.com" "./dist"

# Advanced audit with custom configuration
node audit-export.js config.json
```

**Auditor Features:**
- 📋 **Dependency Graph Analysis**: Maps all asset relationships
- 🌐 **Runtime Discovery**: Tests actual browser usage patterns
- ✂️ **Asset Pruning**: Removes non-essential files safely
- 📏 **Visual Verification**: Screenshots and diff comparison
- 📄 **Comprehensive Reports**: HTML and JSON audit reports
- 📊 **Performance Metrics**: Network requests, errors, and recommendations

### Enhanced Export Reports

Every export now generates detailed reports:

```bash
# Export with comprehensive reporting
node exporter_v2.js "https://example.com" --mode balanced

# Check the generated report
cat dist/export-report.json
```

**Report Contents:**
- Asset breakdown by type (CSS, JS, images, fonts)
- Network-captured vs DOM-discovered assets
- CORS/blocked asset details
- Viewport-specific resource counts
- Performance recommendations
- Interactive element detection

---

## 🔍 Troubleshooting

### Common Issues

1. **Missing Assets**: Increase timeout or check CORS policies
2. **Broken Layout**: Try `--mode safe` for maximum compatibility
3. **Large File Sizes**: Assets >10KB aren't inlined; check network connections

### Debug Options

```bash
# Check what assets are being collected
node exporter_v2.js "https://yoursite.com" --mode safe
# Check dist/manifest.json for export details
```

## 🛠️ Development

### Project Structure

```
├── exporter_v2.js     # Main exporter script
├── package.json       # Dependencies and scripts
└── README.md          # This file
```

### Adding Custom Selectors

To handle specific ThemeCo components, modify the `openCommonUI()` function in `exporter_v2.js`:

```javascript
const selectors = [
  // Add your custom selectors here
  '.your-custom-accordion',
  '.your-tab-system [data-tab]'
];
```

## 📝 Examples

### Export a ThemeCo Landing Page
```bash
node exporter_v2.js "https://yoursite.com/landing" --outfile landing.html --mode safe
```

### Export with Custom Mobile Size
```bash
node exporter_v2.js "https://yoursite.com/mobile-optimized" --mobile 414x896 --mode balanced
```

### Export for Embedding
```bash
node exporter_v2.js "https://yoursite.com/widget" --outfile widget.html --mode safe
# Small assets will be inlined for easier embedding
```

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Verify your Node.js version (>=16.0.0 required)
3. Ensure Playwright browsers are installed
4. Open an issue with detailed error information

---

**Note**: This tool creates static mirrors of dynamic pages. Server-side functionality will not work in the exported version. For full WordPress functionality, consider hosting solutions or hybrid approaches.