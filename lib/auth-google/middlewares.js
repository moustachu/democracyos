var config = require('lib/config');

module.exports.restrict = function authGoogleRestrict(req, res, next){
  if (config.googleSignin) {
    if (req.xhr) {
      res.send(403, { error: 'You can only signin with google.' });
    } else {
      res.redirect('/');
    }
    return
  }

  return next();
}
