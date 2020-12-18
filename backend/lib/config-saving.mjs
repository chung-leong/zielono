import Fs from 'fs'; const { writeFile } = Fs.promises;
import { join, resolve } from 'path';
import JsYAML from 'js-yaml'; const { safeDump } = JsYAML;
import { processServerConfig, processSiteConfig, processTokenConfig, getConfigFolder } from './config-loading.mjs' ;

async function saveServerConfig(config) {

}

async function saveSiteConfig(name, config) {

}

async function saveAccessTokens(tokens) {

}

export {
  saveServerConfig,
  saveSiteConfig,
  saveAccessTokens,
};
