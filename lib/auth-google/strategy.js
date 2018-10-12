var config = require('lib/config');
var passport = require('passport');
var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
var User = require('lib/models').User;
var utils = require('lib/utils');

var log = require('debug')('democracyos:auth-google');

/**
 * Register Google Strategy
 */

module.exports = function() {
  var callbackURL = utils.buildUrl(config, {
    pathname: '/auth/google/callback'
  });

  passport.use(
    new GoogleStrategy({
      clientID: config.auth.google.clientId,
      clientSecret: config.auth.google.clientSecret,
      callbackURL: callbackURL,
      scope: ['email','profile']
    },
    function(accessToken, refreshToken, profile, done) {

      User.findByProvider(profile, function (err, user) {
        if (err) return done(err);

        var email = profile.emails[0].value;
        if( config.domainWhiteList.length ) {
          if( !~config.domainWhiteList.indexOf(email.split('@')[1]) ) {
            log('user NOT in white list domains');
            return done(null, false, { message: 'Unauthorized domain : ' + email  });
          }
        }

        if (!user) {

          User.findByEmail(email,function (err, user) {
            if (err) return done(err);
            if(user) {
              user.set('profiles.google',profile._json);
              user.save(done);
            } else {
              return signup(profile, accessToken, done);
            }
          });

        } else {
          done(null, user);
        }

      });
    })
  );
};

/**
 * Google Registration
 *
 * @param {Object} profile PassportJS's profile
 * @param {Function} fn Callback accepting `err` and `user`
 * @api public
 */

function signup (profile, accessToken, fn) {
  var user = new User();

  user.firstName = profile._json.name.givenName;
  user.lastName = profile._json.name.familyName;
  user.profiles.google = profile._json;
  user.email = profile.emails[0].value;
  user.emailValidated = true;
  user.profilePictureUrl = profile._json.image.url ;

  user.save(function(err) {
    return fn(err, user);
  });
}
