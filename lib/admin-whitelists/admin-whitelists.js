import page from 'page';
import whitelists from '../whitelists/whitelists';
import View from './view';

page('/admin/whitelists', whitelists.middleware, function (ctx) {
  var view = new View(whitelists.get());
  view.replace('.admin-content');
  ctx.sidebar.set('whitelists');
});
