import fs from 'fs';
import path from 'path';

const funcDir = path.join(process.cwd(), '.vercel', 'output', 'functions', 'index.func');
const configPath = path.join(funcDir, '.vc-config.json');
const nodeModulesDir = path.join(funcDir, 'node_modules');

// 1. Fix .vc-config.json runtime
if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.runtime = 'nodejs22.x';
  config.shouldAddHelpers = true;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  console.log('✓ Successfully set Vercel runtime to nodejs22.x in .vc-config.json');
} else {
  console.warn('! .vc-config.json not found at', configPath);
}

// 2. Prune heavy unused packages for serverless bundle
if (fs.existsSync(nodeModulesDir)) {
  const packagesToPrune = [
    '@duckdb',
    '@mastra/duckdb',
    'cloudflare',
    'agent-browser',
    '@mastra/agent-browser',
    'playwright-core',
    'playwright',
    '@appium',
    'webdriverio',
    '@wdio',
    'webdriver',
    'geckodriver',
    'edgedriver',
    'safaridriver',
    'typescript',
    '@composio',
    '@types',
    'pusher-js',
    '@zip.js',
  ];

  let prunedCount = 0;
  for (const pkg of packagesToPrune) {
    const pkgPath = path.join(nodeModulesDir, pkg);
    if (fs.existsSync(pkgPath)) {
      fs.rmSync(pkgPath, { recursive: true, force: true });
      prunedCount++;
    }
  }
  console.log(`✓ Pruned ${prunedCount} heavy/incompatible packages from bundle node_modules`);

  // 3. Remove .map (source map) files to save space safely
  let removedMaps = 0;
  function removeSourceMaps(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          removeSourceMaps(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.map')) {
          fs.rmSync(fullPath, { force: true });
          removedMaps++;
        }
      }
    } catch {
      // Ignore permission or read errors
    }
  }

  removeSourceMaps(nodeModulesDir);
  console.log(`✓ Removed ${removedMaps} source map (.map) files from bundle`);
}
