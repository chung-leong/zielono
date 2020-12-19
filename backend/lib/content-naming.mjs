import { join } from 'path';
import { createHash } from 'crypto';
import { findServerConfig } from './config-loading.mjs';

function getHash(...args) {
  const hash = createHash('sha1');
  for (let data of args) {
    hash.update(data);
  }
  return hash.digest('hex');
}

function getServerContentPath(folder, hash, ext) {
  const { storage } = findServerConfig();
  const filename = (ext) ? `${hash}.${ext}` : hash;
  const path = join(storage.path, folder, filename);
  return path;
}

function getSiteContentPath(site, folder, hash, ext) {
  const { storage } = site;
  const filename = (ext) ? `${hash}.${ext}` : hash;
  const path = join(storage.path, folder, filename);
  return path;
}

export {
  getHash,
  getServerContentPath,
  getSiteContentPath,
};
