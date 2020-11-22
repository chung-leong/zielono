function skipIf(cond, desc, f) {
  if (typeof(cond) === 'function') {
    cond = cond();
  }
  if (cond) {
    this.skip(desc, f);
  } else {
    this(desc, f);
  }
}

const watching = /:watch/.test(process.env.npm_lifecycle_event);
describe.skip.watch = skipIf.bind(it, watching);
it.skip.watch = skipIf.bind(it, watching);
