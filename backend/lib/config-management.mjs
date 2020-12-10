import Fs from 'fs'; const { readFile, readdir, stat } = Fs.promises;
import { EventEmitter } from 'events';
import { join, resolve, basename } from 'path';
import sortedIndexBy from 'lodash/sortedIndexBy.js';
import get from 'lodash/get.js';
import isEqual from 'lodash/isEqual.js';
import JsYAML from 'js-yaml'; const { safeLoad, safeDump } = JsYAML;
import { object, number, string, array, boolean, create, coerce, define } from 'superstruct';
import 'superstruct-chain';
import Chokidar from 'chokidar';
import { diffLines } from 'diff';
import { checkTimeZone } from './time-zone-management.mjs';
import Colors from 'colors/safe.js'; const { red, green, gray, strikethrough } = Colors;
import { ErrorCollection, displayError } from './error-handling.mjs';

let configFolder;
let serverConfig;
let siteConfigs;
let accessTokens;

function setConfigFolder(path) {
  configFolder = path;
  serverConfig = siteConfigs = accessTokens = undefined;
}

function getConfigFolder() {
  if (!configFolder) {
    throw new Error('Configuration folder is undefined');
  }
  return configFolder;
}

const configEventEmitter = new EventEmitter;

function watchConfigFolder() {
  const folder = getConfigFolder();
  const options = {
    ignoreInitial: true,
    awaitWriteFinish: true,
    depth: 0,
  };
  const watcher = Chokidar.watch(`${folder}/*.yaml`, options);
  watcher.on('add', (path) => handleConfigChange('add', path));
  watcher.on('unlink', (path) => handleConfigChange('unlink', path));
  watcher.on('change', (path, stats) => handleConfigChange('change', path));
}

function processServerConfig(config) {
  const folder = getConfigFolder();
  const serverDef = object({
    // listen can be specified using a number
    listen: array().coerce(number(), (port) => [ port ]).defaulted([ 8080 ]),
    nginx: object({
      port: number().defaulted(80),
      cache: object({
        // path resolve against config folder
        path: string().coerce(string(), (path) => resolve(folder, path)),
      }).optional(),
    }).optional(),
  });
  return create(config, serverDef);
}

async function getServerConfig() {
  if (serverConfig) {
    return serverConfig;
  }
  await loadServerConfig();
  return serverConfig;
}

async function loadServerConfig() {
  const folder = getConfigFolder();
  const filename = `zielono.yaml`;
  const path = join(folder, filename);
  const text = await readFile(path, 'utf-8');
  const config = safeLoad(text);
  try {
    serverConfig = processServerConfig(config);
    return serverConfig;
  } catch (err) {
    err.filename = filename;
    err.lineno = findLineNumber(text, err.path);
    throw err;
  }
}

function removeServerConfig() {
  serverConfig = undefined;
}

async function findSiteConfig(name) {
  const sites = await getSiteConfigs();
  return sites.find((s) => s.name === name);
}

function processSiteConfig(name, config) {
  const folder = getConfigFolder();
  const urlOrPath  = (value, ctx) => {
    if ((!value.path && !value.url) || (value.path && value.url)) {
      return ctx.fail('Expected either url or path to be present');
    } else {
      return true;
    }
  };
  const siteDef = object({
    name: string(),
    domains: array(string()).defaulted([]),
    files: array(
      object({
        name: string(),
        // path resolve against config folder
        path: string().coerce(string(), (path) => resolve(folder, path)).optional(),
        url: string().optional(),
        timeZone: define('time zone', checkTimeZone).optional(),
        headers: boolean().defaulted(true),
      }).refine('url-or-path', urlOrPath),
    ).defaulted([]),
    locale: string().optional(),
    storage: object({
      path: string().coerce(string(), (path) => resolve(folder, path)).optional(),
    }).defaulted({
      path: resolve(folder, name)
    }),
    code: object({
      path: string().coerce(string(), (path) => resolve(folder, path)).optional(),
      url: string().optional(),
    }).refine('url-or-path', urlOrPath).optional()
  });
  return create({ name, ...config }, siteDef);
}

async function loadSiteConfig(name) {
  const folder = getConfigFolder();
  const filename = `${name}.yaml`;
  const path = join(folder, filename);
  const text = await readFile(path, 'utf-8');
  const config = safeLoad(text);
  try {
    const site = processSiteConfig(name, config);
    const index = sortedIndexBy(siteConfigs, site, 'name');
    const slot = siteConfigs[index];
    if (slot && slot.name === site.name) {
      siteConfigs[index] = site;
    } else {
      siteConfigs.splice(index, 0, site);
    }
    return site;
  } catch (err) {
    err.filename = filename;
    err.lineno = findLineNumber(text, err.path);
    throw err;
  }
}

function removeSiteConfig(name) {
  siteConfigs = siteConfigs.filter((s) => s.name !== name);
}

async function getSiteConfigs() {
  if (siteConfigs) {
    return siteConfigs;
  }
  siteConfigs = [];
  const items = await readdir(getConfigFolder());
  const names = [];
  for (let item of items) {
    if (item.endsWith('.yaml') && !item.startsWith('.')) {
      const name = item.substr(0, item.length - 5);
      if (name !== 'zielono' && name !== '-') {
        names.push(name);
      }
    }
  }
  const errors = [];
  for (let name of names) {
    try {
      await loadSiteConfig(name);
    } catch (err) {
      errors.push(err);
    }
  }
  if (errors.length > 0) {
    throw new ErrorCollection(errors);
  }
  return siteConfigs;
}

