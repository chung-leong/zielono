import Chai from 'chai'; const { expect } = Chai;
import FS from 'fs'; const { lstat } = FS.promises;
import tmp from 'tmp-promise';
import del from 'del';
import HttpMocks from 'node-mocks-http'; const { createRequest, createResponse } = HttpMocks;
import { loadExcelFile, getAssetPath } from './helpers/file-loading.mjs'

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
        storage: { path: tmpFolder.path }
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
    let tmpFolder;
    before(async function() {
      tmpFolder = await tmp.dir();
    })
    after(async function() {
      await del([ tmpFolder.path ], { force: true });
    })
    it('should return data from an Excel file on disk', async function() {
      const file = {
        name: 'sushi',
        path: getAssetPath('sushi.xlsx')
      };
      const site = {
        name: 'tmp',
        storage: { path: tmpFolder.path },
        files: [ file ]
      };
      const req = createRequest({
        params: { name: 'sushi' }
      })
      const res = createResponse();
      req.site = site;
      req.server = {};
      const next = (err) => {
        if (err) {
          throw err;
        }
      };
      await handleDataRequest(req, res, next);
      const data = res._getData();
      const headers = res._getHeaders();
      expect(headers).to.have.property('etag');
      expect(headers).to.have.property('last-modified');
    })
  })
})
