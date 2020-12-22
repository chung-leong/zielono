import Fs from 'fs'; const { writeFile, stat } = Fs.promises;
import { EventEmitter } from 'events';
import mkdirp from 'mkdirp';
import { dirname } from 'path';
import { getServerContentPath, getSiteContentPath } from './content-naming.mjs';
import { findServerConfig } from './config-loading.mjs';

const contentEventEmitter = new EventEmitter;

async function saveServerContent(folder, hash, ext, buffer, options = {}) {
  const path = getServerContentPath(folder, hash, ext)
  return saveContent(path, buffer, options);
}

async function saveServerContentMeta(folder, hash, meta) {
  const text = JSON.stringify(meta, undefined, 2);
  const buffer = Buffer.from(text);
  await saveServerContent(folder, hash, 'meta.json', buffer);
  const server = findServerConfig();
  contentEventEmitter.emit('server-content-meta', { server, folder, hash, meta });
}

async function saveSiteContent(site, folder, hash, ext, buffer, options = {}) {
  const path = getSiteContentPath(site, folder, hash, ext)
  return saveContent(path, buffer, options);
}

async function saveSiteContentMeta(site, folder, hash, meta) {
  const text = JSON.stringify(meta, undefined, 2);
  const buffer = Buffer.from(text);
  await saveSiteContent(site, folder, hash, 'meta.json', buffer);
  contentEventEmitter.emit('site-content-meta', { site, folder, hash, meta });
}

async function removeServerContent(folder, hash, ext, options = {}) {
  const path = getServerContentPath(folder, hash, ext)
  return removeContent(path, options);
}

async function removeServerContentMeta(folder, hash) {
  await removeServerContent(folder, hash, 'meta.json');
  const server = findServerConfig();
  contentEventEmitter.emit('server-content-meta', { server, folder, hash });
}

async function removeSiteContent(site, folder, hash, ext, options = {}) {
  const path = getSiteContentPath(site, folder, hash, ext)
  return removeContent(path, options);
}

async function removeSiteContentMeta(site, folder, hash) {
  await removeSiteContent(site, folder, hash, 'meta.json');
  contentEventEmitter.emit('site-content-meta', { site, folder, hash });
}

const writeQueue = [];

async function saveContent(path, buffer, options) {
  const { hashed } = options;
  // see if it's being saved right now
  const inflight = findInflightData(path);
  // save in queue so the loadSiteContent() can find it
  const op = { path, buffer };
  writeQueue.push(op);
  // see if the file content itself was used to generate the filename
  let bypass = false;
  if (hashed === 'content') {
    if (inflight && inflight.length === buffer.length) {
      bypass = true;
    } else {
      // don't bother writing if the same data is on disk already
      try {
        const file = await stat(path);
        if (file.size == buffer.length) {
          bypass = true;
        }
      } catch (err) {
      }
    }
  }
  if (!bypass) {
    // ensure folder exists
    const folderPath = dirname(path);
    await mkdirp(folderPath);
    await writeFile(path, buffer);
  }
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
  for (let i = writeQueue.length - 1; i >= 0; i--) {
    const op = writeQueue[i];
    if (op.path === path) {
      return op.buffer;
    }
  }
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
