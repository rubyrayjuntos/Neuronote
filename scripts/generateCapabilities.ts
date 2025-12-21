#!/usr/bin/env node
/**
 * Generate capabilities.json for Python gateway consumption.
 * 
 * Run with: npx tsx scripts/generateCapabilities.ts
 * 
 * This creates a JSON file that Python can import to validate
 * actions BEFORE calling the LLM, ensuring the "Dual Schema" problem is solved.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Dynamic imports for ESM compatibility
const __dirname = dirname(fileURLToPath(import.meta.url));

// Import from services
import { generateCapabilitiesManifest } from '../services/capabilities';
import { TRACE_SCHEMA } from '../services/tracing';

const PUBLIC_DIR = join(__dirname, '../public');
const OUTPUT_FILE = join(PUBLIC_DIR, 'capabilities.json');
const TRACE_SCHEMA_FILE = join(PUBLIC_DIR, 'trace-schema.json');

// Ensure public directory exists
if (!existsSync(PUBLIC_DIR)) {
  mkdirSync(PUBLIC_DIR, { recursive: true });
}

// Generate and write capabilities manifest
console.log('Generating capabilities manifest...');
const manifest = generateCapabilitiesManifest();
writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
console.log(`✓ Written to ${OUTPUT_FILE}`);
console.log(`  - ${manifest.layers.layer1_io.length} Layer 1 (I/O) primitives`);
console.log(`  - ${manifest.layers.layer2_operators.length} Layer 2 (Operator) primitives`);
console.log(`  - ${manifest.layers.layer3_control.length} Layer 3 (Control) primitives`);

// Generate and write trace schema
console.log('\nGenerating trace schema...');
writeFileSync(TRACE_SCHEMA_FILE, JSON.stringify(TRACE_SCHEMA, null, 2));
console.log(`✓ Written to ${TRACE_SCHEMA_FILE}`);

console.log('\n✅ Python gateway can now import these files to validate actions.');
console.log('   Usage in Python:');
console.log('   >>> import json');
console.log('   >>> capabilities = json.load(open("public/capabilities.json"))');
console.log('   >>> trace_schema = json.load(open("public/trace-schema.json"))');
