/**
 * Extend module's NODE_PATH
 * HACK: temporary solution
 */

require('node-path')(module);

/**
 * Module dependencies.
 */

var mongoose = require('mongoose');
var Comment = mongoose.model('Comment');
var utils = require('lib/utils');
var pluck = utils.pluck;
var config = require('lib/config');
var t = require('t-component');
var log = require('debug')('democracyos:db-api:comment');
var config = require('lib/config');
var notifier = require('lib/notifications').notifier;
var User = require('lib/models').User;
var Topic = require('./topic');

var fields = 'id firstName lastName fullName email staff status profilePictureUrl';

/**
 * Get all comments for a particular topic or platform
 *
 * @param  {ObjectId} topicId  [objectId of either topic or platform]
 * @param  {Function} fn      [callback]
 * @return {Module}           [`comment` module]
 */
exports.all = function all(options, fn) {
  if ('function' == typeof options) {
    fn = options;
    options = {};
  }

  var paging = options.paging || {page: 0, limit: 0};

  var query = {};
  if (options.topicId) query.topicId = options.topicId;
  if (options.author) query.author = options.author;
  if (options.context) query.context = options.context;

  log('Looking for all comments from %s', options.topicId);

  Comment
  .find(query)
  .sort(paging.sort || '-createdAt')
  .skip(paging.page * paging.limit)
  .limit(paging.limit)
  .populate('author')
  .exec(function (err, comments) {
    if (err) return _handleError(err, fn);

    log('Delivering comments %j', pluck(comments, 'id'));
    fn(null, comments);
  });

  return this;
};

exports.get = function get(id, fn) {
  var query = {_id: id};
  log('Looking for comment %s', id);

  Comment
  .findOne(query)
  .exec(function (err, comment) {
    if (err) return _handleError(err, fn);

    log('Delivering comment %s', comment.id);
    fn(null, comment);
  });
};

/**
 * Create comment for `topic` by `author`
 * with `text`
 *
 * @param {Object} comment comment vars like `text` and `author`
 * @param {Function} fn callback function
 *   - 'err' error found while process or `null`
 *   - 'comments' list items found or `undefined`
 * @api public
 */

exports.create = function create(data, fn) {
  log('Creating new comment %j for %s %s', data.text, data.context, data.reference);

  var comment = new Comment(data);

  comment.save(function (err) {
    if (err) return _handleError(err, fn);

    User.populate(comment, { path: 'author' }, function(err) {
      if (err) return _handleError(err, fn);

      log('Delivering comment %j', comment.id);
      fn(null, comment);
    });
  });
};

exports.update = function get(query, values, fn) {
  Comment.update(query, values, { multi: true }, fn);
};

/**
 * Get replies for comment
 *
 * @param {String} id
 * @param {Function} fn callback function
 *   - 'err' error found while process or `null`
 *   - 'comments' list items found or `undefined`
 * @api public
 */

exports.replies = function replies(id, fn) {
  log('Looking for replies for comment %s', id);

  Comment
  .findOne({ _id: id })
  .exec(function(err, comment) {
    if (err) return _handleError(err, fn);

    var opts = { path: 'replies.author', select: fields };

    User.populate(comment, opts, function(err, comment) {
      if (err) return _handleError(err, fn);

      var replies = comment && comment.replies ? comment.replies : [];

      log('Delivering replies %j', pluck(replies, 'id'));
      fn(null, replies);
    });
  });
};

/**
 * Reply to comment
 *
 * @param {String} commentId to attach reply
 * @param {Object} reply object with params
 * @param {Function} fn callback function
 *   - 'err' error found while process or `null`
 *   - 'comments' list items found or `undefined`
 * @api public
 */

