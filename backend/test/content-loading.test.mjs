import Chai from 'chai'; const { expect } = Chai;
import { createTempConfig } from './helpers/config-creation.mjs';
import { loadAsset } from './helpers/file-loading.mjs';
import { loadConfig, findSiteConfig } from '../lib/config-loading.mjs';
import { getHash, getServerContentPath } from '../lib/content-naming.mjs';
import { saveServerContent, saveServerContentMeta, saveSiteContent, saveSiteContentMeta } from '../lib/content-saving.mjs';

import {
  loadServerContent,
  loadServerContentMeta,
  findServerContentMeta,
  loadSiteContent,
  loadSiteContentMeta,
  findSiteContentMeta,
} from '../lib/content-loading.mjs';

describe('Content loading', function() {
  let tmpFolder;
  before(async function() {
    tmpFolder = await createTempConfig(false);
    await loadConfig(tmpFolder.path);
  })
  describe('loadServerContent()', function() {
    it('should load server content', async function() {
      const hash = '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12';
      const text = 'The quick brown fox jumps over the lazy dog';
      await saveServerContent('text', hash, 'txt', Buffer.from(text));
      const buffer = await loadServerContent('text', hash, 'txt');
      expect(buffer.toString()).to.equal(text);
    })
  })
  describe('loadServerContentMeta()', function() {
    it('should load server content metadata', async function() {
      const hash = '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12';
      const meta = { lang: 'en', etag: hash };
      await saveServerContentMeta('text', hash, meta);
      const result = await loadServerContentMeta('text', hash);
      expect(result).to.eql(meta);
    })
  })
  describe('findServerContentMeta()', function() {
    it('should return undefined when no metadata is found', async function() {
      const hash = 'random';
      const meta = await findServerContentMeta('text', hash);
      expect(meta).to.be.undefined;
    })
  })
  describe('loadSiteContent()', function() {
    it('should load site content', async function() {
      const site = findSiteConfig('site1');
      const image = await loadAsset('krakow.jpg');
      const hash = getHash(image);
      await saveSiteContent(site, 'images', hash, 'jpeg', image);
      const buffer = await loadSiteContent(site, 'images', hash, 'jpeg');
      expect(buffer.compare(image)).to.equal(0);
    })
    it('should find content in the process of being saved', async function() {
      const site = findSiteConfig('site1');
      const image = await loadAsset('krakow.jpg');
      const hash = getHash(image);
      saveSiteContent(site, 'images', hash, 'jpeg', image);
      const buffer = await loadSiteContent(site, 'images', hash, 'jpeg');
      expect(buffer.compare(image)).to.equal(0);
    })
  })
  describe('loadSiteContentMeta()', function() {
    it('should load server content metadata', async function() {
      const site = findSiteConfig('site1');
      const image = await loadAsset('krakow.jpg');
      const hash = getHash(image);
      const meta = { width: 220, height: 146 };
      await saveSiteContentMeta(site, 'text', hash, meta);
      const result = await loadSiteContentMeta(site, 'text', hash);
      expect(result).to.eql(meta);
    })
  })
  describe('findSiteContentMeta()', function() {
    it('should return undefined when no metadata is found', async function() {
      const site = findSiteConfig('site1');
      const hash = 'random';
      const meta = await findSiteContentMeta(site, 'text', hash);
      expect(meta).to.be.undefined;
    })
  })
})
