import { Injectable } from '@nestjs/common';

export interface User {
  id: number;
  username: string;
  password: string; // hashed or plaintext for MVP
}

@Injectable()
export class UsersService {
  private readonly users: User[] = [
    {
      id: 1,
      username: 'test@example.com',
      password: 'password', // DO NOT use plaintext in production
    },
  ];

  async findByUsername(username: string): Promise<User | undefined> {
    return this.users.find((u) => u.username === username);
  }

  async create(user: Omit<User, 'id'>): Promise<User> {
    const newUser: User = { id: this.users.length + 1, ...user } as User;
    this.users.push(newUser);
    return newUser;
  }
}