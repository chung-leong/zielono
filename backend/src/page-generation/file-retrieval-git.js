const startsWith = require('lodash/startsWith');
const includes = require('lodash/includes');
const deasync = require('deasync');
const fetch = require('cross-fetch');
const Module = require('module');

/**
 * Override require() so that code can be retrieved from remote location
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

  const moduleWhitelist = [];
  const jsExtensionBefore = Module._extensions['.js'];
  Module._extensions['.js'] = function(module, path) {
    if (startsWith(path, './')) {
      const downloadOpts = {};
      let content = retrieveFromGitSync(path, downloadOpts);
      if (typeof(content) != 'string') {
        content = content.toString();
      }
      module._compile(content, path);
    } else if (includes(moduleWhitelist, path)) {
      jsExtensionBefore(module, path);
    } else {
      throw new Error(`Cannot load ${path}`);
    }
  };
}

async function retrieveFromGit(path, options) {
  const url = 'https://raw.githubusercontent.com/chung-leong/trambar-generic/master/ssr/index.js';
  const req = await fetch(url);
  const buffer = await req.buffer();
  return buffer;
}

const retrieveFromGitSync = deasync((path, options, cb) => {
  retrieveFromGit(path, options).then((data) => {
    cb(null, data);
  }).catch((err) => {
    cb(err, null);
  });
});

module.exports = {
  overrideRequire,
  retrieveFromGit,
  retrieveFromGitSync,
};
