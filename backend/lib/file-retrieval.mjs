import Fs from 'fs'; const { readFile, stat } = Fs.promises;
import deasync from 'deasync';
import fetch from 'cross-fetch';
import { getAgent as agent } from './http-agents.mjs';
import { join, basename } from 'path';
import Module, { createRequire } from 'module';
import { findGitAdapter } from './git-adapters.mjs';
import { getHash }  from './content-storage.mjs';
import { HttpError } from './error-handling.mjs';

async function retrieveFromCloud(url, options) {
  const { etag, mtime } = options;
  const fileURL = getDownloadURL(url);
  const timeout = 5000;
  const headers = {};
  if (etag) {
    headers['If-None-Match'] = etag;
  } else if (mtime) {
    headers['If-Modified-Since'] = (new Date(mtime)).toUTCString();
  }
  const res = await fetch(fileURL, { headers, timeout, agent });
  if (res.status === 200) {
    const buffer = await res.buffer();
    buffer.type = res.headers.get('content-type');
    buffer.etag = res.headers.get('etag');
    // get filename
    const disposition = res.headers.get('content-disposition');
    if (disposition) {
      const m = /filename=("(.+?)"|\S+)/i.exec(disposition);
      if (m) {
        buffer.filename = m[2] || m[1];
      }
    }
    const lastModified = res.headers.get('last-modified');
    if (lastModified) {
      buffer.mtime = new Date(lastModified);
    }
    return buffer;
  } else if (res.status === 304) {
    return null;
  } else {
    let message;
    try {
      const json = await res.json();
      if (json && json.error) {
        message = json.error;
      }
    } catch (err) {
    }
    throw new HttpError(res.status, message);
  }
}

/**
 * Adjust a URL based on the cloud storage provider so that we receive the
 * actual contents
 *
 * @param  {string} url
 *
 * @return {string}
 */
function getDownloadURL(url) {
  return getDropboxURL(url)
      || getOneDriveURL(url)
      || url;
}

/**
 * Return the download URL for a shared file on Dropbox
 *
 * @param  {string} url
 *
 * @return {string|undefined}
 */
function getDropboxURL(url) {
  if (/^https:\/\/(www\.dropbox\.com)\//.test(url)) {
    url = url.replace('?dl=0', '?dl=1');
    return url;
  }
}

/**
 * Return the download URL for a shared file on OneDrive
 *
 * @param  {string} url
 *
 * @return {string|undefined}
 */
function getOneDriveURL(url) {
  if (/^https:\/\/(1drv\.ms|onedrive\.live\.com)\//.test(url)) {
    // encode url as base64
    let token = Buffer.from(url).toString('base64');
    token = token.replace(/=$/, '');
    token = token.replace(/\//g, '_');
    token = token.replace(/\+/g, '-');
    token = 'u!' + token;
    return `https://api.onedrive.com/v1.0/shares/${token}/root/content`;
  }
}

async function retrieveFromGit(path, options) {
  const adapter = findGitAdapter(options);
  const { url } = options;
  if (adapter) {
    const buffer = await adapter.retrieveFile(path, options);
    return buffer;
  } else {
    throw new Error(`Cannot find an adapter for repo: ${url}`);
  }
}

const retrieveFromGitSync = deasync((path, options, cb) => {
  retrieveFromGit(path, options).then((data) => {
    cb(null, data);
  }).catch((err) => {
    cb(err, null);
  });
});

const gitFS = '/$git/';
let resolveFilenameBefore, jsExtensionBefore;

/**
 * Override require() so that code can be retrieved from remote location
 *
 * @param  {object} options
 */
function overrideRequire(options) {
  const moduleWhitelist = [ 'stream' ];
  // override filename resolution
  resolveFilenameBefore = Module._resolveFilename;
  Module._resolveFilename = function(request, parent, isMain) {
    if (request.startsWith('./') && parent.filename.startsWith(gitFS)) {
      const path = join(parent.path, request);
      if (path.startsWith(gitFS)) {
        return path;
      }
    } else if (moduleWhitelist.includes(request)) {
      return resolveFilenameBefore(request, parent, isMain);
    }
    throw new Error(`Cannot find module '${request}'`);
  };
  // override JS loader
  jsExtensionBefore = Module._extensions['.js'];
  Module._extensions['.js'] = function(module, path) {
    if (path.startsWith(gitFS)) {
      const repoPath = path.substr(gitFS.length);
      let content = retrieveFromGitSync(repoPath, options);
      if (typeof(content) != 'string') {
        content = content.toString();
      }
      module._compile(content, path);
    } else {
      jsExtensionBefore(module, path);
    }
  };
}

function requireGit(path) {
  const require = createRequire(gitFS);
  return require(path);
}

function restoreRequire() {
  if (resolveFilenameBefore && jsExtensionBefore) {
    Module._resolveFilename = resolveFilenameBefore;
    Module._extensions['.js'] = jsExtensionBefore;
    resolveFilenameBefore = jsExtensionBefore = undefined;
  }
}

async function retrieveFromDisk(path, options) {
  const { mtime } = await stat(path);
  const { mtime: mtimeBeforeString } = options;
  const mtimeBefore = (mtimeBeforeString) ? new Date(mtimeBeforeString) : null;
  if (mtimeBefore && mtime.getTime() == mtimeBefore.getTime()) {
    // file isn't modified
    return null;
  }
  const buffer = await readFile(path);
  buffer.filename = basename(path);
  buffer.etag = getHash(buffer);
  buffer.mtime = mtime;
  return buffer;
}

export {
  retrieveFromGit,
  retrieveFromGitSync,
  retrieveFromCloud,
  retrieveFromDisk,
  requireGit,
  overrideRequire,
  restoreRequire,
  getDownloadURL,
};
