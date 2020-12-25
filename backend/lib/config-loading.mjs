import Fs from 'fs'; const { readFile, readdir, stat } = Fs.promises;
import { join, resolve } from 'path';
import sortedIndexBy from 'lodash/sortedIndexBy.js';
import get from 'lodash/get.js';
import JsYAML from 'js-yaml'; const { safeLoad } = JsYAML;
import { object, number, string, array, boolean, create, coerce, define } from 'superstruct';
import 'superstruct-chain';
import { checkTimeZone } from './time-zone-management.mjs';
import { unwatchConfigFolder } from './config-watching.mjs';
import { ErrorCollection } from './error-handling.mjs';
import { getIPv4Address } from './network-handling.mjs';

let configFolder;
let serverConfig;
let siteConfigs;
let accessTokens;

function setConfigFolder(path) {
  configFolder = path;
  serverConfig = siteConfigs = accessTokens = undefined;
  unwatchConfigFolder().then(() => {});
}

function getConfigFolder() {
  if (!configFolder) {
    throw new Error('Configuration folder is undefined');
  }
  return configFolder;
}

function findServerConfig() {
  return serverConfig;
}

function findSiteConfig(name) {
  if (siteConfigs) {
    return siteConfigs.find((s) => s.name === name);
  }
}

function findSiteConfigs() {
  return siteConfigs;
}

function findAccessToken(url) {
  if (accessTokens) {
    const entry = accessTokens.find((t) => url.startsWith(t.url));
    if (entry) {
      return entry.token;
    }
  }
}

function findAccessTokens() {
  return accessTokens;
}

async function loadConfig(path) {
  if (path) {
    setConfigFolder(path);
  }
  const errors = [];
  let server, sites;
  try {
    server = await loadServerConfig();
  } catch (err) {
    errors.push(err);
  }
  try {
    sites = await loadSiteConfigs();
  } catch (err) {
    errors.push(err);
  }
  try {
    await loadAccessTokens();
  } catch (err) {
    errors.push(err);
  }
  if (errors.length > 0) {
    throw new ErrorCollection(errors);
  }
  return { server, sites };
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

async function loadSiteConfig(name) {
  const folder = getConfigFolder();
  const filename = `${name}.yaml`;
  const path = join(folder, filename);
  const text = await readFile(path, 'utf-8');
  const config = safeLoad(text);
  try {
    const site = processSiteConfig(name, config);
    if (!siteConfigs) {
      siteConfigs = [];
    }
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

async function loadSiteConfigs() {
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
  if (!siteConfigs) {
    siteConfigs = [];
  }
  return siteConfigs;
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

function removeServerConfig() {
  serverConfig = undefined;
}

function removeSiteConfig(name) {
  siteConfigs = siteConfigs.filter((s) => s.name !== name);
}

function removeAccessTokens() {
  accessTokens = undefined;
}

function processServerConfig(config) {
  const folder = getConfigFolder();
  const serverDef = object({
    // listen can be specified using a number
    listen: array().coerce(number(), (port) => [ port ]).defaulted([ 8080 ]),
    storage: object({
      path: string().optional().coerce(string(), (path) => resolve(folder, path)),
    }).defaulted({
      path: resolve(folder, 'zielono')
    }),
    nginx: object({
      url: string().defaulted(`http://${getIPv4Address()}`),
      cache: object({
        // path resolve against config folder
        path: string().coerce(string(), (path) => resolve(folder, path)),
      }).optional(),
    }).optional(),
    ngrok: object({
      url: string(),
    }).optional(),
  });
  return create(config, serverDef);
}

function processSiteConfig(name, config) {
  const folder = getConfigFolder();
  const urlOrPath  = (value, ctx) => {
    if (value) {
      if ((!value.path && !value.url) || (value.path && value.url)) {
        return [ ctx.fail('Expected either url or path to be present') ];
      }
    }
    return true;
  };
  const siteDef = object({
    name: string(),
    domains: array(string()).defaulted([]),
    locale: string().optional(),
    localization: string().defaulted('language'),
    files: array(
      object({
        name: string(),
        // path resolve against config folder
        path: string().optional().coerce(string(), (path) => resolve(folder, path)),
        url: string().optional(),
        locale: string().optional(),
        timeZone: define('time zone', checkTimeZone).optional(),
        headers: boolean().defaulted(true),
        maxAge: number().defaulted(5 * 60),
      }).refine('url-or-path', urlOrPath),
    ).defaulted([]),
    storage: object({
      path: string().optional().coerce(string(), (path) => resolve(folder, path)),
    }).defaulted({
      path: resolve(folder, name)
    }),
    page: object({
      code: object({
        path: string().optional().coerce(string(), (path) => resolve(folder, path)),
        url: string().optional(),
        ref: string().optional().coerce(string(), (name) => {
          if (!/^(heads|tags)\b/.test(name)) {
            if (!/^[a-f0-9]{40}$/.test(name)) {
              return `heads/${name}`;
            }
          }
          return name
        }),
      }).refine('url-or-path', urlOrPath),
      maxAge: number().defaulted(30 * 60),
    }).optional(),
  });
  return create({ name, ...config }, siteDef);
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

function setServerConfig(config) {
  serverConfig = config;
}

export {
  setConfigFolder,
  getConfigFolder,
  findServerConfig,
  findSiteConfig,
  findSiteConfigs,
  findAccessToken,
  findAccessTokens,
  loadConfig,
  loadServerConfig,
  loadSiteConfig,
  loadSiteConfigs,
  loadAccessTokens,
  processServerConfig,
  processSiteConfig,
  processTokenConfig,
  removeServerConfig,
  removeSiteConfig,
  removeAccessTokens,
  setServerConfig,
};
