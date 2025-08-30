# Quick Start Example

This example shows how to export a WordPress/ThemeCo page using the safe exporter.

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

### 4. Custom Viewport Sizes for Better Responsive Capture
```bash
node exporter_v2.js "https://example.com/responsive-page" \
  --mobile 414x896 \
  --desktop 1920x1080 \
  --mode safe
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