const missingTokens = [];

function getAccessToken(type) {
  const key = `${type.toUpperCase()}_PAT`;
  const token = process.env[key];
  if (!token && !missingTokens.includes(key)) {
    missingTokens.push(key);
  }
  return token;
}

after(function() {
  if (missingTokens.length > 0) {
    console.warn(`Access tokens need to be set in order to complete the test: ${missingTokens.join(', ')}`);
  }
})

function createConditional(name, cond) {
  return (desc, f) => {
    const mochaFunc = global[name];
    if (typeof(cond) === 'function') {
      cond = cond();
    }
    if (cond) {
      mochaFunc.skip(desc, f);
    } else {
      mochaFunc(desc, f);
    }
  };
}

function createConditionals(cond) {
  return {
    it: createConditional('it', cond),
    describe: createConditional('describe', cond),
  };
}

const watching = /:watch/.test(process.env.npm_lifecycle_event);
const skip = {
  if: {
    watching: createConditionals(watching),
    no: {
      github: createConditionals(() => watching || !getAccessToken('github'))
    }
  }
};

export {
  skip,
  getAccessToken,
};
