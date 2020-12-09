import Fs from 'fs'; const { readFile, readdir } = Fs.promises;
import { join, resolve } from 'path';
import defaultsDeep from 'lodash/defaultsDeep.js';
import sortedIndexBy from 'lodash/sortedIndexBy.js';
import get from 'lodash/get.js';
import JsYaml from 'js-yaml'; const { safeLoad } = JsYaml;
import { object, number, string, array, boolean, create, coerce, define } from 'superstruct';
import 'superstruct-chain';
import { checkTimeZone } from './time-zone-management.mjs';
import { ErrorCollection } from './error-handling.mjs';

// path resolve against config folder
const Path = coerce(string(), string(), (path) => resolve(configFolder, path));
// listen arguments can be number or array
const Listen = coerce(array(), number(), (port) => [ port ]);
// timezone
const TimeZone = define('valid time zone', checkTimeZone);

function enforceUrlOrPath(value, ctx) {
  if ((!value.path && !value.url) || (value.path && value.url)) {
    const { branch, path } = ctx;
    const { type } = ctx.struct;
    const message = `Expected either url or path to be present`;
    return [ { message, value, branch, path, type } ];
  } else {
    return true;
  }
}

// server config definition
const Server = object({
  listen: Listen.defaulted([ 8080 ]),
  nginx: object({
    port: number().defaulted(80),
    cache: object({
      path: Path,
    }).optional(),
  }).optional(),
});

// site config definition
const Site = object({
  name: string().optional(),
  domains: array(string()).defaulted([]),
  files: array(
    object({
      name: string(),
      path: Path.optional(),
      url: string().optional(),
      timeZone: TimeZone.optional(),
      headers: boolean().optional(),
    }).coerce(object(), (object) => {
      return defaultsDeep(object, {
        headers: true,
      });
    }).refine('url-or-path', enforceUrlOrPath),
  ).defaulted([]),
  locale: string().optional(),
  storage: object({
    path: Path
  }).optional(),
  code: object({
    path: Path.optional(),
    url: string().optional(),
  }).refine('url-or-path', enforceUrlOrPath).optional()
});
// these default settings depends on the name
Site.with = function(name) {
  return this.coerce(object(), (site) => {
    return defaultsDeep(site, {
      name,
      storage: {
        path: resolve(getConfigFolder(), name)
      }
    });
  });
}

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
  return create(config, Server);
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
  return create(config, Site.with(name));
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
