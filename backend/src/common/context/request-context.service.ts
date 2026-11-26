import { Global, Injectable, Module } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { RoleCode } from '@prisma/client';

export interface RequestContextStore {
  requestId: string;
  actorId?: string;
  actorRoles?: RoleCode[];
  routePattern?: string;
}

@Injectable()
export class RequestContextService {
  private static readonly storage = new AsyncLocalStorage<RequestContextStore>();

  static run<T>(initialStore: RequestContextStore, callback: () => T): T {
    return RequestContextService.storage.run({ ...initialStore }, callback);
  }

  static getStore(): RequestContextStore | undefined {
    return RequestContextService.storage.getStore();
  }

  static getCurrentRequestId(): string | undefined {
    return RequestContextService.storage.getStore()?.requestId;
  }

  run<T>(initialStore: RequestContextStore, callback: () => T): T {
    return RequestContextService.run(initialStore, callback);
  }

  getStore(): RequestContextStore | undefined {
    return RequestContextService.getStore();
  }

  getRequestId(): string | undefined {
    return RequestContextService.getCurrentRequestId();
  }

  setActor(actorId: string, actorRoles: RoleCode[]): void {
    const store = RequestContextService.getStore();
    if (store) {
      store.actorId = actorId;
      store.actorRoles = [...actorRoles];
    }
  }

  setRoutePattern(routePattern: string): void {
    const store = RequestContextService.getStore();
    if (store) {
      store.routePattern = routePattern;
    }
  }
}

@Global()
@Module({
  providers: [RequestContextService],
  exports: [RequestContextService],
})
export class RequestContextModule {}
