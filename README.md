# ThemeCo Pro Safe Exporter

A high-compatibility static site exporter for ThemeCo Pro and WordPress pages that ensures everything works as intended without breaking functionality.

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
- **Maximum Compatibility**: Safe mode preserves everything to ensure 1:1 functionality
- **Smart Asset Collection**: Captures assets from DOM parsing + Performance API across all viewports
- **Lazy Loading Support**: Auto-scrolling and UI interaction to trigger lazy-loaded content
- **Comprehensive Responsive Capture**: Multi-viewport rendering (XS: 375x667, SM: 480x854, MD: 768x1024, LG: 980x1200, XL: 1366x900)
- **Inline Optimization**: Small assets (<10KB) are inlined as data URIs for better portability
- **ThemeCo Optimized**: Special handling for ThemeCo accordion, tabs, and UI components
- **CORS Fallback**: Keeps original URLs for blocked third-party resources
- **Detailed Logging**: Comprehensive progress information and asset statistics

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