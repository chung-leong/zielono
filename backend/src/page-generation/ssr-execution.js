const { Agent } = require('http');
const fetch = require('cross-fetch');

async function generatePage(ssr, options) {
  // TODO: run the code
  const urls = [];
  const html = `<html>${ssr}</html>`;

  // prevent eval from being used afterward
  delete global.eval;
  return { html, urls };
}

module.exports = {
  generatePage,
};
