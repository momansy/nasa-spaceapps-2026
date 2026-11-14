import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const e2eDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repoDir = path.resolve(e2eDir, '..', '..');
export const serverDir = path.join(repoDir, 'server');
export const clientDir = path.join(repoDir, 'client');
export const schemaDir = path.join(repoDir, 'protocol', 'schema');
export const evidenceDir = path.join(repoDir, 'orchestration', 'evidence', 'T028');
export const hostWebDir = path.join(repoDir, 'docs', 'play', 'host');
