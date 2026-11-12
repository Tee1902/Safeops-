import { rmSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';

const project = resolve(import.meta.dirname, '..');
const target = resolve(project, '.test-dist');
if (dirname(target) !== project || basename(target) !== '.test-dist')
  throw new Error('Unexpected compiled test directory');
rmSync(target, { recursive: true, force: true });
