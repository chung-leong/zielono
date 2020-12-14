import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getAssetPath(relPath) {
  const path = join(__dirname, '../assets', relPath);
  return path;
}

function getRepoPath() {
  const path = resolve(__dirname, '../../..');
  return path;
}

export {
  getAssetPath,
  getRepoPath,
};
