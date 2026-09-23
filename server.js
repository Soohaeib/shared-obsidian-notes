import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

const ignored = new Set(['.git', '.github', '.DS_Store', 'site-lib', 'guide', 'node_modules']);

// Recursively find markdown files in target directory
function scanMarkdownFiles(dirPath, relativeBase = '') {
  const results = [];
  try {
    if (!fs.existsSync(dirPath)) return results;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || ignored.has(entry.name)) continue;
      const fullPath = path.join(dirPath, entry.name);
      const relPath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        results.push(...scanMarkdownFiles(fullPath, relPath));
      } else if (entry.name.endsWith('.md')) {
        results.push(relPath);
      }
    }
  } catch (err) {
    console.error('Error scanning markdown files:', err);
  }
  return results;
}

// Dynamic Vault Discovery API
app.get('/api/vault-discovery', (req, res) => {
  const reqFolder = req.query.folder;
  let files = [];
  if (reqFolder) {
    const targetDir = path.join(__dirname, reqFolder);
    files = scanMarkdownFiles(targetDir, reqFolder);
  } else {
    // Scan all valid folders
    const entries = fs.readdirSync(__dirname, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.') && !ignored.has(entry.name)) {
        const fullPath = path.join(__dirname, entry.name);
        files.push(...scanMarkdownFiles(fullPath, entry.name));
      }
    }
  }
  res.json({ files });
});

// Dynamic fallback for semester workspace directories:
// If a directory does not have its own index.html, serve the viewer.html template
app.get('/:folder/', (req, res, next) => {
  const folder = req.params.folder;
  if (!ignored.has(folder)) {
    const folderPath = path.join(__dirname, folder);
    if (fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory()) {
      const folderIndex = path.join(folderPath, 'index.html');
      if (fs.existsSync(folderIndex)) {
        return res.sendFile(folderIndex);
      }
      const templateViewer = path.join(__dirname, 'site-lib', 'html', 'viewer.html');
      if (fs.existsSync(templateViewer)) {
        return res.sendFile(templateViewer);
      }
    }
  }
  next();
});

// Serve static assets with html extensions and correct content-type
app.use(express.static(__dirname, {
  extensions: ['html', 'htm'],
  index: 'index.html',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.wasm')) {
      res.setHeader('Content-Type', 'application/wasm');
    } else if (filePath.endsWith('.md')) {
      res.setHeader('Content-Type', 'text/markdown; charset=UTF-8');
    }
  }
}));

// Fallback to index.html for root navigation
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server is running at http://${HOST}:${PORT}`);
});
