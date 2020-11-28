import Chai from 'chai'; const { expect } = Chai;
import FS from 'fs'; const { lstat } = FS.promises;
import tmp from 'tmp-promise';
import del from 'del';
import HttpMocks from 'node-mocks-http'; const { createRequest, createResponse } = HttpMocks;
import { skip, getAccessToken } from './helpers/conditional-testing.mjs';
import { loadExcelFile, getAssetPath } from './helpers/file-loading.mjs'
import { findSiteContentMeta, loadSiteContent, getHash } from '../src/content-storage.mjs'

import {
  handleDataRequest,
  saveEmbeddedMedia,
} from '../src/request-handling-data.mjs';

describe('Data request handling', function() {
  describe('#saveEmbeddedMedia()', function() {
    let tmpFolder;
    before(async function() {
      tmpFolder = await tmp.dir();
    })
    after(async function() {
      await del([ tmpFolder.path ], { force: true });
    })
    it('should save images to disk and add references to cells', async function() {
      const json = await loadExcelFile('sushi.xlsx');
      const site = {
        name: 'tmp',
        storage: tmpFolder
      };
      const list = await saveEmbeddedMedia(site, json);
      expect(list).to.have.lengthOf(6);
      for (let hash of list) {
        await lstat(`${tmpFolder.path}/images/${hash}.jpeg`);
      }
      const sheet = json.sheets[0];
      const cellD2 = sheet.rows[0][3];
      expect(cellD2.image).to.have.property('hash', '1a1e9e305b5a132560e861531430f9b881b35cd1');
      expect(cellD2.image).to.have.property('width', 440);
      expect(cellD2.image).to.have.property('height', 440);
    })
  })
  describe('#handleDataRequest()', function() {
    let tmpFolder, site;
    before(async function() {
      tmpFolder = await tmp.dir();
      site = {
        name: 'tmp',
        storage: tmpFolder,
        files: [
          {
            name: 'sushi',
            path: getAssetPath('sushi.xlsx')
          },
          {
            name: 'example',
            url: 'https://www.dropbox.com/s/bjjxwodb3kvf4ni/example.xlsx?dl=0'
          }
        ]
      };
    })
    after(async function() {
      await del([ tmpFolder.path ], { force: true });
    })
    const next = (err) => {
      if (err) {
        throw err;
      }
    };
    it('should return data from an Excel file on disk', async function() {
      const req = createRequest({
        params: { name: 'sushi' }
      });
      const res = createResponse();
      req.site = site;
      req.server = {};
      await handleDataRequest(req, res, next);
      const data = res._getData();
      const headers = res._getHeaders();
      expect(headers).to.have.property('etag').that.is.a('string');
      expect(headers).to.have.property('last-modified').that.is.a('string');
      const json = JSON.parse(data);
      expect(json).to.have.property('sheets').that.is.an('array');
    })
    it('should save content and meta data', async function() {
      const req = createRequest({
        params: { name: 'sushi' }
      });
      const res = createResponse();
      req.site = site;
      req.server = {};
      await handleDataRequest(req, res, next);
      const hash = getHash(site.files[0].path);
      const meta = await findSiteContentMeta(site, 'data', hash);
      expect(meta).to.be.an('object');
      expect(meta).to.have.property('etag');
      expect(meta).to.have.property('images');
      const content = await loadSiteContent(site, 'data', hash, 'json');
      expect(content).to.be.instanceOf(Buffer);
    })
    it('should respond correctly when etag is given', async function() {
      const req1 = createRequest({
        params: { name: 'sushi' }
      });
      const res1 = createResponse();
      req1.site = site;
      req1.server = {};
      await handleDataRequest(req1, res1, next);
      expect(res1.statusCode).to.eql(200);
      const headers = res1._getHeaders();
      expect(headers).to.have.property('etag').that.is.a('string');
      const req2 = createRequest({
        headers: { 'if-none-match': headers.etag },
        params: { name: 'sushi' }
      });
      const res2 = createResponse();
      req2.site = site;
      req2.server = {};
      await handleDataRequest(req2, res2, next);
      expect(res2.statusCode).to.eql(304);
      expect(res2._getData()).to.eql('');
      const req3 = createRequest({
        headers: { 'if-none-match': 'dingo' },
        params: { name: 'sushi' }
      });
      const res3 = createResponse();
      req3.site = site;
      req3.server = {};
      await handleDataRequest(req3, res3, next);
      expect(res3.statusCode).to.eql(200);
    })
    skip.if.watching.
    it('should return data from an Excel file at Dropbox', async function() {
      this.timeout(5000);
      const req = createRequest({
        params: { name: 'example' }
      });
      const res = createResponse();
      req.site = site;
      req.server = {};
      await handleDataRequest(req, res, next);
      const data = res._getData();
      const headers = res._getHeaders();
      expect(headers).to.have.property('etag').that.is.a('string');
      const json = JSON.parse(data);
      expect(json).to.have.property('sheets').that.is.an('array');
    })
  })
})
