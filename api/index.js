const app = require('../server');

module.exports = (req, res) => {
  // Ensure req.url retains /api prefix for Express routing regardless of serverless gateway rewrite format
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  return app(req, res);
};

module.exports.app = app;
