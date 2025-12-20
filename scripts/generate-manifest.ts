import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { OPERATOR_REGISTRY } from '../operators/registry.ts';
import { OperatorDefinition } from '../operators/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The manifest structure from process.md
// For now, we will categorize by the existing categories.
// A more advanced version could map them to lenses, sanitizers, predicates.
interface Manifest {
    version: string;
    timestamp: string;
    primitives: Record<string, Partial<OperatorDefinition>[]>;
}

function generateManifest() {
    console.log('Generating component manifest...');

    const manifest: Manifest = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        primitives: {},
    };

    for (const op of Object.values(OPERATOR_REGISTRY)) {
        const category = op.category.toLowerCase();
        if (!manifest.primitives[category]) {
            manifest.primitives[category] = [];
        }

        // We only want to expose the public-facing parts of the definition
        const { impl, ...publicOp } = op;

        manifest.primitives[category].push(publicOp);
    }

    const publicDir = path.join(__dirname, '..', 'public');
    if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir);
    }

    const manifestPath = path.join(publicDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`Manifest generated successfully at ${manifestPath}`);
}

generateManifest();
