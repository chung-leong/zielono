import Chai from 'chai'; const { expect } = Chai;
import HttpMocks from 'node-mocks-http'; const { createRequest, createResponse } = HttpMocks;
import { loadAsset, loadExcelFile } from './helpers/file-loading.mjs';
import { createTempFolder } from './helpers/file-saving.mjs';
import { getAssetPath  } from './helpers/path-finding.mjs';
import { loadConfig, findSiteConfig } from '../lib/config-loading.mjs';
import { saveEmbeddedMedia } from '../lib/request-handling-data.mjs';

import {
  handleImageRequest,
  decodeFilters,
  transformImage,
  getImageMeta,
} from '../lib/request-handling-image.mjs';

describe('Image request handling', function() {
  describe('getImageMeta()', function() {
    it('should obtain metadata about a JPEG image', async function() {
      const buffer = await loadAsset('krakow.jpg');
      const meta = await getImageMeta(buffer, 'jpeg');
      expect(meta).to.have.property('width', 220);
      expect(meta).to.have.property('height', 146);
    })
    it('should obtain metadata about a PNG image', async function() {
      const buffer = await loadAsset('krakow.png');
      const meta = await getImageMeta(buffer, 'png');
      expect(meta).to.have.property('width', 220);
      expect(meta).to.have.property('height', 146);
    })
    it('should obtain metadata about a GIF image', async function() {
      const buffer = await loadAsset('krakow.gif');
      const meta = await getImageMeta(buffer, 'gif');
      expect(meta).to.have.property('width', 220);
      expect(meta).to.have.property('height', 146);
    })
  })
  describe('decodeFilters()', function() {
    it('should extract commands and arguments from filter string', function() {
      const operations = decodeFilters('p17+re400x400+gr+l', 'jpeg');
      expect(operations).to.be.an('array').with.lengthOf(4);
      expect(operations[0]).to.have.property('name', 'position');
      expect(operations[0]).to.have.property('operator').that.is.a('function');
      expect(operations[0]).to.have.property('args').that.eql([ 17 ]);
      expect(operations[1]).to.have.property('name', 'resize');
      expect(operations[1]).to.have.property('args').that.eql([ 400, 400 ]);
      expect(operations[2]).to.have.property('name', 'grayscale');
      expect(operations[3]).to.have.property('name', 'lossless');
    })
  })
  describe('transformImage()', function() {
    it('should resize a PNG to a given width and save as JPEG', async function() {
      const buffer = await loadAsset('krakow.png');
      const operations = decodeFilters('w180', 'jpeg');
      const result = await transformImage(buffer, operations, 'jpeg');
      const meta = await getImageMeta(result, 'png');
      expect(meta).to.have.property('width', 180);
    })
    it('should resize an SVG to a given width', async function() {
      const buffer = await loadAsset('example.svg');
      const operations = decodeFilters('w180', 'svg');
      const result = await transformImage(buffer, operations, 'svg');
      const meta = await getImageMeta(result, 'png');
      expect(meta).to.have.property('width', 180);
    })
  })
  describe('handleImageRequest()', function() {
    const site = { name: 'tmp' };
    before(async function() {
      // extract images from test excel file
      site.storage = await createTempFolder();
      const json = await loadExcelFile('sushi.xlsx');
      const list = await saveEmbeddedMedia(site, json);
      expect(list).to.have.lengthOf(6);
    })
    let nextCalled, next;
    beforeEach(function() {
      nextCalled = false;
      next = (err) => {
        nextCalled = true;
        if (err) {
          throw err;
        }
      };
    })
    it('should send an image as is when there is no filename', async function() {
      const req = createRequest({
        params: { hash: '1a1e9e305b5a132560e861531430f9b881b35cd1' },
        site
      });
      const res = createResponse();
      await handleImageRequest(req, res, next);
      expect(res._getData()).to.be.instanceOf(Buffer);
      expect(res._getHeaders()).to.have.property('content-type', 'image/jpeg');
    })
    it('should convert an image to a differnt format where an extension is given', async function() {
      const req = createRequest({
        params: {
          hash: '1a1e9e305b5a132560e861531430f9b881b35cd1',
          filename: '.png'
        },
        site
      });
      const res = createResponse();
      await handleImageRequest(req, res, next);
      const data = res._getData();
      expect(data).to.be.instanceOf(Buffer);
      expect(res._getHeaders()).to.have.property('content-type', 'image/png');
      const meta = await getImageMeta(data, 'png');
      expect(meta.format).to.equal('png');
    })
    it('should resize image on the fly', async function () {
      const req = createRequest({
        params: {
          hash: '1a1e9e305b5a132560e861531430f9b881b35cd1',
          filename: 'res50x50'
        },
        site
      });
      const res = createResponse();
      await handleImageRequest(req, res, next);
      const data = res._getData();
      expect(data).to.be.instanceOf(Buffer);
      expect(res._getHeaders()).to.have.property('content-type', 'image/jpeg');
      const meta = await getImageMeta(data, 'jpeg');
      expect(meta.format).to.equal('jpeg');
      expect(meta.width).to.equal(50);
      expect(meta.height).to.equal(50);
    })
  })
})
