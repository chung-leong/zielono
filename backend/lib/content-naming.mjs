import { join } from 'path';
import { createHash } from 'crypto';

function getHash(...args) {
  const hash = createHash('sha1');
  for (let data of args) {
    hash.update(data);
  }
  return hash.digest('hex');
}

function getSiteContentPath(site, folder, hash, ext) {
  const { storage } = site;
  const filename = (ext) ? `${hash}.${ext}` : hash;
  const path = join(storage.path, folder, filename);
  return path;
}

export {
  getHash,
  getSiteContentPath,
};
