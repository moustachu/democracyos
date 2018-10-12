/**
 * Module dependencies.
 */

var express = require('express');
var restrict = require('lib/utils').restrict;
var accepts = require('lib/accepts');
var utils = require('lib/utils');
var expose = utils.expose;
var pluck = utils.pluck;
var api = require('lib/db-api');
var t = require('t-component');
var log = require('debug')('democracyos:comment');

var is = require('mout/lang/is');
var isnt = require('mout/lang/isnt');

var app = module.exports = express();

/**
 * Limit request to json format only
 */

app.use(accepts('application/json'));

app.get('/comment/all', requireTopicId, function (req, res) {
  log('Request /comment/all for %s', req.query.topicId);

  var sort = '';
  if (~['-score', '-createdAt', 'createdAt'].indexOf(req.query.sort)) {
    sort = req.query.sort;
  } else {
    sort = '-score';
  }

  var paging = {
    page: req.query.page || 0,
    limit: req.query.limit || 0,
    sort: sort
  };

  var context = req.query.context || 'topic';
  var author = req.query.excludeAuthor ? {'$ne': req.query.excludeAuthor} : null;

  api.comment.all({
    topicId: req.query.topicId,
    author: author,
    paging: paging,
    context: context
  }, function (err, comments) {
    if (err) return _handleError(err, req, res);

    if (!req.query.count) {
      log('Serving %s comments %j', req.query.topicId, pluck(comments, 'id'));

      var keys = [
        'id alias text createdAt editedAt context reference',
        'author.id author.fullName author.displayName author.avatar author.staff author.status',
        'flags upvotes downvotes votes replies.length'
      ].join(' ');

      res.json(comments.map(expose(keys)));
    } else {
      log('Serving %s comments count: %d', req.query.topicId, comments.length);

      res.json(comments.length);
    }
  });
});

app.get('/comment/mine', restrict, requireTopicId, function (req, res) {
  log('Request /comment/mine for %s',  req.query.topicId);

  api.comment.all({
    topicId: req.query.topicId,
    author: req.user.id
  }, function (err, comments) {
    if (err) return _handleError(err, req, res);

    log('Serving %s comments %j for user %s', req.query.topicId, pluck(comments, 'id'), req.user.id);

    var keys = [
      'id alias text createdAt editedAt context reference',
      'author.id author.fullName author.displayName author.avatar author.staff author.status',
      'flags upvotes downvotes votes replies.length'
    ].join(' ');

    res.json(comments.map(expose(keys)));
  });
});

app.get('/comment/sidecomments', requireTopicId, function (req, res) {
  log('Requesting sidecomments for topic %s', req.query.topicId);

  api.comment.all({
    topicId: req.query.topicId,
    context: 'paragraph'
  }, function (err, comments) {
    if (err) return _handleError(err, req, res);
    log('Serving %s %s body\'s comments %j', req.query.id, pluck(comments, 'id'));

    var keys = [
      'id alias text createdAt editedAt context reference',
      'author.id author.fullName author.displayName author.avatar',
      'flags upvotes downvotes votes replies.length'
    ].join(' ');

    res.json(comments.map(expose(keys)));
  });
});

app.get('/comment/:id', function (req, res) {
  log('Request /comment/%s', req.params.id);

  api.comment.get(req.params.id, function (err, comment) {
    if (err) return _handleError(err, req, res);

    var keys = [
      'id alias text createdAt editedAt context reference',
      'author.id author.fullName author.displayName author.avatar author.staff author.status',
      'flags upvotes downvotes votes replies.length'
    ].join(' ');

    res.json(expose(keys)(comment));
  });
});

app.post('/comment', restrict, requireTopicId, function (req, res) {
  log('Request /comment for %s with %j', req.query.topicId, req.body);

  var comment = {
    text: req.body.text,
    context: req.body.context || 'topic',
    reference: req.body.reference || req.query.topicId,
    topicId: req.query.topicId,
    author: req.user.id,
    alias: req.body.alias
  };

  api.comment.create(comment, function (err, commentDoc) {
    if (err) return _handleError(err, req, res);

    var keys = [
      'id alias text',
      'author.id author.fullName author.displayName author.avatar author.staff author.status',
      'upvotes downvotes flags',
      'createdAt replies context reference'
    ].join(' ');

    res.json(200, expose(keys)(commentDoc));
  });
});

app.post('/comment/:id/reply', restrict, function (req, res) {
  log('Request /comment/%s/reply %j', req.params.id, req.body);

  var reply = {
    text: req.body.text,
    author: req.user.id,
  };

  api.comment.reply(req.params.id, reply, function (err, replyDoc) {
    if (err) return _handleError(err, req, res);

    log('Serving reply %j', replyDoc);

    var keys = [
      'id alias createdAt text',
      'author.id author.fullName author.avatar author.staff author.status'
    ].join(' ');

    res.json(200, expose(keys)(replyDoc));
  });
});

app.get('/comment/:id/replies', function (req, res) {
  log('Request /comment/%s/replies', req.params.id);

  api.comment.replies(req.params.id, function(err, replies) {
    if (err) return _handleError(err, req, res);

    var keys = [
      'id alias createdAt editedAt text',
      'author.id author.fullName author.avatar author.staff author.status'
    ].join(' ');

    log('Serving replies for comment %s', req.params.id);
    res.json(replies.map(expose(keys)));
  });
});

