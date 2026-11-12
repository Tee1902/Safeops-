import { writeFile, mkdir } from 'node:fs/promises';
import { createSwaggerDocument } from '../src/swagger.js';
import { createTestApplication } from './create-test-app.js';
const { app } = await createTestApplication();
try {
  await mkdir('docs', { recursive: true });
  await writeFile(
    'docs/openapi.json',
    `${JSON.stringify(createSwaggerDocument(app), null, 2)}\n`,
  );
  console.log('Exported docs/openapi.json');
} finally {
  await app.close();
}
