import fs from 'fs';
import path from 'path';

// 1. Node version check
const v = process.versions.node.split('.').map(Number);
if (v[0] < 22) {
  console.error('\x1b[31mERROR: Node >=22 required. Current: ' + process.version + '\x1b[0m');
  process.exit(1);
}

// 2. Patch Mastra CLI build completion to ensure process.exit(0) is called
const mastraDistPath = path.join(process.cwd(), 'node_modules', 'mastra', 'dist', 'index.js');

if (fs.existsSync(mastraDistPath)) {
  let content = fs.readFileSync(mastraDistPath, 'utf8');
  let changed = false;

  const target1 = 'logger2.info("You can now deploy the .mastra/output directory to your target platform.");';
  const target2 = 'logger2.info("Build successful, you can now deploy the .mastra/output directory to your target platform.");';

  if (content.includes(target1) && !content.includes(target1 + '\n    process.exit(0);')) {
    content = content.replace(target1, target1 + '\n    process.exit(0);');
    changed = true;
  }

  if (content.includes(target2) && !content.includes(target2 + '\n    process.exit(0);')) {
    content = content.replace(target2, target2 + '\n    process.exit(0);');
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(mastraDistPath, content, 'utf8');
    console.log('✓ Successfully patched Mastra CLI build to exit cleanly on completion');
  } else {
    console.log('✓ Mastra CLI build already patched or targets not found');
  }
} else {
  console.warn('! mastra/dist/index.js not found at', mastraDistPath);
}
