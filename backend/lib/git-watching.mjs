import { EventEmitter } from 'events';
import isEqual from 'lodash/isEqual.js';
import { getSiteConfigs, configEventEmitter } from './config-management.mjs';
import { ErrorCollection, displayError } from './error-handling.mjs';
import { findGitAdapter } from './git-adapters.mjs';

const gitWatches = [];
const gitEventEmitter = new EventEmitter;

async function watchGitRepos() {
  try {
    await adjustGitWatches();
  } catch (err) {
    displayError(err, 'startup');
  }
  configEventEmitter.on('site-change', handleSiteChange);
  return gitWatches.length;
}

async function unwatchGitRepos() {
  configEventEmitter.off('site-change', handleSiteChange);
  try {
    await adjustGitWatches(true);
  } catch (err) {
    displayError(err, 'shutdown');
  }
  return gitWatches.length;
}

async function handleSiteChange(before, after) {
  if (!before || !after || !isEqual(before.code, after.code)) {
    try {
      await adjustGitWatches();
    } catch (err) {
      displayError(err, 'config-change');
    }
  }
}

async function adjustGitWatches(shutdown = false, attempts = 0) {
  const folder = 'www';
  // see which repos need to be monitored
  const needed = [];
  const errors = [];
  if (!shutdown) {
    const sites = await getSiteConfigs();
    for (let site of sites) {
      if (site.code) {
        const { url, path } = site.code;
        if (!needed.find((c) => c.url === url && c.path === path)) {
          needed.push({ url, path });
        }
      }
    }
  }
  // see which ones aren't needed anymore
  const unwanted = [];
  for (let repo of gitWatches) {
    if (!needed.find((r) => isEqual(r, repo))) {
      unwanted.push(repo);
    }
  }
  // take them out now to avoid reentrance issues
  for (let repo of unwanted) {
    const index = gitWatches.indexOf(repo);
    gitWatches.splice(index, 1);
  }
  //  see which ones need to be installed
  const missing = [];
  for (let repo of needed) {
    if (!gitWatches.find((r) => isEqual(r, repo))) {
      missing.push(repo);
      gitWatches.push(repo);
    }
  }
  // disable unwanted ones
  for (let repo of unwanted) {
    try {
      const { url, path } = repo;
      const adapter = findGitAdapter(repo);
      const accessToken = (url) ? await findAccessToken(url) : undefined;
      const options = { url, path, accessToken };
      await adapter.unwatchFolder(folder, options);
    } catch (err) {
      // stick it back in since we've failed to remove it
      gitWatches.push(repo);
      errors.push(err);
    }
  }
  // start watching the missing ones
  for (let repo of missing) {
    try {
      const { url, path } = repo;
      const adapter = findGitAdapter(repo);
      const accessToken = (url) ? await findAccessToken(url) : undefined;
      const options = { url, path, accessToken };
      await adapter.watchFolder(folder, options, async (before, after) => {
        try {
          const sites = await getSiteConfigs();
          for (let site of sites) {
            if (site.code.url === url && site.code.path === path) {
              gitEventEmitter.emit('code-change', before, after, site);
            }
          }
        } catch (err) {
          displayError(err, 'code-change');
        }
      });
    } catch (err) {
      // take it back out since we've failed to install it
      const index = gitWatches.indexOf(repo);
      gitWatches.splice(index, 1);
      errors.push(err);
    }
  }
  if (errors.length > 0) {
    // see if we should try again
    let retry = false;
    let retryAfter = Math.pow(2, attempts) * 1000;
    for (let error of errors) {
      if (error.status !== 401 && error.status !== 403) {
        retry = true;
        if (error.status === 429) {
          // getting rate limited
          retryAfter = Math.min(5 * 60 * 1000, retryAfter);
        }
      }
    }
    if (retry && !shutdown) {
      setTimeout(async () => {
        try {
          await adjustGitWatches(false, attempts + 1)
        } catch (err) {
          // don't show error again
        }
      }, retryAfter);
    }
    throw new ErrorCollection(errors);
  }
}

export {
  watchGitRepos,
  unwatchGitRepos,
  gitEventEmitter,
};
