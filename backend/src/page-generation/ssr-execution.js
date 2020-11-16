const HTTP = require('http'); const { Agent } = HTTP;
const fetch = require('cross-fetch');

async function generatePage(ssr, log, options) {
  // delete process
  const processBefore = process;
  delete global.process;
  // replace console
  const consoleBefore = console;
  global.console = new SSRConsole(log);

  // TODO: run the code
  const headers = [];
  const html = `<html>${ssr}</html>`;

  // prevent eval from being used afterward
  delete global.eval;
  // restore variables
  global.console = consoleBefore;
  global.process = processBefore;
  return { headers, html };
}

class SSRConsole {
  constructor(log) {
    this.save = (type, args) => log.push({ type, args });
  }

  assert(expr, msg) { expr || this.save('assert', [ msg ]) }
  log(...args)	{ this.save('log', args) }
  error(...args)	{ this.save('error', args) }
  info(...args) { this.save('info', args) }
  warn(...args) { this.save('warn', args) }
  clear() {}
  count() {}
  group()	{}
  groupCollapsed() {}
  groupEnd() {}
  table()	{}
  time()	{}
  timeEnd()	{}
  trace()	{}
}

module.exports = {
  generatePage,
};
