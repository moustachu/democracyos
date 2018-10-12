/**
 * Module dependencies.
 */

import List from 'democracyos-list.js';
import ListFuzzySearch from 'list.fuzzysearch.js';
import template from './template.jade';
import View from '../view/view.js';

/**
 * Creates a list view of users
 */

export default class UsersListView extends View {
  constructor(options = {}) {
    super(template, options);
    this.options = options;
  }

  switchOn() {

    this.list = new List('users-wrapper', {
      valueNames: ['avatar', 'fullName', 'email', 'staff', 'status'],
      item: 'user-item',
      plugins: [ ListFuzzySearch() ]
    }, this.options.users);

  }
}
