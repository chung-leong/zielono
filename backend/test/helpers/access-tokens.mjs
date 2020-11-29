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

export {
  getAccessToken,
};
