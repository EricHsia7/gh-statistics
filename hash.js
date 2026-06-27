const crypto = require('crypto');

function sha512(data) {
  const hash = crypto.createHash('sha512');
  hash.update(data);
  return hash.digest('hex');
}

function sha256(data) {
  const hash = crypto.createHash('sha256');
  hash.update(data);
  return hash.digest('hex');
}

function md5(data) {
  const hash = crypto.createHash('md5');
  hash.update(data);
  return hash.digest('hex');
}

module.exports = {
  sha512,
  sha256,
  md5
};
