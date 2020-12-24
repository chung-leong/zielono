import Chai from 'chai'; const { expect } = Chai;
import delay from 'delay';
import { saveYAML, removeYAML } from './helpers/file-saving.mjs';
import { createTempConfig } from './helpers/config-creation.mjs';
import { findSiteConfig, findServerConfig } from '../lib/config-loading.mjs';

import {
  watchConfigFolder,
  unwatchConfigFolder,
  configEventEmitter,
} from '../lib/config-watching.mjs';

describe('Config watching', function() {
  let tmpFolder;
  before(async function() {
    tmpFolder = await createTempConfig();
  })
  describe('watchConfigFolder()', function() {
    it('should detect site addition', async function() {
      try {
        await watchConfigFolder();
        let change;
        const event = new Promise((resolve) => {
          configEventEmitter.once('site-change', (before, after) => {
            change = { before, after };
          });
        });
        await saveYAML(tmpFolder, 'site4', {});
        await Promise.race([ event, delay(500) ]);
        expect(change).to.have.property('before', undefined);
        expect(change).to.have.property('after').that.is.an('object');
        const site3 = findSiteConfig('site3');
        expect(site3).to.be.an('object');
      } finally {
        await unwatchConfigFolder();
      }
    })
    it('should detect site removal', async function() {
      try {
        await watchConfigFolder();
        let change;
        const event1 = new Promise((resolve) => {
          configEventEmitter.once('site-change', (before, after) => {
            change = { before, after };
          });
        });
        await saveYAML(tmpFolder, 'site4', {});
        await Promise.race([ event1, delay(500) ]);
        const site4 = findSiteConfig('site4');
        const event2 = new Promise((resolve) => {
          configEventEmitter.once('site-change', (before, after) => {
            change = { before, after };
          });
        });
        await removeYAML(tmpFolder, 'site4');
        await Promise.race([ event1, delay(500) ]);
        expect(change).to.have.property('before').that.is.an('object');
        expect(change).to.have.property('after', undefined);
        const site4After = findSiteConfig('site4');
        expect(site4After).to.equal(undefined);
      } finally {
        await unwatchConfigFolder();
      }
    })
    it('should detect server change', async function() {
      try {
        await watchConfigFolder();
        let change;
        const event = new Promise((resolve) => {
          configEventEmitter.once('server-change', (before, after) => {
            change = { before, after };
          });
        });
        const server = findServerConfig();
        await saveYAML(tmpFolder, 'zielono', { listen: 80 });
        await Promise.race([ event, delay(500) ]);
        expect(change).to.have.property('before').with.property('listen').that.eql([ 8080 ]);
        expect(change).to.have.property('after').with.property('listen').that.eql([ 80 ]);
        await saveYAML(tmpFolder, 'zielono', server);
      } finally {
        await unwatchConfigFolder();
      }
    })
  })
})
