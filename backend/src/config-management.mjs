import Fs from 'fs'; const { readFile, readdir } = Fs.promises;
import { join } from 'path';
import JsYaml from 'js-yaml'; const { safeLoad } = JsYaml;

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

async function getServerConfig() {
  return loadConfigFile('zielono');
}

async function findSiteConfig(name) {
  const sites = await getSiteConfigs();
  return sites.find((s) => s.name === name);
}

async function getSiteConfigs() {
  const folder = getConfigFolder();
  const sites = [];
  const items = await readdir(folder);
  items.sort();
  for (let item of items) {
    if (item.endsWith('.yaml')) {
      const name = item.substr(0, item.length - 5);
      if (name !== 'zielono' && name !== '-') {
        try {
          const path = join(folder, name);
          const config = await loadConfigFile(name);
          config.name = name;
          config.storage = { path };
          sites.push(config);
        } catch (err) {
        }
      }
    }
  }
  return sites;
}

export {
  setConfigFolder,
  getConfigFolder,
  getServerConfig,
  findSiteConfig,
  getSiteConfigs,
  loadConfigFile,
};
