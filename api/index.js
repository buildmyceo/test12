const app = require('../server');

module.exports = (req, res) => {
  // Ensure requests routed to the serverless function retain /api prefix for Express routing
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  return app(req, res);
};

module.exports.app = app;
