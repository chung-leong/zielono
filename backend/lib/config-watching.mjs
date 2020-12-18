import { EventEmitter } from 'events';
import { basename } from 'path';
import isEqual from 'lodash/isEqual.js';
import JsYAML from 'js-yaml'; const { safeDump } = JsYAML;
import Chokidar from 'chokidar';
import { diffLines } from 'diff';
import Colors from 'colors/safe.js'; const { red, green, gray, strikethrough } = Colors;
import { displayError } from './error-handling.mjs';
import {
  getConfigFolder, findSiteConfig, findServerConfig, findAccessTokens,
  loadSiteConfig, loadServerConfig, loadAccessTokens, removeServerConfig, removeSiteConfig, removeAccessTokens, 
} from './config-loading.mjs';

let watcher;

const configEventEmitter = new EventEmitter;

async function watchConfigFolder() {
  const folder = getConfigFolder();
  const options = {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 },
    depth: 0,
  };
  watcher = Chokidar.watch(`${folder}/*.yaml`, options);
  watcher.on('add', (path) => handleConfigChange('add', path));
  watcher.on('unlink', (path) => handleConfigChange('unlink', path));
  watcher.on('change', (path) => handleConfigChange('change', path));
  await new Promise((resolve, reject) => {
    watcher.once('ready', resolve);
    watcher.once('error', (msg) => reject(new Error(msg)));
  });
}

async function unwatchConfigFolder() {
  if (watcher) {
    await watcher.close();
    watcher = undefined;
  }
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
      let before = findServerConfig();
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
      let before = findAccessTokens();
      let after = (present) ? await loadAccessTokens() : removeAccessTokens();
      if (!isEqual(before, after)) {
        const mask = ({ url, token }) => {
          token = token.replace(/(.{3})(.*)(.{3})/, (m0, m1, m2, m3) => {
            return m1 + m2.replace(/./g, '.') + m3;
          });
          return { url, token };
        };
        before = before.map(mask);
        after = before.map(mask);
        configEventEmitter.emit('token-change', before, after);
        displayConfigChanges(before, after, description);
      }
    } else {
      const before = findSiteConfig(name);
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
  watchConfigFolder,
  unwatchConfigFolder,
  configEventEmitter,
};
