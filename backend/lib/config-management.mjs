import Fs from 'fs'; const { readFile, readdir } = Fs.promises;
import { join, resolve } from 'path';
import sortedIndexBy from 'lodash/sortedIndexBy.js';
import get from 'lodash/get.js';
import JsYaml from 'js-yaml'; const { safeLoad } = JsYaml;
import { object, number, string, array, boolean, create, coerce, define } from 'superstruct';
import 'superstruct-chain';
import { checkTimeZone } from './time-zone-management.mjs';
import { ErrorCollection } from './error-handling.mjs';

let configFolder;

function setConfigFolder(path) {
  configFolder = path;
}

function getConfigFolder() {
  if (!configFolder) {
    throw new Error('Configuration folder is undefined');
  }
  return configFolder;
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

let serverConfig;

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
  } catch (err) {
    err.filename = filename;
    err.lineno = findLineNumber(text, err.path);
    throw err;
  }
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
        path: string().coerce(string(), (path) => resolve(folder, path)),
        url: string().optional(),
        timeZone: define('time zone', checkTimeZone).optional(),
        headers: boolean().defaulted(true),
      }).refine('url-or-path', urlOrPath),
    ).defaulted([]),
    locale: string().optional(),
    storage: object({
      path: string().coerce(string(), (path) => resolve(folder, path)),
    }).defaulted({
      path: resolve(folder, name)
    }),
    code: object({
      path: string().coerce(string(), (path) => resolve(folder, path)),
      url: string().optional(),
    }).refine('url-or-path', urlOrPath).optional()
  });
  return create({ name, ...config }, siteDef);
}

let siteConfigs;

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
  } catch (err) {
    err.filename = filename;
    err.lineno = findLineNumber(text, err.path);
    throw err;
  }
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

function findLineNumber(text, path) {
  if (!(path instanceof Array)) {
    return;
  }
  const lines = text.split(/\r?\n/);
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
  if (errors.length > 0) {
    throw new ErrorCollection(errors);
  }
  return { server, sites };
}

export {
  setConfigFolder,
  getConfigFolder,
  preloadConfig,
  getServerConfig,
  processServerConfig,
  findSiteConfig,
  getSiteConfigs,
  processSiteConfig,
};
