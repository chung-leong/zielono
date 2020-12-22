import Chai from 'chai'; const { expect } = Chai;
import { join } from 'path';
import { createTempConfig } from './helpers/config-creation.mjs';
import { loadConfig, findSiteConfig } from '../lib/config-loading.mjs';

import {
  getHash,
  getServerContentPath,
  getSiteContentPath,
} from '../lib/content-naming.mjs';

describe('Content naming', function() {
  let tmpFolder;
  before(async function() {
    tmpFolder = await createTempConfig(false);
    await loadConfig(tmpFolder.path);
  })
  describe('getHash()', function() {
    it('should return sha1 hash of given data', function() {
      const result = getHash('The quick brown fox jumps over the lazy dog');
      expect(result).to.equal('2fd4e1c67a2d28fced849ee1bb76e7391b93eb12');
    })
    it('should accept multiple arguments', function() {
      const result = getHash('The quick brown fox', ' ', 'jumps over the lazy dog');
      expect(result).to.equal('2fd4e1c67a2d28fced849ee1bb76e7391b93eb12');
    })
  })
  describe('getServerContentPath()', function() {
    it('should return path for server content', function() {
      const hash = '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12';
      const result = getServerContentPath('git', hash, 'json');
      expect(result).to.equal(join(tmpFolder.path, 'zielono', 'git', `${hash}.json`));
    })
  })
  describe('getSiteContentPath()', function() {
    it('should return path for site content', function() {
      const site = findSiteConfig('site1');
      const hash = '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12';
      const result = getSiteContentPath(site, 'images', hash, 'jpeg');
      expect(result).to.equal(join(tmpFolder.path, 'site1', 'images', `${hash}.jpeg`));
    })
  })
})
