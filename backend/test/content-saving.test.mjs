import Chai from 'chai'; const { expect } = Chai;
import { createTempConfig } from './helpers/config-creation.mjs';
import { loadAsset } from './helpers/file-loading.mjs';
import { loadConfig, findSiteConfig } from '../lib/config-loading.mjs';
import { getHash, getServerContentPath } from '../lib/content-naming.mjs';
import { loadServerContent, loadServerContentMeta, loadSiteContent, loadSiteContentMeta } from '../lib/content-loading.mjs';

import {
  saveServerContent,
  saveServerContentMeta,
  saveSiteContent,
  saveSiteContentMeta,
  removeServerContent,
  removeServerContentMeta,
  removeSiteContent,
  removeSiteContentMeta,
  findInflightData,
  contentEventEmitter,
} from '../lib/content-saving.mjs';

describe('Content saving', function() {
  let tmpFolder;
  before(async function() {
    tmpFolder = await createTempConfig(false);
    await loadConfig(tmpFolder.path);
  })
  describe('saveServerContent()', function() {
    it('should save server content', async function() {
      const hash = '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12';
      const text = 'The quick brown fox jumps over the lazy dog';
      await saveServerContent('text', hash, 'txt', Buffer.from(text));
      const buffer = await loadServerContent('text', hash, 'txt');
      expect(buffer.toString()).to.equal(text);
    })
  })
  describe('saveServerContentMeta()', function() {
    it('should save server content metadata', async function() {
      const hash = '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12';
      const meta = { lang: 'en', etag: hash };
      await saveServerContentMeta('text', hash, meta);
      const result = await loadServerContentMeta('text', hash);
      expect(result).to.eql(meta);
    })
  })
  describe('saveSiteContent()', function() {
    it('should save site content', async function() {
      const site = findSiteConfig('site1');
      const image = await loadAsset('krakow.jpg');
      const hash = getHash(image);
      await saveSiteContent(site, 'images', hash, 'jpeg', image);
      const buffer = await loadSiteContent(site, 'images', hash, 'jpeg');
      expect(buffer.compare(image)).to.equal(0);
    })
    it('should not overwrite existing file when hash is derived from file content', async function() {
      const site = findSiteConfig('site1');
      const image = await loadAsset('krakow.png');
      const empty = Buffer.alloc(image.length);
      const hash = getHash(image);
      const options = { hashed: 'content' };
      await saveSiteContent(site, 'images', hash, 'png', empty);
      await saveSiteContent(site, 'images', hash, 'png', image, options);
      const buffer = await loadSiteContent(site, 'images', hash, 'png');
      expect(buffer.compare(empty)).to.equal(0);
      expect(buffer.compare(image)).to.not.equal(0);
    })
    it('should not overwrite in-flight data file when hash is derived from file content', async function() {
      const site = findSiteConfig('site2');
      const image = await loadAsset('krakow.png');
      const empty = Buffer.alloc(image.length);
      const hash = getHash(image);
      const options = { hashed: 'content' };
      // not waiting for operation to complete
      saveSiteContent(site, 'images', hash, 'png', empty);
      saveSiteContent(site, 'images', hash, 'png', image, options);
      const buffer = await loadSiteContent(site, 'images', hash, 'png');
      expect(buffer.compare(empty)).to.equal(0);
      expect(buffer.compare(image)).to.not.equal(0);
    })
    it('should overwrite existing file if file size is off', async function() {
      const site = findSiteConfig('site1');
      const image = await loadAsset('krakow.gif');
      const empty = Buffer.alloc(image.length / 2);
      const hash = getHash(image);
      const options = { hashed: 'content' };
      await saveSiteContent(site, 'images', hash, 'gif', empty);
      await saveSiteContent(site, 'images', hash, 'gif', image, options);
      const buffer = await loadSiteContent(site, 'images', hash, 'gif');
      expect(buffer.compare(image)).to.equal(0);
    })
    it('should overwrite in-flight data if size is off', async function() {
      const site = findSiteConfig('site2');
      const image = await loadAsset('krakow.gif');
      const empty = Buffer.alloc(image.length / 2);
      const hash = getHash(image);
      const options = { hashed: 'content' };
      // not waiting for operation to complete
      saveSiteContent(site, 'images', hash, 'gif', empty);
      saveSiteContent(site, 'images', hash, 'gif', image, options);
      const buffer = await loadSiteContent(site, 'images', hash, 'gif');
      expect(buffer.compare(image)).to.equal(0);
    })
  })
  describe('saveServerContentMeta()', function() {
    it('should save server content metadata', async function() {
      const site = findSiteConfig('site1');
      const image = await loadAsset('krakow.jpg');
      const hash = getHash(image);
      const meta = { width: 220, height: 146 };
      await saveSiteContentMeta(site, 'text', hash, meta);
      const result = await loadSiteContentMeta(site, 'text', hash);
      expect(result).to.eql(meta);
    })
  })
  describe('removeServerContent()', function() {
    it('should remove server content', async function() {
      const text = 'Hello';
      const hash = getHash(text);
      await saveServerContent('text', hash, 'txt', Buffer.from(text));
      const buffer = await loadServerContent('text', hash, 'txt');
      expect(buffer.toString()).to.equal(text);
      await removeServerContent('text', hash, 'txt');
      try {
        await loadServerContent('text', hash, 'txt');
        this.fail();
      } catch (err) {
        expect(err).to.be.an('error');
      }
    })
    it('should not throw by default', async function() {
      const hash = 'random';
      await removeServerContent('text', hash, 'txt');
      try {
        await loadServerContent('text', hash, 'txt', { ignoreError: false });
        this.fail();
      } catch (err) {
        expect(err).to.be.an('error');
      }
    })
  })
  describe('removeServerContentMeta()', function() {
    it('should remove server content metadata', async function() {
      const text = 'Hello';
      const hash = getHash(text);
      const meta = { lang: 'en', etag: hash };
      await saveServerContentMeta('text', hash, meta);
      const result = await loadServerContentMeta('text', hash);
      expect(result).to.eql(meta);
      await removeServerContentMeta('text', hash);
      try {
        await loadServerContentMeta('text', hash);
        this.fail();
      } catch (err) {
        expect(err).to.be.an('error');
      }
    })
  })
  describe('removeSiteContent()', function() {
    it('should remove site content', async function() {
      const site = findSiteConfig('site1');
      const text = 'Hello';
      const hash = getHash(text);
      await saveSiteContent(site, 'text', hash, 'txt', Buffer.from(text));
      const buffer = await loadSiteContent(site, 'text', hash, 'txt');
      expect(buffer.toString()).to.equal(text);
      await removeSiteContent(site, 'text', hash, 'txt');
      try {
        await loadSiteContent(site, 'text', hash, 'txt');
        this.fail();
      } catch (err) {
        expect(err).to.be.an('error');
      }
    })
  })
  describe('removeSiteContentMeta()', function() {
    it('should remove site content metadata', async function() {
      const site = findSiteConfig('site1');
      const text = 'Hello';
      const hash = getHash(text);
      const meta = { lang: 'en', etag: hash };
      await saveSiteContentMeta(site, 'text', hash, meta);
      const result = await loadSiteContentMeta(site, 'text', hash);
      expect(result).to.eql(meta);
      await removeSiteContentMeta(site, 'text', hash);
      try {
        await loadSiteContentMeta(site, 'text', hash);
        this.fail();
      } catch (err) {
        expect(err).to.be.an('error');
      }
    })
  })
  describe('findInflightData()', function() {
    it('should return data about to be saved', async function() {
      const text = 'This is a test';
      const hash = getHash(text);
      const buffer = Buffer.from(text);
      saveServerContent('text', hash, 'txt', buffer);
      const path = getServerContentPath('text', hash, 'txt');
      const result = findInflightData(path);
      expect(result).to.equal(buffer);
    })
  })
  describe('contentEventEmitter', function() {
    it('should emit an event when server content metadata is saved', async function() {
      let event;
      const listener = (evt) => {
        event = evt;
      };
      try {
        contentEventEmitter.on('server-content-meta', listener);
        const text = 'Hello?';
        const hash = getHash(text);
        const meta = { lang: 'en', etag: hash };
        await saveServerContentMeta('text', hash, meta);
        expect(event).to.be.an('object')
          .with.keys([ 'server', 'folder', 'hash', 'meta' ])
          .with.property('meta', meta);
      } finally {
        contentEventEmitter.off('server-content-meta', listener);
      }
    })
    it('should emit an event when server content metadata is removed', async function() {
      let event;
      const listener = (evt) => {
        event = evt;
      };
      try {
        contentEventEmitter.on('server-content-meta', listener);
        const text = 'Hello!';
        const hash = getHash(text);
        const meta = { lang: 'en', etag: hash };
        await saveServerContentMeta('text', hash, meta);
        await removeServerContentMeta('text', hash);
        expect(event).to.be.an('object').not.with.property('meta');
      } finally {
        contentEventEmitter.off('server-content-meta', listener);
      }
    })
    it('should emit an event when site content metadata is saved', async function() {
      let event;
      const listener = (evt) => {
        event = evt;
      };
      try {
        contentEventEmitter.on('site-content-meta', listener);
        const site = findSiteConfig('site1');
        const text = 'Hello?';
        const hash = getHash(text);
        const meta = { lang: 'en', etag: hash };
        await saveSiteContentMeta(site, 'text', hash, meta);
        expect(event).to.be.an('object')
          .with.keys([ 'site', 'folder', 'hash', 'meta' ])
          .with.property('meta', meta);
      } finally {
        contentEventEmitter.off('site-content-meta', listener);
      }
    })
    it('should emit an event when site content metadata is removed', async function() {
      let event;
      const listener = (evt) => {
        event = evt;
      };
      try {
        contentEventEmitter.on('site-content-meta', listener);
        const site = findSiteConfig('site1');
        const text = 'Hello!';
        const hash = getHash(text);
        const meta = { lang: 'en', etag: hash };
        await saveSiteContentMeta(site, 'text', hash, meta);
        await removeSiteContentMeta(site, 'text', hash);
        expect(event).to.be.an('object').not.with.property('meta');
      } finally {
        contentEventEmitter.off('site-content-meta', listener);
      }
    })
  })
})
