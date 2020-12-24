import NodeSchedule from 'node-schedule'; const { scheduleJob, cancelJob } = NodeSchedule;
import { findSiteConfigs, findSiteConfig } from './config-loading.mjs';
import { findSiteContentMeta } from './content-loading.mjs';
import { contentEventEmitter, removeSiteContent, removeSiteContentMeta } from './content-saving.mjs';
import { getHash } from './content-naming.mjs';

async function watchContentChanges() {
  const sites = findSiteConfigs();
  for (let site of sites) {
    for (let file of site.files) {
      const hash = getHash(file.url || file.path);
      const meta = await findSiteContentMeta(site, 'data', hash);
      if (meta && meta.etime) {
        addExpirationJob(site.name, hash, meta.etime);
      }
    }
  }
  contentEventEmitter.on('site-content-meta', handleSiteContentMeta);
}

async function unwatchContentChanges() {
  contentEventEmitter.off('site-content-meta', handleSiteContentMeta);
  removeExpirationJobs();
}

const expirationWatches = [];

function addExpirationJob(siteName, hash, etime) {
  const now = new Date;
  const then = new Date(etime);
  if (then > now) {
    const job = scheduleJob(then, async () => {
      const index = expirationWatches.indexOf(watch);
      expirationWatches.splice(index, 1);
      const site = findSiteConfig(siteName);
      if (site) {
        await removeSiteContentMeta(site, 'data', hash);
        await removeSiteContent(site, 'data', hash, 'json');
      }
    });
    const watch = { siteName, hash, etime, job };
    expirationWatches.push(watch);
  }
}

function findExpirationJob(siteName, hash) {
  return expirationWatches.find((w) => w.siteName === siteName && w.hash === hash);
}

function removeExpirationJobs() {
  for (let watch of expirationWatches) {
    watch.job.cancel();
  }
  expirationWatches.splice(0);
}

async function handleSiteContentMeta({ site, folder, hash, meta }) {
  if (folder === 'data') {
    const watch = findExpirationJob(site.name, hash);
    if (watch) {
      if (!meta || watch.etime !== meta.etime) {
        if (meta && meta.etime) {
          watch.job.reschedule(new Date(meta.etime));
          watch.etime = meta.etime;
        } else {
          const index = expirationWatches.indexOf(watch);
          expirationWatches.splice(index, 1);
          watch.job.cancel();
        }
      }
    } else {
      if(meta && meta.etime) {
        addExpirationJob(site.name, hash, meta.etime);
      }
    }
  }
}

export {
  watchContentChanges,
  unwatchContentChanges,
  findExpirationJob,
};
