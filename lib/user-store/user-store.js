import Store from '../store/store';

class UserStore extends Store {
  name () {
    return 'user';
  }
}

export default new UserStore;
