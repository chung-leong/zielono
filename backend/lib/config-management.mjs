import Fs from 'fs'; const { readFile, readdir } = Fs.promises;
import { join, resolve } from 'path';
import defaults from 'lodash/defaults.js';
import sortedIndexBy from 'lodash/sortedIndexBy.js';
import JsYaml from 'js-yaml'; const { safeLoad } = JsYaml;
import { object, number, string, array, boolean, never } from 'superstruct';
import { create, coerce, define, refine, optional, assert } from 'superstruct';
import { checkTimeZone } from './time-zone-management.mjs';

// path resolve against config folder
const Path = coerce(string(), string(), (path) => resolve(getConfigFolder(), path));
// listen arguments can be number or array
const Listen = coerce(array(), number(), (port) => [ port ]);
// timezone
const TimeZone = define('Time zone', checkTimeZone);

// server config definition
const Server = object({
  listen: optional(Listen),
  nginx: optional(object({
    cache: optional(object({
      path: Path,
    }))
  }))
});

// site config definition
const Site = object({
  domains: optional(array(string())),
  files: optional(array(
    refine(object({
      name: string(),
      path: optional(Path),
      url: optional(string()),
      download: optional(boolean()),
      timeZone: optional(TimeZone),
      withNames: optional(number()),
    }), 'url-or-path', (value, struct) => {
      if ((!value.path && !value.url) || (value.path && value.url)) {
        const { branch, path } = struct;
        const type = 'url-or-path';
        const message = `Expected either url or path to be present`;
        return [ { message, value, branch, path, type } ];
      } else {
        return true;
      }
    }),
  )),
  locale: optional(string()),
  storage: optional(object({
    path: Path
  }))
});

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

async function loadConfigFile(name) {
  const folder = getConfigFolder();
  const path = join(folder, `${name}.yaml`);
  const text = await readFile(path, 'utf8');
  const config = safeLoad(text);
  return config;
}

function processServerConfig(config) {
  const userValues = create(config, Server);
  const defaultValues = { listen: [ 80 ] };
  const server = defaults(userValues, defaultValues);
  return server;
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
  try {
    const config = await loadConfigFile('zielono');
    serverConfig = processServerConfig(config);
  } catch (err) {
    displayConfigError('zielono.yaml', err);
    throw err;
  }
}

async function findSiteConfig(name) {
  const sites = await getSiteConfigs();
  return sites.find((s) => s.name === name);
}

function processSiteConfig(name, config) {
  const userValues = create(config, Site);
  const storage = { path: join(getConfigFolder(), name) };
  const defaultValues = { name, domains: [], storage, files: [] };
  const site = defaults(userValues, defaultValues);
  return site;
}

let siteConfigs;

async function loadSiteConfig(name) {
  try {
    const config = await loadConfigFile(name);
    const site = processSiteConfig(name, config);
    const index = sortedIndexBy(siteConfigs, site, 'name');
    const slot = siteConfigs[index];
    if (slot && slot.name === site.name) {
      siteConfigs[index] = site;
    } else {
      siteConfigs.splice(index, 0, site);
    }
  } catch (err) {
    displayConfigError(`${name}.yaml`, err);
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
  let error;
  for (let name of names) {
    try {
      await loadSiteConfig(name);
    } catch (err) {
      // save the first one
      if (!error) {
        error = err;
      }
    }
  }
  if (error) {
    // throw the error if there aren't other sites
    if (siteConfigs.length === 0) {
      throw error;
    }
  }
  return siteConfigs;
}

function displayConfigError(filename, err) {
  console.error(`Error encountered while processing ${filename}\n${err.message}`);
}

export {
  setConfigFolder,
  getConfigFolder,
  getServerConfig,
  processServerConfig,
  findSiteConfig,
  getSiteConfigs,
  processSiteConfig,
  loadConfigFile,
};
