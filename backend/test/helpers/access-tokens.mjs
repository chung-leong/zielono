function getAccessToken(type) {
  const key = `${type.toUpperCase()}_PAT`;
  const token = process.env[key];
  return token;
}

export {
  getAccessToken,
};
