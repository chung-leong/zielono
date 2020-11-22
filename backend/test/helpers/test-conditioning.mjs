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

const missingTokens = [];

function getAccessToken(type) {
  const key = `${type.toUpperCase()}_PAT`;
  const token = process.env[key];
  if (!token && !missingTokens.includes(key)) {
    missingTokens.push(key);
  }
  return token;
}

function applyTo(f) {
  const watching = /:watch/.test(process.env.npm_lifecycle_event);
  f.skip.if = {};
  f.skip.if.watching = skipIf.bind(f, watching);
  f.skip.if.no = {};
  f.skip.if.no.github = skipIf.bind(f, () => {
    return watching || !getAccessToken('github');
  });
}

after(function() {
  if (missingTokens.length > 0) {
    console.warn(`Access tokens need to be set in order to complete the test: ${missingTokens.join(', ')}`);
  }
})

function apply() {
  applyTo(describe);
  applyTo(it);
}

export {
  apply,
  getAccessToken,
};
