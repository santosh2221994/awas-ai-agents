import 'dotenv/config';
import { mastra } from './src/mastra/index.js';

async function run() {
  console.log('Mastra Editor methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(mastra.editor)));
}
run();
