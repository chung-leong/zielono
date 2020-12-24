import Chai from 'chai'; const { expect, AssertionError } = Chai;
import delay from 'delay';
import { createTempConfig } from './helpers/config-creation.mjs';
import { loadConfig, findSiteConfig } from '../lib/config-loading.mjs';
import { saveSiteContent, saveSiteContentMeta } from '../lib/content-saving.mjs';
import { loadSiteContent, loadSiteContentMeta } from '../lib/content-loading.mjs';
import { getHash } from '../lib/content-naming.mjs';

import {
  watchContentChanges,
  unwatchContentChanges,
  findExpirationJob,
} from '../lib/content-watching.mjs';

describe('Content watching', function() {
  let tmpFolder;
  before(async function() {
    tmpFolder = await createTempConfig(false);
    await loadConfig(tmpFolder.path);
  })
  describe('watchContentChanges()', function() {
    it('should create jobs for existing files', async function() {
      const site = findSiteConfig('site1');
      const save = async (file, meta) => {
        const hash = getHash(file.url || file.path);
        await saveSiteContent(site, 'data', hash, 'json', '{}');
        await saveSiteContentMeta(site, 'data', hash, meta);
        return hash;
      };
      const later = (msec) => {
        const now = new Date;
        const then = new Date(now.getTime() + msec);
        return then.toISOString();
      };
      const [ file1, file2, file3 ] = site.files;
      const hash1 = await save(file1, { etime: later(200) });
      const hash2 = await save(file2, {});
      const hash3 = await save(file3, { etime: later(-5000) });
      await watchContentChanges();
      try {
        const watch1 = findExpirationJob(site.name, hash1);
        const watch2 = findExpirationJob(site.name, hash2);
        const watch3 = findExpirationJob(site.name, hash3);
        expect(watch1).to.be.an('object').with.property('job');
        expect(watch2).to.be.undefined;
        expect(watch3).to.be.undefined;
        // should succeed
        await loadSiteContentMeta(site, 'data', hash1);
        await loadSiteContent(site, 'data', hash1, 'json');
        await delay(250);
        try {
          // should fail at this point
          await loadSiteContentMeta(site, 'data', hash1);
          expect.fail();
        } catch (err) {
          expect(err).to.not.be.instanceOf(AssertionError);
        }
        try {
          await loadSiteContent(site, 'data', hash1, 'json');
          expect.fail();
        } catch (err) {
          expect(err).to.not.be.instanceOf(AssertionError);
        }
      } finally {
        await unwatchContentChanges();
      }
    })
    it('should create job for newly saved file', async function() {
      const site = findSiteConfig('site2');
      const save = async (file, meta) => {
        const hash = getHash(file.url || file.path);
        await saveSiteContent(site, 'data', hash, 'json', '{}');
        await saveSiteContentMeta(site, 'data', hash, meta);
        return hash;
      };
      const later = (msec) => {
        const now = new Date;
        const then = new Date(now.getTime() + msec);
        return then.toISOString();
      };
      const [ file ] = site.files;
      await watchContentChanges();
      const hash = await save(file, { etime: later(200) });
      try {
        const watch = findExpirationJob(site.name, hash);
        expect(watch).to.be.an('object').with.property('job');
        // should succeed
        await loadSiteContentMeta(site, 'data', hash);
        await delay(250);
        try {
          // should fail at this point
          await loadSiteContentMeta(site, 'data', hash);
          expect.fail();
        } catch (err) {
          expect(err).to.not.be.instanceOf(AssertionError);
        }
        const watchAfter = findExpirationJob(site.name, hash);
        expect(watchAfter).to.be.undefined;
      } finally {
        await unwatchContentChanges();
      }
    })
    it('should reschedule job when metadata is modified', async function() {
      const site = findSiteConfig('site3');
      const save = async (file, meta) => {
        const hash = getHash(file.url || file.path);
        await saveSiteContent(site, 'data', hash, 'json', '{}');
        await saveSiteContentMeta(site, 'data', hash, meta);
        return hash;
      };
      const later = (msec) => {
        const now = new Date;
        const then = new Date(now.getTime() + msec);
        return then.toISOString();
      };
      const [ file ] = site.files;
      const etime1 = later(200), etime2 = later(5000);
      await watchContentChanges();
      const hash = await save(file, { etime: etime1 });
      try {
        const watch = findExpirationJob(site.name, hash);
        expect(watch).to.be.an('object').with.property('job');
        await loadSiteContentMeta(site, 'data', hash);
        await save(file, { etime: etime2 });
        await delay(250);
        expect(watch).to.have.property('etime', etime2);
        await loadSiteContentMeta(site, 'data', hash);
      } finally {
        await unwatchContentChanges();
      }
    })
  })
})
