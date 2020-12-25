import Chai from 'chai'; const { expect } = Chai;
import { processServerConfig, processSiteConfig, setConfigFolder } from '../lib/config-loading.mjs';

import {
  displayError,
} from '../lib/error-handling.mjs';

describe('Error handling', function() {
  describe('displayError()', function() {
    let nodeEnvBefore;
    let consoleErrorBefore;
    let consoleErrorArgs;
    before(function() {
      nodeEnvBefore = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      consoleErrorBefore = console.error;
      console.error = (...args) => { consoleErrorArgs = args };
      setConfigFolder('./');
    })
    after(function() {
      process.env.NODE_ENV = nodeEnvBefore;
      console.error = consoleErrorBefore;
      consoleErrorArgs = undefined;
    })
    it('should display a clear message when an unrecognized field is present in a config file', function() {
      try {
        processServerConfig({ random: 1 });
      } catch (err) {
        err.filename = 'zielono.yaml';
        err.lineno = 4;
        displayError(err);
      }
      expect(consoleErrorArgs).to.have.lengthOf(1);
      const msg = 'Error encounter in zielono.yaml (line 4): unrecognized property "random"';
      expect(consoleErrorArgs[0]).to.contain(msg);
    })
    it('should display a clear message when there is a type mismatch', function() {
      try {
        processServerConfig({ listen: 'string' });
      } catch (err) {
        err.filename = 'zielono.yaml';
        err.lineno = 4;
        displayError(err);
      }
      expect(consoleErrorArgs).to.have.lengthOf(1);
      const msg = 'Error encounter in zielono.yaml (line 4): property "listen" should be an array';
      expect(consoleErrorArgs[0]).to.contain(msg);
    })
    it('should display a clear message when a required property is missing', function() {
      try {
        processSiteConfig('name', {
          files: [
            { url: 'https://somewhere' }
          ]
        });
      } catch (err) {
        err.filename = 'site.yaml';
        err.lineno = 16;
        displayError(err);
      }
      expect(consoleErrorArgs).to.have.lengthOf(1);
      const msg = 'Error encounter in site.yaml (line 16): required property "name" is missing';
      expect(consoleErrorArgs[0]).to.contain(msg);
    })
    it('should display a clear message when a a file ref contains both a URL and a path', function() {
      try {
        processSiteConfig('name', {
          files: [
            {
              name: 'donut',
              url: 'https://somewhere',
              path: '/somewhere'
            }
          ]
        });
      } catch (err) {
        err.filename = 'site.yaml';
        err.lineno = 16;
        displayError(err);
      }
      expect(consoleErrorArgs).to.have.lengthOf(1);
      const msg = 'Error encounter in site.yaml (line 16): property "url" and "path" cannot both be present';
      expect(consoleErrorArgs[0]).to.contain(msg);
    })
    it('should display a clear message when a a file ref contains neither a URL or a path', function() {
      try {
        processSiteConfig('name', {
          files: [
            {
              name: 'donut',
            }
          ]
        });
      } catch (err) {
        err.filename = 'site.yaml';
        err.lineno = 16;
        displayError(err);
      }
      expect(consoleErrorArgs).to.have.lengthOf(1);
      const msg = 'Error encounter in site.yaml (line 16): property "url" or "path" is required';
      expect(consoleErrorArgs[0]).to.contain(msg);
    })
  })
})
