import Chai from 'chai'; const { expect } = Chai;
import Fs from 'fs'; const { lstat } = Fs.promises;
import { createRequire } from 'module';
import { getAssetPath } from './helpers/file-loading.mjs';
import { skip, getAccessToken } from './helpers/conditional-testing.mjs';

import {
  overrideRequire,
  restoreRequire,
  requireGit,
  retrieveFromGit,
  retrieveFromGitSync,
  retrieveFromCloud,
  retrieveFromDisk,
  getDownloadURL,
} from '../src/file-retrieval.mjs';

describe('File retrieval', function() {
  this.timeout(5000);
  describe('#retrieveFromDisk()', function() {
    it('should load a file', async function() {
      const path = getAssetPath('krakow.jpg');
      const buffer = await retrieveFromDisk(path, {});
      expect(buffer).to.be.instanceOf(Buffer);
      expect(buffer).to.have.property('filename', 'krakow.jpg');
      expect(buffer).to.have.property('mtime').that.is.instanceOf(Date);
      expect(buffer).to.have.property('etag', '048a618a55b5437ecef363cfe83ef201997ad363');
    })
    it('should return null when last modified date matches', async function() {
      const path = getAssetPath('krakow.jpg');
      const { mtime } = await lstat(path);
      const options = {
        mtime: mtime.toISOString(),
      };
      const buffer = await retrieveFromDisk(path, options);
      expect(buffer).to.be.null;
    })
    it('should load file when last modified date does not match', async function() {
      const path = getAssetPath('krakow.jpg');
      const { mtime } = await lstat(path);
      const options = {
        mtime: new Date(0),
      };
      const buffer = await retrieveFromDisk(path, options);
      expect(buffer).to.be.instanceOf(Buffer);
    })
  })
  skip.if.no.github.
  describe('#retrieveFromGitSync', function() {
    const accessToken = getAccessToken('github');
    it('should retrieve file from a git repo synchronously', async function() {
      const options = {
        url: 'https://github.com/chung-leong/test',
        accessToken,
      };
      const buffer = retrieveFromGitSync('hello.js', options);
      expect(buffer).to.be.instanceOf(Buffer);
    })
  })
  skip.if.no.github.
  describe('#overrideRequire()', function() {
    const accessToken = getAccessToken('github');
    const require = createRequire(import.meta.url);
    before(function() {
      const options = {
        url: 'https://github.com/chung-leong/test',
        accessToken,
      };
      overrideRequire(options);
    })
    it('should not permit the loading of module anymore', function() {
      expect(() => require('fs')).to.throw;
    })
    it('should allow the loading of modules on whitelist', function() {
      expect(() => require('stream')).to.not.throw;
    })
    skip.if.no.github.
    it('should pull code from a private repo on GitHub', function() {
      const { hello } = requireGit('./hello.js');
      const result = hello('Sam');
      expect(result).to.eql('Hello, Sam!');
    })
    after(function() {
      restoreRequire();
    })
  })
  describe('#getDownloadURL()', function() {
    it('should return download URL for file on Dropbox', function() {
      const url = 'https://www.dropbox.com/s/4krscr943y90gd8/hello.json?dl=0';
      const result = getDownloadURL(url);
      expect(result).to.eql('https://www.dropbox.com/s/4krscr943y90gd8/hello.json?dl=1');
    })
    it ('should return download URL for file on OneDrive', function() {
      const url = 'https://1drv.ms/u/s!AvWf91TkbQTjhNZNVr8WG9PL-gdaYQ?e=pLFRfZ';
      const result = getDownloadURL(url);
      expect(result).to.eql('https://api.onedrive.com/v1.0/shares/u!aHR0cHM6Ly8xZHJ2Lm1zL3UvcyFBdldmOTFUa2JRVGpoTlpOVnI4V0c5UEwtZ2RhWVE_ZT1wTEZSZlo/root/content');
    })
    it ('should return unrecognized URL as is', function() {
      const url = 'https://somewhere.com';
      const result = getDownloadURL(url);
      expect(result).to.eql('https://somewhere.com');
    })
  })
  skip.if.watching.
  describe('#retrieveFromCloud()', function() {
    it('should retrieve file from Dropbox', async function() {
      const url = 'https://www.dropbox.com/s/4krscr943y90gd8/hello.json?dl=0';
      const result = await retrieveFromCloud(url, {});
      expect(result).to.be.instanceOf(Buffer);
      expect(result).to.have.property('etag').that.is.a('string');
      expect(result).to.have.property('filename', 'hello.json');
      expect(JSON.parse(result)).to.eql({ message: 'hello world' });
    })
    it('should retrieve file from OneDrive', async function() {
      const url = 'https://1drv.ms/u/s!AvWf91TkbQTjhNZNVr8WG9PL-gdaYQ?e=pLFRfZ';
      const result = await retrieveFromCloud(url, {});
      expect(result).to.be.instanceOf(Buffer);
      expect(result).to.have.property('etag').that.is.a('string');
      expect(result).to.have.property('mtime').that.is.instanceOf(Date);
      expect(result).to.have.property('filename', 'hello.json');
      expect(JSON.parse(result)).to.eql({ message: 'hello world' });
    })
    it('should not retrieve file from Dropbox if it has not been changed', async function() {
      const url = 'https://www.dropbox.com/s/4krscr943y90gd8/hello.json?dl=0';
      const { etag, mtime } = await retrieveFromCloud(url, {});
      const result = await retrieveFromCloud(url, { etag });
      expect(result).to.be.null;
    })
    it('should not retrieve file from OneDrive if it has not been changed', async function() {
      const url = 'https://1drv.ms/u/s!AvWf91TkbQTjhNZNVr8WG9PL-gdaYQ?e=pLFRfZ';
      const { etag, mtime } = await retrieveFromCloud(url, {});
      const result = await retrieveFromCloud(url, { etag });
      expect(result).to.be.null;
    })
  })
})
