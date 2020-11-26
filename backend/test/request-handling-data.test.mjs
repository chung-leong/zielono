import Chai from 'chai'; const { expect } = Chai;
import tmp from 'tmp-promise';
import del from 'del';
import glob from 'fast-glob';
import { loadExcelFile } from './helpers/file-loading.mjs'

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
      await saveEmbeddedMedia(site, json);
      const files = await glob([ `${tmpFolder.path}/images/*.jpeg`]);
      expect(files).to.have.lengthOf(6);
      const sheet = json.sheets[0];
      const cellD2 = sheet.rows[0][3];
      expect(cellD2.image).to.have.property('hash', '1a1e9e305b5a132560e861531430f9b881b35cd1');
      expect(cellD2.image).to.have.property('width', 440);
      expect(cellD2.image).to.have.property('height', 440);
    })
  })
  describe('#handleDataRequest()', function() {
  })
})
