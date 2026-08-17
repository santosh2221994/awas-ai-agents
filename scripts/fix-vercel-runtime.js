import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), '.vercel', 'output', 'functions', 'index.func', '.vc-config.json');

if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.runtime = 'nodejs22.x';
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  console.log('✓ Successfully set Vercel runtime to nodejs22.x in .vc-config.json');
} else {
  console.warn('! .vc-config.json not found at', configPath);
}
