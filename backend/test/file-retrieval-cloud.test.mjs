import Chai from 'chai'; const { expect } = Chai;

import {
  retrieveFromCloud,
  getDownloadURL,
} from '../src/file-retrieval-cloud.mjs';

describe('File retrieval from cloud', function() {
  describe('#getDownloadURL()', function() {
    it('should return download URL for file on Dropbox', function() {
      const url = 'https://www.dropbox.com/s/4krscr943y90gd8/hello.json?dl=0';
      const result = getDownloadURL(url);
      expect(result).to.eql('https://dl.dropboxusercontent.com/s/4krscr943y90gd8/hello.json?dl=1');
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
  describe('#retrieveFromCloud()', function() {
    it('should retrieve file from Dropbox', async function() {
      const url = 'https://www.dropbox.com/s/4krscr943y90gd8/hello.json?dl=0';
      const result = await retrieveFromCloud(url, {});
      expect(result).to.be.instanceOf(Buffer);
      expect(result).to.have.property('etag').that.is.a.string;
      expect(result).to.have.property('filename').that.eql('hello.json');
      expect(JSON.parse(result)).to.eql({ message: 'hello world' });
    })
    it('should retrieve file from OneDrive', async function() {
      const url = 'https://1drv.ms/u/s!AvWf91TkbQTjhNZNVr8WG9PL-gdaYQ?e=pLFRfZ';
      const result = await retrieveFromCloud(url, {});
      expect(result).to.be.instanceOf(Buffer);
      expect(result).to.have.property('etag').that.is.a.string;
      expect(result).to.have.property('filename').that.eql('hello.json');
      expect(JSON.parse(result)).to.eql({ message: 'hello world' });
    })
  })
})
