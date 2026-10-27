// US-1.3 AC-5 (NFR-1): every route declares @Roles or @Public, and a role outside @Roles gets 403.
import { Controller, Get, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryModule, DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { ApiErrorSchema, ROLES, type Role } from '@srm/shared';
import { IS_PUBLIC_KEY, ROLES_KEY } from '../../src/common/auth/index.js';
import { api, type AuthTestApp, createAuthTestApp, type LoggedIn } from '../helpers/auth.js';

interface RouteInfo {
  name: string;
  method: RequestMethod;
  path: string;
  isPublic: boolean;
  roles: readonly Role[] | undefined;
}

const HTTP_METHODS: Partial<Record<RequestMethod, 'get' | 'post' | 'put' | 'patch' | 'delete'>> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.PATCH]: 'patch',
  [RequestMethod.DELETE]: 'delete',
};

function joinPath(...parts: unknown[]): string {
  const segments = parts
    .map((part) => (Array.isArray(part) ? (part[0] as unknown) : part))
    .filter((part): part is string => typeof part === 'string')
    .flatMap((part) => part.split('/'))
    .filter(Boolean);
  return segments.join('/');
}

/** Every HTTP handler of every controller in the app, with its auth metadata. */
function discoverRoutes(t: AuthTestApp): RouteInfo[] {
  const discovery = t.app.get(DiscoveryService);
  const scanner = t.app.get(MetadataScanner);
  const reflector = t.app.get(Reflector);
  const routes: RouteInfo[] = [];
  for (const wrapper of discovery.getControllers()) {
    const controller = wrapper.metatype as (new (...args: unknown[]) => unknown) | null;
    const instance = wrapper.instance as object | undefined;
    if (!controller || !instance) continue;
    const prototype = Object.getPrototypeOf(instance) as Record<string, unknown>;
    for (const methodName of scanner.getAllMethodNames(prototype)) {
      const handler = prototype[methodName] as (...args: unknown[]) => unknown;
      const methodPath: unknown = Reflect.getMetadata(PATH_METADATA, handler);
      if (methodPath === undefined) continue;
      const targets = [handler, controller];
      routes.push({
        name: `${controller.name}.${methodName}`,
        method: Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod,
        path: joinPath(Reflect.getMetadata(PATH_METADATA, controller), methodPath),
        isPublic: reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets) === true,
        roles: reflector.getAllAndOverride<readonly Role[] | undefined>(ROLES_KEY, targets),
      });
    }
  }
  return routes;
}

describe('NFR-1: route guards (US-1.3 AC-5)', () => {
  let t: AuthTestApp;

  beforeAll(async () => {
    t = await createAuthTestApp({ imports: [DiscoveryModule] });
  });

  afterAll(async () => {
    await t.close();
  });

  it('NFR-1: every route declares @Roles or @Public', () => {
    const routes = discoverRoutes(t);
    expect(routes.map((route) => route.name)).toEqual(
      expect.arrayContaining(['HealthController.check', 'AuthController.login', 'AdminUsersController.create']),
    );
    const undeclared = routes.filter((route) => !route.isPublic && !route.roles?.length);
    expect(undeclared.map((route) => route.name)).toEqual([]);
  });

  it('NFR-1: wrong role returns 403', async () => {
    const sessions = new Map<Role, LoggedIn>();
    const sessionFor = async (role: Role) => {
      const existing = sessions.get(role);
      if (existing) return existing;
      const created = await t.loginAs(role);
      sessions.set(role, created);
      return created;
    };

    const checked: string[] = [];
    for (const route of discoverRoutes(t)) {
      const outsider = ROLES.find((role) => !route.roles?.includes(role));
      const method = HTTP_METHODS[route.method];
      if (route.isPublic || !outsider || !method) continue;
      const { agent } = await sessionFor(outsider);
      // Guards run before pipes, so placeholder params and an empty body are fine.
      const res = await agent[method](api(route.path.replace(/:[^/]+/g, '1'))).send({});
      expect({ route: route.name, role: outsider, status: res.status }).toEqual({
        route: route.name,
        role: outsider,
        status: 403,
      });
      expect(ApiErrorSchema.parse(res.body).code).toBe('FORBIDDEN');
      checked.push(route.name);
    }
    expect(checked).toEqual(expect.arrayContaining(['AdminUsersController.create', 'AdminUsersController.list']));
  });
});

@Controller('test-undeclared')
class UndeclaredController {
  @Get()
  get(): string {
    return 'should never be reached';
  }
}

describe('NFR-1: deny by default at runtime', () => {
  let t: AuthTestApp;

  beforeAll(async () => {
    t = await createAuthTestApp({ controllers: [UndeclaredController] });
  });

  afterAll(async () => {
    await t.close();
  });

  it('denies a route without @Roles or @Public to every role', async () => {
    await t.http().get(api('test-undeclared')).expect(401);
    for (const role of ROLES) {
      const { agent } = await t.loginAs(role);
      const res = await agent.get(api('test-undeclared')).expect(403);
      expect(ApiErrorSchema.parse(res.body).code).toBe('FORBIDDEN');
    }
  });
});
