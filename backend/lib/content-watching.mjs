import NodeSchedule from 'node-schedule'; const { scheduleJob, cancelJob } = NodeSchedule;
import { findSiteConfigs, findSiteConfig } from './config-loading.mjs';
import { findSiteContentMeta } from './content-loading.mjs';
import { contentEventEmitter, removeSiteContent, removeSiteContentMeta } from './content-saving.mjs';
import { getHash } from './content-naming.mjs';

async function watchContentChanges() {
  const sites = findSiteConfigs();
  for (let site of sites) {
    for (let file of files) {
      const hash = getHash(file.url || file.path);
      const meta = findSiteContentMeta(site, 'data', hash);
      if (meta && meta.etime) {
        addDataExpirationJob(site.name, hash, meta.etime);
      }
    }
  }
  contentEventEmitter.on('site-content-meta', handleSiteContentMeta);
}

async function unwatchContentChanges() {
  contentEventEmitter.off('site-content-meta', handleSiteContentMeta);
  removeDataExpirationJobs();
}

const dataExpirationWatches = [];

function addDataExpirationJob(siteName, hash, etime) {
  const job = scheduleJob(new Date(etime), async () => {
    const site = findSiteConfig(siteName);
    if (site) {
      await removeSiteContentMeta(site, 'data', hash);
      await removeSiteContent(site, 'data', hash, 'json');
    }
  });
  const watch = { siteName, hash, etime, job };
  dataExpirationWatches.push(watch);
}

function removeDataExpirationJobs() {
  for (let watch of dataExpirationWatches) {
    watch.job.cancel();
  }
  dataExpirationWatches.splice(0);
}

async function handleSiteContentMeta({ site, folder, hash, meta }) {
  if (folder === 'data') {
    const watch = dataExpirationWatches.find((w) => w.siteName === site.name && w.hash === hash);
    if (watch) {
      if (!meta || watch.etime !== meta.etime) {
        if (meta && meta.etime) {
          watch.job.reschedule(new Date(meta.etime));
        } else {
          watch.job.cancel();
          const index = dataExpirationWatches.indexOf(watch);
          dataExpirationWatches.splice(index, 1);
        }
      }
    } else {
      if(meta && meta.etime) {
        addDataExpirationJob(site.name, hash, meta.etime);
      }
    }
  }
}

export {
  watchContentChanges,
  unwatchContentChanges,
};
