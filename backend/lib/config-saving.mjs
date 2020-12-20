import Fs from 'fs'; const { writeFile, unlink } = Fs.promises;
import { join } from 'path';
import JsYAML from 'js-yaml'; const { safeDump } = JsYAML;
import { processServerConfig, processSiteConfig, processTokenConfig, getConfigFolder } from './config-loading.mjs' ;

async function saveServerConfig(config) {
  processServerConfig(config);
  await saveConfig('zielono', config);
}

async function saveSiteConfig(name, config) {
  processSiteConfig(name, config);
  await saveConfig(name, config);
}

async function saveAccessTokens(entries) {
  processTokenConfig(entries);
  await saveConfig('.tokens', entries, 0o0660);
}

async function removeSiteConfig(name) {
  await removeConfig(name);
}

async function saveConfig(name, config, mode) {
  const folder = getConfigFolder();
  const path = join(folder, name + '.yaml');
  const text = safeDump(config, { skipInvalid: true });
  await writeFile(path, text, { mode });
}

async function removeConfig(name) {
  const folder = getConfigFolder();
  const path = join(folder, name + '.yaml');
  await unlink(path);
}

export {
  saveServerConfig,
  saveSiteConfig,
  saveAccessTokens,
  removeSiteConfig,
};
