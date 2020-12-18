import Chai from 'chai'; const { expect } = Chai;
import { createTempFolder, saveCacheFile, saveYAML } from './helpers/file-saving.mjs';
import { loadConfig } from '../lib/config-loading.mjs';

import {
  NginxCacheScanner,
  NginxCacheSweeper,
  purgeCache
} from '../lib/cache-purging.mjs';

describe('Cache purging', function() {
  describe('NginxCacheScanner', function() {
    describe('scan()', function() {
      it('should find cache entries', async function() {
        const tmpFolder = await createTempFolder();
        await saveCacheFile(tmpFolder, 'duck.test', '/');
        await saveCacheFile(tmpFolder, 'chicken.test', '/somewhere/');
        const scanner = new NginxCacheScanner;
        const entries = await scanner.scan(tmpFolder.path);
        expect(entries).to.be.an('array').with.lengthOf(2);
        expect(entries[0]).to.have.property('url').with.keys([ 'hostname', 'path' ]);
        expect(entries[0]).to.have.property('status').that.is.a('number');
        expect(entries[0]).to.have.property('size').that.is.a('number');
        expect(entries[0]).to.have.property('path').that.is.a('string');
        expect(entries[0]).to.have.property('mtime').that.is.a('date');
      })
    })
  })
  describe('NginxCacheSweeper', function() {
    describe('meetCriterion()', function() {
      it('should accept different types of predicates', function() {
        const sweeper = new NginxCacheSweeper;
        const entry = {
          url: {
            hostname: 'duck.test',
            path: '/page/'
          }
        };
        const f = (predicate) => {
          return sweeper.meetCriterion(entry, {
            hostname: entry.url.hostname,
            predicate
          });
        };
        expect(f(undefined)).to.be.true;
        expect(f('/page/')).to.be.true;
        expect(f(/page/)).to.be.true;
        expect(f((path) => path.startsWith('/p'))).to.be.true;
        expect(f((path) => path.startsWith('/sp'))).to.be.false;
        expect(f([ '/page', '/menu' ])).to.be.false;
        expect(f([ '/page/', '/menu/' ])).to.be.true;
      })
    })
    describe('sweep()', function() {
      it('should remove matching entries', async function() {
        const tmpFolder = await createTempFolder();
        await saveCacheFile(tmpFolder, 'duck.test', '/');
        await saveCacheFile(tmpFolder, 'chicken.test', '/somewhere/');
        const scanner1 = new NginxCacheScanner;
        const entries = await scanner1.scan(tmpFolder.path);
        expect(entries).to.be.an('array').with.lengthOf(2);
        const sweeper = new NginxCacheSweeper('duck.test');
        await sweeper.sweep(tmpFolder.path);
        const removed = sweeper.findResults('duck.test');
        expect(removed).to.be.an('array').with.lengthOf(1);
        expect(removed[0]).to.have.property('url').that.eql({
          hostname: 'duck.test',
          path: '/'
        });
        const scanner2 = new NginxCacheScanner;
        const remaining = await scanner2.scan(tmpFolder.path);
        expect(remaining).to.be.an('array').with.lengthOf(1);
        expect(remaining[0]).to.have.property('url').that.eql({
          hostname: 'chicken.test',
          path: '/somewhere/'
        });
      })
    })
    describe('addCriterion()', function() {
      it('should permit addition of criteron mid-sweep', async function() {
        const tmpFolder = await createTempFolder();
        for (let i = 0; i < 100; i++) {
          await saveCacheFile(tmpFolder, 'duck.test', `/${i}/`);
        }
        for (let i = 0; i < 50; i++) {
          await saveCacheFile(tmpFolder, 'chicken.test', `/${i}/`);
        }
        const scanner1 = new NginxCacheScanner;
        const entries = await scanner1.scan(tmpFolder.path);
        expect(entries).to.be.an('array').with.lengthOf(150);
        const sweeper = new NginxCacheSweeper('duck.test');
        setTimeout(() => sweeper.addCriterion('chicken.test'), 25);
        await sweeper.sweep(tmpFolder.path);
        const removed1 = sweeper.findResults('duck.test');
        expect(removed1).to.be.an('array').with.lengthOf(100);
        const removed2 = sweeper.findResults('chicken.test');
        expect(removed2).to.be.an('array').with.lengthOf(50);
        const scanner2 = new NginxCacheScanner;
        const remaining = await scanner2.scan(tmpFolder.path);
        expect(remaining).to.be.an('array').with.lengthOf(0);
      })
    })
  })
  describe('purgeCache()', function() {
    it('should permit addition of criteron mid-sweep', async function() {
      const tmpCacheFolder = await createTempFolder();
      for (let i = 0; i < 100; i++) {
        await saveCacheFile(tmpCacheFolder, 'duck.test', `/${i}/`);
      }
      for (let i = 0; i < 50; i++) {
        await saveCacheFile(tmpCacheFolder, 'chicken.test', `/${i}/`);
      }
      const tmpConfigFolder = await createTempFolder();
      await saveYAML(tmpConfigFolder, 'zielono', {
        nginx: {
          cache: tmpCacheFolder
        }
      });
      await loadConfig(tmpConfigFolder.path);
      let removed1, removed2;
      const finish = purgeCache('duck.test').then((results) => removed1 = results);
      setTimeout(() => {
        purgeCache('chicken.test').then((results) => removed2 = results);
      }, 25);
      await finish;
      expect(removed1).to.be.an('array').with.lengthOf(100);
      expect(removed2).to.be.an('array').with.lengthOf(50);
    })
  })
})