app.post('/comment/:id/upvote', restrict, function(req, res) {
  log('Request /comment/%s/upvote', req.params.id);

  api.comment.upvote(req.params.id, req.user, function(err, comment) {
    if (err) {
      if (comment && comment.author.id === req.user.id) {
        return res.json(401, {error: err});
      }
    }

    log('Serving comment %s', comment.id);
    res.send(200);
  });
});

app.post('/comment/:id/downvote', restrict, function(req, res) {
  log('Request /comment/%s/upvote', req.params.id);

  api.comment.downvote(req.params.id, req.user, function(err, comment) {
    if (err) {
      if (comment && comment.author.id === req.user.id) {
        return res.json(401, {error: 'comments.score.not-allowed'});
      }
    }

    log('Serving comment %s', comment.id);
    res.send(200);
  });
});

app.post('/comment/:id/unvote', restrict, function(req, res) {
  log('Request /comment/%s/upvote', req.params.id);
  api.comment.unvote(req.params.id, req.user, function(err, comment) {
    if (err) {
      if (comment && comment.author.id === req.user.id) {
        return res.json(401, {error: err});
      }
    }
    log('Serving comment %s', comment.id);
    res.send(200);
  });
});

app.post('/comment/:id/flag', restrict, function(req, res) {
  log('Request /comment/%s/flag', req.params.id);

  api.comment.flag(req.params.id, req.user, function(err, comment) {
    if (err) return _handleError(err, req, res);

    log('Serving comment %s', comment.id);
    res.send(200);
  });
});

app.post('/comment/:id/unflag', restrict, function(req, res) {
  log('Request /comment/%s/unflag', req.params.id);

  api.comment.unflag(req.params.id, req.user, function(err, comment) {
    if (err) return _handleError(err, req, res);

    log('Serving comment %s', comment.id);
    res.send(200);
  });
});

app.put('/comment/:id', restrict, function (req, res) {
  log('Request PUT /comment/%s', req.params.id);

  api.comment.get(req.params.id, function (err, comment) {
    if (err) return _handleError(err, req, res);

    log('Found comment %s to be updated', comment.id);
    if (!comment.author.equals(req.user._id)) {
      err = t('comments.not-yours');
      return _handleError(err, req, res);
    } else {
      comment.text = req.body.text;
      comment.editedAt = Date.now();
      api.comment.edit(comment, function (err, comment) {
        if (err) return _handleError(err, req, res);

        log('Serving comment %s', comment.id);

        var keys = [
          'id alias text',
          'author.id author.fullName author.avatar',
          'upvotes downvotes flags',
          'createdAt editedAt replies context reference'
        ].join(' ');

        res.json(200, expose(keys)(comment));
      });
    }
  });
});

app.put('/comment/:commentId/reply/:replyId', restrict, function (req, res) {
  log('Request PUT /comment/%s/reply/%s', req.params.commentId, req.params.replyId);

  api.comment.get(req.params.commentId, function (err, comment) {
    if (err) return _handleError(err, req, res);

    var reply = comment.replies.id(req.params.replyId);
    log('Serving reply %j',reply);
    log('Found comment %s and reply %s', comment.id, reply.id);
    log('Found author %j and user %j', reply.author, req.user._id);

    if (!reply.author.equals(req.user._id)) {
      err = t('comments.not-yours');
      return _handleError(err, req, res);
    } else {
      //reply.alias = req.body.alias;
      reply.text = req.body.text;
      reply.editedAt = Date.now();
      api.comment.editReply(comment, reply, function (err, comment) {
        if (err) return _handleError(err, req, res);

        log('Serving reply %s', reply.id);
        res.json(200, { id: reply.id, text: reply.text, editedAt: reply.editedAt });
      });
    }
  });
});

app.delete('/comment/:commentId/reply/:replyId', restrict, function (req, res) {
  log('Request DELETE /comment/%s/reply/%s', req.params.commentId, req.params.replyId);

  api.comment.get(req.params.commentId, function (err, comment) {
    if (err) return _handleError(err, req, res);

    log('Found comment %s to remove reply %s', comment.id, req.params.replyId);
    var reply = comment.replies.id(req.params.replyId);
    log('User %s is attempting to remove reply %s', req.user.id, reply.id);
    if (reply.author !== req.user.id && !req.user.staff) {
      return _handleError(new Error('That reply is not yours!'), req, res);
    } else {
      comment.replies.id(reply.id).remove();
      comment.save(function (err) {
        if (err) return _handleError(err, req, res);
        res.json(200);
      });
    }
  });
});

app.delete('/comment/:id', restrict, function (req, res) {
  log('Request DELETE /comment/%s', req.params.id);

  api.comment.get(req.params.id, function (err, comment) {
    if (err) return _handleError(err, req, res);

    log('Found comment %s to be removed', comment.id);
    if (!comment.author.equals(req.user._id) && !req.user.staff) {
      err = t('comments.not-yours');
      return _handleError(err, req, res);
    } else if (comment.replies.length && !req.user.staff) {
      err = t('comments.cannot-remove');
      return _handleError(err, req, res);
    } else {
      api.comment.remove(comment, function (err) {
        if (err) return _handleError(err, req, res);

        res.json(200);
      });
    }
  });
});

/**
 * Helper functions
 */

function _handleError (err, req, res) {
  log('Error found: %s', err);

  if (err.errors && err.errors.text) err = err.errors.text;
  if (err.type) err = err.type;
  if (err.message) err = err.message;

  res.status(400).json({ error: err });
}

function requireTopicId (req, res, next) {
  if (req.query.topicId) return next();
  _handleError(new Error('Request didn\'t include `id` parameter'), req, res);
}
