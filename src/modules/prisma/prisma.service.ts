import { Injectable } from '@nestjs/common';

interface UserDelegate {
  findMany(args?: Record<string, unknown>): Promise<unknown[]>;
  findUnique(args?: Record<string, unknown>): Promise<unknown>;
  create(args?: Record<string, unknown>): Promise<unknown>;
  update(args?: Record<string, unknown>): Promise<unknown>;
  delete(args?: Record<string, unknown>): Promise<unknown>;
}

@Injectable()
export class PrismaService {
  public user: UserDelegate = {
    findMany: () => Promise.resolve([]),
    findUnique: () => Promise.resolve(null),
    create: () => Promise.resolve({}),
    update: () => Promise.resolve({}),
    delete: () => Promise.resolve({}),
  };
}
