import page from 'page';
import { findAllUsers, clearUserStore } from '../user-middlewares/user-middlewares.js';
import View from './view';

page('/admin/users', clearUserStore, findAllUsers, ctx => {
  var view = new View({
    users: ctx.users
  });
  view.replace('.admin-content');
  ctx.sidebar.set('users');
});