function processTokenConfig(config) {
  const tokenListDef = array(
    object({
      url: string(),
      token: string(),
    })
  );
  return create(config, tokenListDef);
}

async function loadAccessTokens() {
  const folder = getConfigFolder();
  const filename = `.tokens.yaml`;
  const path = join(folder, filename);
  let text;
  try {
    const file = await stat(path);
    if (file.mode & (Fs.constants.S_IROTH)) {
      console.warn(`Warning: ${filename} can be read by others`)
    }
    if (file.mode & (Fs.constants.S_IWOTH)) {
      console.warn(`Warning: ${filename} can be modified by others`)
    }
    text = await readFile(path, 'utf-8');
  } catch (err) {
    if (err.errno === -2) {  // not found
      text = '[]';
    } else {
      throw err;
    }
  }
  const config = safeLoad(text);
  try {
    accessTokens = processTokenConfig(config);
    return accessTokens;
  } catch (err) {
    err.filename = filename;
    err.lineno = findLineNumber(text, err.path);
    throw err;
  }
}

async function findAccessToken(url) {
  if (!accessTokens) {
    await loadAccessTokens();
  }
  const entry = accessTokens.find((t) => url.startsWith(t.url));
  if (entry) {
    return entry.token;
  }
}

function findLineNumber(text, path) {
  if (!(path instanceof Array)) {
    return;
  }
  const lines = text.split(/\r?\n/);
  while (path.length > 0) {
    // add lines one at a time until the object appears at the path
    for (let i = 0, t = ''; i < lines.length; i++) {
      try {
        t += lines[i] + '\n';
        const tree = safeLoad(t);
        if (get(tree, path) !== undefined) {
          return i + 1;
        }
      } catch (err) {
      }
    }
    // shorten the path and try again
    path = path.slice(0, -1);
  }
  return 0;
}

async function preloadConfig() {
  const errors = [];
  let server, sites;
  try {
    server = await getServerConfig();
  } catch (err) {
    errors.push(err);
  }
  try {
    sites = await getSiteConfigs();
  } catch (err) {
    errors.push(err);
  }
  try {
    await loadAccessTokens()
  } catch (err) {
    errors.push(err);
  }
  if (errors.length > 0) {
    throw new ErrorCollection(errors);
  }
  return { server, sites };
}

async function handleConfigChange(event, path) {
  try {
    const filename = basename(path);
    const name = filename.replace(/\.yaml$/, '');
    const present = (event === 'add' || event === 'change');
    let description;
    if (event === 'add') {
      description = `Added ${filename}:`;
    } else if (event === 'unlink') {
      description = `Removed ${filename}:`;
    } else if (event === 'change') {
      description = `Changes to ${filename}:`;
    }
    if (name === 'zielono') {
      let before = serverConfig;
      let after = (present) ? await loadServerConfig() : removeServerConfig();
      if (!isEqual(before, after)) {
        configEventEmitter.emit('server-change', before, after);
        // set server.listen to port number if only that's provided
        if (before && before.listen.length === 1) {
          if (typeof(before.listen[0]) === 'number') {
            before = { ...before, listen: before.listen[0] };
          }
        }
        if (after && after.listen.length === 1) {
          if (typeof(after.listen[0]) === 'number') {
            after = { ...after, listen: after.listen[0] };
          }
        }
        displayConfigChanges(before, after, description);
      }
    } else if (name === '.tokens') {
      // TODO
    } else {
      const before = siteConfigs.find((s) => s.name === name);
      const after = (present) ? await loadSiteConfig(name) : removeSiteConfig(name);
      if (!isEqual(before, after)) {
        configEventEmitter.emit('site-change', before, after);
        displayConfigChanges(before, after, description);
      }
    }
  } catch (err) {
    displayError(err, 'config-change');
  }
}

function displayConfigChanges(before, after, description) {
  const beforeText = (before) ? safeDump(before, { skipInvalid: true }) : '';
  const afterText = (after) ? safeDump(after, { skipInvalid: true }) : '';
  const diff = diffLines(beforeText, afterText);
  const re = /^([\-\s]*)(.*)/gm;
  let output = '';
  for (let section of diff) {
    const { value, added, removed } = section;
    const m = /^\S([\s\S]*?)(\s*)$/.exec(value);
    if (removed) {
      output += value.replace(re, (m0, m1, m2) => m1 + red(strikethrough(m2))) ;
    } else if (added) {
      output += value.replace(re, (m0, m1, m2) => m1 + green(m2)) ;
    } else {
      output += value.replace(re, (m0, m1, m2) => m1 + gray(m2)) ;
    }
  }
  console.log(description);
  console.log(output.trimEnd());
}

export {
  setConfigFolder,
  getConfigFolder,
  watchConfigFolder,
  preloadConfig,
  getServerConfig,
  processServerConfig,
  findSiteConfig,
  getSiteConfigs,
  processTokenConfig,
  findAccessToken,
  processSiteConfig,
  configEventEmitter,
};
