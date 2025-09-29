class UserManager {
  constructor() {
    this.users = [];
    this.userCount = 0;
  }

  users: User[];
  userCount: number;

  addUser(user: User) {
    this.users.push(user);
    this.userCount++;
    return this.userCount;
  }

  getUser(id: number) {
    return this.users.find((user) => user.id === id);
  }

  updateUser(id: number, user: User) {
    const index = this.users.findIndex((user) => user.id === id);
    this.users[index] = user;
    return this.users[index];
  }

  deleteUser(id: number) {
    const index = this.users.findIndex((user) => user.id === id);
    this.users.splice(index, 1);
    this.userCount--;
    return this.userCount;
  }

  getUsers() {
    return this.users;
  }

  getUserCount() {
    return this.userCount;
  }

  clearUsers() {
    this.users = [];
    this.userCount = 0;
    return this.userCount;
  }
}

type User = {
  id: number;
  name?: string;
  firstname?: string;
  lastname?: string;
  age?: number;
  username?: string;
  email?: string;
  password?: string;
  phone?: string;
  address?: string;
};
