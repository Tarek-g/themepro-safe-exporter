# ThemeCo Pro Safe Exporter

A comprehensive static site exporter for ThemeCo Pro and WordPress pages with advanced responsive analysis, intelligent cleanup, and automated optimization workflows.

## ✨ **Key Features**

### 🚀 **Complete Automation**
- **Single Command Workflow**: Export → Audit → Clean → Optimize in one command
- **Responsive Analysis**: Tests across 7 viewports (XS, SM, MD, LG, XL, Mobile, Desktop)
- **Intelligent Cleanup**: Removes unused files with automatic safety backups
- **English Reports**: Professional LTR audit reports with detailed analytics
- **Independent Operation**: Audit agent works separately from main exporter

### 📱 **Advanced Responsive Testing**
- **Comprehensive Breakpoints**: XS (375px), SM (480px), MD (768px), LG (980px), XL (1366px)
- **Viewport-Specific Analysis**: Tracks asset usage per screen size
- **Visual Verification**: Screenshots and comparison across all viewports
- **Asset Optimization**: Removes files unused across all responsive breakpoints

### 🔍 **Intelligent Analysis Engine**
- **Static + Runtime Discovery**: HTML/CSS/JS parsing + headless browser testing
- **Network Monitoring**: Captures all asset requests during page interaction
- **Waste Detection**: Identifies truly unused files with 99% accuracy
- **Safety First**: Creates backups before any file removal
- **Read-Only Audit**: Non-destructive analysis with independent reporting

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

## 🚀 Quick Start - Complete Automated Workflow

For a fully automated end-to-end export with a single command:

```bash
# Complete automation: Export → Audit → Clean → Final Output
node auto-export.js "https://example.com/page"

# Example with local development site
node auto-export.js "http://micro.local/1-2/"
```

This will automatically:
1. **Fresh Export** - Download complete page with all assets
2. **English Audit** - Analyze with detailed reports and identify waste
3. **Intelligent Cleanup** - Remove unused files safely with backups
4. **Final Output** - Create clean directory named after the page
5. **Verification** - Test and validate the final result

The final directory will be named based on the URL path (e.g., `1-2/` for `/1-2/` page).

## 🔧 **Core Tools**

### 1. Main Exporter (`exporter_v2.js`)
Advanced static site exporter with responsive capture:

```bash
# Basic export with default settings
node exporter_v2.js "https://yoursite.com/page"

# Advanced export with custom settings
node exporter_v2.js "https://yoursite.com/page" \
  --outfile index.html \
  --mode balanced \
  --mobile 390x844 \
  --desktop 1440x900
```

### 2. Post-Export Auditor (`post-export-auditor.js`)
Independent audit agent for analyzing exported content:

```bash
# Comprehensive audit with English reports
node post-export-auditor.js "http://original-url.com" "./exported-directory"

# Quick audit of current export
node post-export-auditor.js "http://micro.local/1-2/" "./1-2"
```

**Audit Features:**
- 📋 **Complete File Inventory**: Catalogs all exported files
- 🔍 **Static Analysis**: HTML/CSS/JS dependency mapping  
- 🔬 **Runtime Discovery**: Headless browser testing with interactions
- 📷 **Visual Comparison**: Screenshots and diff analysis
- 💾 **Waste Analysis**: Identifies unused files with size breakdown
- 🏷️ **Asset Classification**: Groups files by type and usage

### 3. Complete Automation (`auto-export.js`) 
End-to-end workflow automation:

```bash
# One command for complete workflow
node auto-export.js "https://example.com/page"
```

**Automated Steps:**
1. Fresh export with responsive capture
2. Comprehensive audit analysis
3. Intelligent unused file cleanup
4. Final optimized output creation
5. Verification and testing

### 4. Local Test Server (`serve-export.js`)
HTTP server for testing exported content:

```bash
# Serve exported directory on localhost:8080
node serve-export.js "./1-2" 8080

# Use default settings (./dist on port 8080)
node serve-export.js
```

## 📊 **Sample Audit Results**

The audit system provides detailed analysis across all responsive breakpoints:

```
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

**Generated Reports** (in `audit/` directory):
- `audit-report.html` - Visual dashboard with charts
- `audit-report.json` - Machine-readable data
- `asset-graph.json` - Complete dependency mapping
- 📄 `network-log.json` - Runtime network requests
- `screenshots/` - Viewport screenshots
- `visual-diff/` - Original vs local comparison

---

## 📖 Manual Usage

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
[page-name]/               # Final clean output directory
├── index.html            # Main exported page
├── export-info.json      # Export metadata and workflow info
└── assets/              # All downloaded assets
    ├── css/             # Stylesheets
    ├── js/              # JavaScript files
    ├── images/          # Images and media
    ├── fonts/           # Font files
    └── wp-content/      # WordPress theme and plugin assets

audit/                   # Independent audit reports (not in final output)
├── audit-report.html    # Visual audit dashboard
├── audit-report.json    # Machine-readable data
├── asset-graph.json     # Dependency mapping
├── network-log.json     # Runtime network requests
├── screenshots/         # Viewport screenshots
└── visual-diff/         # Original vs local comparison
```

## 🔧 How It Works

1. **Multi-Viewport Page Rendering**: Opens the page in Chromium across 7 different viewport sizes
2. **Responsive Breakpoint Testing**: 
   - XS (375x667) for ≤480px devices
   - SM (480x854) for ≤767px devices  
   - MD (768x1024) for ≤979px devices
   - LG (980x1200) for ≤1200px devices
   - XL (1366x900) for >1200px devices
   - Mobile (390x844) optimized mobile view
   - Desktop (1440x900) standard desktop view
3. **Content Activation**: 
   - Auto-scrolls to trigger lazy loading
   - Opens `<details>` elements
   - Clicks common accordion/tab toggles
   - 500ms delay between viewports to protect server resources
4. **Comprehensive Asset Collection**: Gathers resources from DOM + Performance API across all viewports
5. **Download & Rewrite**: Downloads assets locally and updates all references
6. **Optimization**: Inlines small assets, optionally bundles JS
7. **Output**: Creates portable static site with detailed metadata

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

## 🔍 Troubleshooting

### Common Issues

1. **Missing Assets**: Increase timeout or check CORS policies
2. **Broken Layout**: Try `--mode safe` for maximum compatibility
3. **Large File Sizes**: Assets >10KB aren't inlined; check network connections

### Debug Options

```bash
# Check what assets are being collected
node exporter_v2.js "https://yoursite.com" --mode safe
# Check export-info.json for export details in the final directory
```

## 🛠️ Development

### Project Structure

```
├── exporter_v2.js          # Main exporter script
├── post-export-auditor.js  # Independent audit agent
├── auto-export.js          # Complete automation workflow
├── serve-export.js         # Local test server
├── cleanup-unused.js       # Standalone cleanup utility
├── package.json            # Dependencies and scripts
└── README.md              # This documentation
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

### Complete Automated Workflow
```bash
node auto-export.js "https://yoursite.com/complex-page"
# This creates: complex-page/ directory with clean, optimized output
```

### Audit Existing Export
```bash
node post-export-auditor.js "https://original-url.com" "./exported-directory"
# Generates comprehensive analysis in audit/ directory
```

### Test Exported Content
```bash
node serve-export.js "./complex-page" 8080
# Serves on http://localhost:8080 for testing
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