const startsWith = require('lodash/startsWith');
const Module = require('module');
const deasync = require('deasync');
const fetch = require('cross-fetch');

/**
 * Override require() so that code can be read from memory
 *
 * @param  {object} options
 */
function overrideRequire(options) {
  const resolveFilenameBefore = Module._resolveFilename;
  Module._resolveFilename = function(request, parent, isMain) {
    if (startsWith(request, './')) {
      return request;
    } else {
      return resolveFilenameBefore(request, parent, isMain);
    }
  };

  const jsExtensionBefore = Module._extensions['.js'];
  Module._extensions['.js'] = function(module, filename) {
    if (startsWith(filename, './')) {
      const downloadOpts = {};
      let content = downloadRemoteSync(filename, downloadOpts);
      if (typeof(content) != 'string') {
        content = content.toString();
      }
      module._compile(content, filename);
    } else if (includes(filename, moduleWhitelist)) {
      jsExtensionBefore(module, filename);
    } else {
      throw new Error(`Cannot load ${filename}`);
    }
  };
}

async function downloadRemote(filename, options) {
  const url = 'https://raw.githubusercontent.com/chung-leong/trambar-generic/master/ssr/index.js';
  const req = await fetch(url);
  const buffer = await req.buffer();
  return buffer;
}

const downloadRemoteSync = deasync((filename, options, cb) => {
  downloadRemote(filename, options).then((data) => {
    cb(null, data);
  }).catch((err) => {
    cb(err, null);
  });
});

module.exports = {
  overrideRequire,
  downloadRemote,
  downloadRemoteSync,
};
