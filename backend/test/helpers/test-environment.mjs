function getAccessToken(type) {
  const key = `${type.toUpperCase()}_PAT`;
  const token = process.env[key];
  return token;
}

function getServiceURL(type) {
  const key = `${type.toUpperCase()}_URL`;
  const url = process.env[key];
  return url;
}

export {
  getAccessToken,
  getServiceURL,
};