exports.reply = function reply(commentId, data, fn) {
  log('Looking for comment %s to reply with %j', commentId, data);

  Comment.findById(commentId, function(err, comment) {
    if (err) return _handleError(err, fn);

    log('Creating reply %j for comment %j', data, comment);
    var doc = comment.replies.create(data);
    comment.replies.push(doc);

    comment.save(function(err, saved) {
      if (err) return _handleError(err, fn);

      var opts = { path: 'replies.author', select: fields };

      User.populate(comment, opts, function(err, comment) {
        if (err) {
          log('Found error %j', err);
          return fn(err);
        }

        if (comment.author.id !== data.author) {
          var eventName = 'comment-reply';
          log('%s : %j !== %j : ',eventName,typeof comment.author.id, typeof data.author);
          var topicUrl = '';
          Topic.getWithForum(comment.reference, function(err, topic) {
            if (topic.forum) {
              topicUrl = utils.buildUrl(config, { pathname: '/' + topic.forum.name + '/topic/' + comment.reference });
            } else {
              topicUrl = utils.buildUrl(config, { pathname: '/topic/' + comment.reference });
            }

            log(comment.author);

            var r = {
              id: doc.id,
              author: { id: data.author },
              text: data.text
            };

            var c = {
              id: comment.id,
              author: { id: comment.author }
            };

            notifier.notify(eventName)
              .to(data.author.email)
              .withData({ reply: r, comment: c, url: topicUrl })
              .send(function (err, data) {
                if (err) {
                  log('Error when sending notification for event %s: %j', eventName, err);
                  return fn(err);
                }

                log('Delivering reply %s', doc.id);
                return fn(null, doc);
              });
          });
        } else {
          return fn(null, doc);
        }
      });
    });
  });
};

/**
 * Edit a reply
 *
 * @param {Object} comment to attach reply
 * @param {Object} reply object with params
 * @param {Function} fn callback function
 *   - 'err' error found while process or `null`
 *   - 'comments' list items found or `undefined`
 * @api public
 */

exports.editReply = function editReply(comment, reply, fn) {
  log('Looking for comment %s to reply with %s', comment.id, reply.id);

  reply.editedAt = Date.now();

  Comment.update(
    {_id: comment.id, 'replies._id': reply.id},
    //{$set: {'replies.$.alias': reply.alias, 'replies.$.text': reply.text, 'replies.$.editedAt': reply.editedAt}},
    {$set: {'replies.$.text': reply.text, 'replies.$.editedAt': reply.editedAt}},
    function (err) {
      if (err) return _handleError(err, fn);

      log('Delivering reply %s', reply.id);
      fn(null, reply);
    }
  );
};

/**
 * Upvote comment
 *
 * @param {String} id
 * @param {User|ObjectId|String} user
 * @param {Function} fn callback function
 *   - 'err' error found while process or `null`
 *   - 'comment' list items found or `undefined`
 * @api public
 */

exports.upvote = function upvote(id, user, fn) {
  Comment.findById(id, function(err, comment) {
    if (err) {
      log('Found error %s', err);
      return fn(err);
    }

    User.populate(comment, {path: 'author'}, function (err, comment) {
      if (err) return log('Found error %s', err), fn(err);

      if (comment.author.id === user.id) {
        log('Author %s tried to vote their own comment %s', user.id, comment.id);
        return fn(t('comments.score.not-allowed'), comment);
      }

      log('Upvoting comment %s', comment.id);
      comment.vote(user, 'positive', function(err) {
        if (err) return log('Found error %s', err), fn(err);

        var eventName = 'comment-upvote';
        notifier.notify(eventName)
          .to(comment.author.email)
          .withData({ comment: comment, user: user })
          .send(function (err, data) {
            if (err) {
              log('Error when sending notification for event %s: %j', eventName, err);
              return fn(err);
            }

            log('Delivering comment %s', comment.id);
            fn(null, comment);
          });
      });
    });
  });
};

/**
 * Downvote comment
 *
 * @param {String} id
 * @param {User|ObjectId|String} user
 * @param {Function} fn callback function
 *   - 'err' error found while process or `null`
 *   - 'comments' list items found or `undefined`
 * @api public
 */

exports.downvote = function downvote(id, user, fn) {
  Comment.findById(id, function(err, comment) {
    if (err) {
      log('Found error %s', err);
      return fn(err);
    }

    User.populate(comment, {path: 'author'}, function (err, comment) {
      if (err) {
        log('Found error %s', err);
        return fn(err);
      }

      if (comment.author.id === user.id) {
        log('Author %s tried to vote their own comment %s', user.id, comment.id);
        return fn(t('comments.score.not-allowed'), comment);
      }

      log('Downvoting comment %s', comment.id);
      comment.vote(user, 'negative', function(err) {
        if (err) {
          log('Found error %s', err);
          return fn(err);
        }

        var eventName = 'comment-downvote';
        notifier.notify(eventName)
          .to(comment.author.email)
          .withData({ comment: comment, user: user })
          .send(function (err, data) {
            if (err) {
              log('Error when sending notification for event %s: %j', eventName, err);
              return fn(err);
            }

            log('Delivering comment %s', comment.id);
            fn(null, comment);
          });
      });
    });
  });
};


