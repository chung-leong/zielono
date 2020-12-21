import Fs from 'fs'; const { writeFile, stat } = Fs.promises;
import { EventEmitter } from 'events';
import mkdirp from 'mkdirp';
import { dirname } from 'path';
import { getServerContentPath, getSiteContentPath } from './content-naming.mjs';

const contentEventEmitter = new EventEmitter;

async function saveServerContent(folder, hash, ext, buffer, options = {}) {
  const path = getServerContentPath(folder, hash, ext)
  return saveContent(path, buffer, options);
}

async function saveServerContentMeta(folder, hash, meta) {
  const text = JSON.stringify(meta, undefined, 2);
  const buffer = Buffer.from(text);
  await saveServerContent(folder, hash, 'meta.json', buffer);
  contentEventEmitter.emit('server-content-meta', folder, hash, meta);
}

async function saveSiteContent(site, folder, hash, ext, buffer, options = {}) {
  const path = getSiteContentPath(site, folder, hash, ext)
  return saveContent(path, buffer, options);
}

async function saveSiteContentMeta(site, folder, hash, meta) {
  const text = JSON.stringify(meta, undefined, 2);
  const buffer = Buffer.from(text);
  await saveSiteContent(site, folder, hash, 'meta.json', buffer);
  contentEventEmitter.emit('site-content-meta', site, folder, hash, meta);
}

async function removeServerContent(folder, hash, ext, options = {}) {
  const path = getServerContentPath(folder, hash, ext)
  return removeContent(path, options);
}

async function removeServerContentMeta(folder, hash) {
  await removeServerContent(folder, hash, 'meta.json', buffer);
  contentEventEmitter.emit('server-content-meta', folder, hash);
}

async function removeSiteContent(site, folder, hash, ext, options = {}) {
  const path = getSiteContentPath(site, folder, hash, ext)
  return removeContent(path, buffer, options);
}

async function removeSiteContentMeta(site, folder, hash) {
  await removeSiteContent(site, folder, hash, 'meta.json');
  contentEventEmitter.emit('site-content-meta', site, folder, hash);
}

const writeQueue = [];

async function saveContent(path, buffer, options) {
  const { hashed } = options;
  // see if the file content itself was used to generate the filename
  if (hashed === 'content') {
    // don't bother writing if the same data is on disk already
    try {
      const stat = await stat(path);
      if (stat.size == buffer.length) {
        return;
      }
    } catch (err) {
    }
    // see if it's being saved right now
    if (findInflightData(path)) {
      return;
    }
  }
  // save in queue so the loadSiteContent() can find it
  const op = { path, buffer };
  writeQueue.push(op);
  // ensure folder exists
  const folderPath = dirname(path);
  await mkdirp(folderPath);
  await writeFile(path, buffer);
  // pop it back out
  const index = writeQueue.indexOf(op);
  writeQueue.splice(index, 1);
}

async function removeContent(path, options) {
  const { ignoreError = true } = options;
  try {
    await unlink(path);
  } catch (err) {
    if (!ignoreError) {
      throw err;
    }
  }
}

function findInflightData(path) {
  const op = writeQueue.find((op) => op.path === path);
  return (op) ? op.buffer : null;
}

export {
  saveServerContent,
  saveServerContentMeta,
  saveSiteContent,
  saveSiteContentMeta,
  removeServerContent,
  removeServerContentMeta,
  removeSiteContent,
  removeSiteContentMeta,
  findInflightData,
  contentEventEmitter,
};
