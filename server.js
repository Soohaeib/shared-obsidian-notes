import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

// Load locations.json configuration dynamically
let locationsConfig = {
  targetVaultDirectory: 'note-res',
  sourceVaultPaths: ['~/Documents/Obsidian Vault/BBA Study'],
  sourceExclusionPaths: ['~/Documents/Obsidian Vault/BBA Study/Expansion of class notes'],
  sourceExclusionFiles: [],
  excludedFolders: ['.git', '.github', '.DS_Store', 'site-lib', 'guide', 'node_modules', 'backup-directory', 'backups', 'backup', '__pycache__'],
  excludedFiles: ['.DS_Store', 'desktop.ini', 'Thumbs.db', 'ehthumbs.db', 'package-lock.json', 'bun.lock']
};

try {
  const locRaw = fs.readFileSync(path.join(__dirname, 'locations.json'), 'utf-8');
  locationsConfig = { ...locationsConfig, ...JSON.parse(locRaw) };
} catch (e) {
  console.log('Notice: locations.json loaded with defaults');
}

const VAULT_CONTAINER = locationsConfig.targetVaultDirectory || 'note-res';
const ignoredFolders = new Set([
  ...(locationsConfig.excludedFolders || []),
  ...(locationsConfig.sourceExclusionPaths || [])
]);
const ignoredFiles = new Set([
  ...(locationsConfig.excludedFiles || []),
  ...(locationsConfig.sourceExclusionFiles || [])
]);

function isIgnored(name, fullPath = '') {
  if (!name || name.startsWith('.')) return true;
  const low = name.toLowerCase().trim();
  if (ignoredFolders.has(name) || ignoredFiles.has(name)) return true;
  for (const item of ignoredFolders) {
    const itemClean = item.toLowerCase().trim();
    if (low === itemClean || (fullPath && fullPath.toLowerCase().includes(itemClean))) {
      return true;
    }
  }
  for (const item of ignoredFiles) {
    const itemClean = item.toLowerCase().trim();
    if (low === itemClean || (fullPath && fullPath.toLowerCase().endsWith(itemClean))) {
      return true;
    }
  }
  if (low.includes('backup') || low.endsWith('.bak') || low.endsWith('.tmp')) return true;
  return false;
}

// Recursively find markdown files in target directory
function scanMarkdownFiles(dirPath, relativeBase = '') {
  const results = [];
  try {
    if (!fs.existsSync(dirPath)) return results;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (isIgnored(entry.name, fullPath)) continue;
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
    // Check inside note-res first
    const containerDirPath = path.join(__dirname, VAULT_CONTAINER, reqFolder);
    if (fs.existsSync(containerDirPath)) {
      files = scanMarkdownFiles(containerDirPath, `${VAULT_CONTAINER}/${reqFolder}`);
    } else {
      const rootDirPath = path.join(__dirname, reqFolder);
      if (fs.existsSync(rootDirPath)) {
        files = scanMarkdownFiles(rootDirPath, reqFolder);
      }
    }
  } else {
    // Return all discovered markdown files across container
    const containerPath = path.join(__dirname, VAULT_CONTAINER);
    if (fs.existsSync(containerPath)) {
      files = scanMarkdownFiles(containerPath, VAULT_CONTAINER);
    }
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({ files });
});

// Middleware for setting proper MIME types and disabling caching
app.use((req, res, next) => {
  const cleanPath = req.path.split('?')[0];
  if (cleanPath.endsWith('.md')) {
    res.setHeader('Content-Type', 'text/markdown; charset=UTF-8');
  } else if (cleanPath.endsWith('.html')) {
    res.setHeader('Content-Type', 'text/html; charset=UTF-8');
  } else if (cleanPath.endsWith('.js')) {
    res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
  } else if (cleanPath.endsWith('.css')) {
    res.setHeader('Content-Type', 'text/css; charset=UTF-8');
  } else if (cleanPath.endsWith('.json')) {
    res.setHeader('Content-Type', 'application/json; charset=UTF-8');
  }
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  next();
});

// Direct route aliases for workspace folder paths
const containerDir = path.join(__dirname, VAULT_CONTAINER);
if (fs.existsSync(containerDir)) {
  const subDirs = fs.readdirSync(containerDir, { withFileTypes: true });
  for (const d of subDirs) {
    if (d.isDirectory() && !isIgnored(d.name)) {
      const routePrefix = `/${encodeURIComponent(d.name)}`;
      const routePrefixRaw = `/${d.name}`;
      
      const folderStatic = express.static(path.join(containerDir, d.name), {
        dotfiles: 'ignore',
        index: ['index.html']
      });
      
      app.use(routePrefix, folderStatic);
      if (routePrefix !== routePrefixRaw) {
        app.use(routePrefixRaw, folderStatic);
      }
    }
  }
}

// Static file serving from project root
app.use(express.static(__dirname, {
  dotfiles: 'ignore',
  index: ['index.html']
}));

// Fallback index for SPA routing
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Obsidian Vault Index not found. Run python3 sync_site.py to generate.');
  }
});

app.listen(PORT, HOST, () => {
  console.log(`🌌 Shared Obsidian Vault server active on http://${HOST}:${PORT}`);
  console.log(`   Workspace container: ${VAULT_CONTAINER}`);
});