/**
 * Remove votation positive/negative from some comment.
 *
 * @param {String} id Comment id.
 * @param {Function} fn Callback function
 * @param {User} user The voe user
 */
exports.unvote = function (id, user, fn) {
  Comment.findById(id, function (err, comment) {
    if (err) {
      log('Found error %s', err);
      return fn(err);
    }

    User.populate(comment, {path: 'author'}, function (err, comment) {
      if (err) {
        log('Found error %s', err);
        return fn(err);
      }

      log('Remove vote from comment %s', comment.id);

      comment.unvote(user, function (err) {
        if (err) {
          log('Found error %s', err);
          return fn(err);
        }

        log('Delivering unvoted comment %s', comment.id);
        fn(null, comment);
      });
    });
  });
};

/**
 * Flag comment as spam
 *
 * @param {String} id
 * @param {User|ObjectId|String} user
 * @param {Function} fn callback function
 *   - 'err' error found while process or `null`
 *   - 'comment' list items found or `undefined`
 * @api public
 */

exports.flag = function flag(id, user, fn) {
  Comment.findById(id, function(err, comment) {
    if (err) {
      log('Found error %s', err);
      return fn(err);
    }

    log('Upvoting comment %s', comment.id);
    comment.flag(user, 'spam', function(err) {
      if (err) {
        log('Found error %s', err);
        return fn(err);
      }

      log('Delivering comment %s', comment.id);
      fn(null, comment);
    });
  });
};

/**
 * Unflag comment as spam
 *
 * @param {String} id
 * @param {User|ObjectId|String} user
 * @param {Function} fn callback function
 *   - 'err' error found while process or `null`
 *   - 'comments' list items found or `undefined`
 * @api public
 */

exports.unflag = function unflag(id, user, fn) {
  Comment.findById(id, function(err, comment) {
    if (err) {
      log('Found error %s', err);
      return fn(err);
    }

    log('Downvoting comment %s', comment.id);
    comment.unflag(user, function(err) {
      if (err) {
        log('Found error %s', err);
        return fn(err);
      }

      log('Delivering comment %s', comment.id);
      fn(null, comment);
    });
  });
};


/**
 * Edit comment
 *
 * @param {String} id
 * @param {User|ObjectId|String} user
 * @param {Function} fn callback function
 *   - 'err' error found while process or `null`
 * @api public
 */

exports.edit = function edit(comment, fn) {
  log('Updating comment %s', comment.id);

  comment.save(function (err, comment) {
    if (err) {
      log('Found error %s', err);
      return fn(err);
    }

    log('Updated comment %s', comment.id);
    fn(null, comment);
  });

  return this;
};

/**
 * Remove comment
 *
 * @param {String} id
 * @param {User|ObjectId|String} user
 * @param {Function} fn callback function
 *   - 'err' error found while process or `null`
 * @api public
 */

exports.remove = function remove(comment, fn) {
  comment.remove(function(err) {
    if (err) {
      log('Found error %s', err);
      return fn(err);
    }

    log('Comment %s removed', comment.id);
    fn(null);
  });
};

/**
 * Search comment ratings
 *
 * @param {Function} fn callback function
 *   - 'err' error found while process or `null`
 *   - 'ratings', total rated comments or `undefined`
 * @return {Module} `topic` module
 * @api public
 */

exports.ratings = function ratings(fn) {
  log('Counting total rated comments');

  Comment
    .aggregate(
      {$unwind: '$votes'},
      {$group: {_id: '#votes', total: {$sum: 1}}},
      function (err, res) {
        if (err) return _handleError(err, fn);

        if (!res[0]) return fn(null, 0);

        var rated = res[0].total;

        log('Found %d rated comments', rated);
        fn(null, rated);
      }
    );

  return this;
};

/**
 * Total replies
 *
 * @param {Function} fn callback function
 *   - 'err' error found while process or `null`
 *   - 'replies', total comment replies or `undefined`
 * @return {Module} `topic` module
 * @api public
 */

exports.totalReplies = function totalReplies(fn) {
  log('Counting total comment replies');

  Comment
    .aggregate(
      {$unwind: '$replies'},
      {$group: {_id: '#replies', total: { $sum: 1 }}},
      function (err, res) {
        if (err) return _handleError(err, fn);

        if (!res[0]) return fn(null, 0);

        var replies = res[0].total;

        log('Found %d comment replies', replies);
        fn(null, replies);
      }
    );

  return this;
};

function _handleError(err, fn){
  log('Found error: %j', err);
  return fn(err);
}
