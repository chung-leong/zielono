import FS from 'fs'; const { readFile, readdir } = FS.promises;
import { join } from 'path';
import JSYaml from 'js-yaml'; const { safeLoad } = JSYaml;

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
  try {
    return loadConfigFile(name);
  } catch (err) {
  }
}

async function getSiteConfigs(name) {
  const folder = getConfigFolder();
  const sites = {};
  const items = await readdir(folder);
  items.sort();
  for (let item of items) {
    if (item.endsWith('.yaml')) {
      const name = item.substr(0, item.length - 5);
      if (name !== 'zielono') {
        try {
          const config = await loadConfigFile(name);
          config.name = name;
          sites[name] = config;
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
