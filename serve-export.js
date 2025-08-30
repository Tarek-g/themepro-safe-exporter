#!/usr/bin/env node

/**
 * Simple local HTTP server for testing exported static sites
 * Usage: node serve-export.js [directory] [port]
 * Default: serves ./dist on port 8080
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import url from 'url';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

const DEFAULT_PORT = 8080;
const DEFAULT_DIR = './dist';

// Command line arguments
const args = process.argv.slice(2);
const serveDir = path.resolve(args[0] || DEFAULT_DIR);
const port = parseInt(args[1]) || DEFAULT_PORT;

// Check if directory exists
if (!fs.existsSync(serveDir)) {
  console.error(`❌ Directory does not exist: ${serveDir}`);
  process.exit(1);
}

// MIME types for common files
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || 'application/octet-stream';
}

function serveFile(res, filePath) {
  const fullPath = path.join(serveDir, filePath);
  
  fs.readFile(fullPath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
      }
      return;
    }
    
    const mimeType = getMimeType(filePath);
    res.writeHead(200, { 
      'Content-Type': mimeType,
      'Access-Control-Allow-Origin': '*', // Allow CORS for local testing
      'Cache-Control': 'no-cache' // Prevent caching during development
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);
  let pathname = decodeURIComponent(parsedUrl.pathname);
  
  // Security: prevent directory traversal
  if (pathname.includes('..')) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('400 Bad Request');
    return;
  }
  
  // Default to index.html for directory requests
  if (pathname === '/' || pathname.endsWith('/')) {
    pathname += 'index.html';
  }
  
  // Remove leading slash
  if (pathname.startsWith('/')) {
    pathname = pathname.slice(1);
  }
  
  // Check if file exists
  const fullPath = path.join(serveDir, pathname);
  
  fs.stat(fullPath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Try index.html fallback for SPA-style routing
      serveFile(res, 'index.html');
    } else {
      serveFile(res, pathname);
    }
  });
});

server.listen(port, () => {
  console.log(`🚀 Local server running at http://localhost:${port}`);
  console.log(`📁 Serving directory: ${serveDir}`);
  console.log(`🌐 Open in browser: http://localhost:${port}`);
  console.log(`⏹️  Press Ctrl+C to stop`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Server stopping...');
  server.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });
});