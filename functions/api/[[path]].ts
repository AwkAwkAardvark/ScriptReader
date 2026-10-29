import { handleApi, type Environment } from '../../server/api';
import { handleAdminApi } from '../../server/admin-api';
export const onRequest = (context: { request: Request; env: Environment }) =>
  new URL(context.request.url).pathname.startsWith('/api/admin/')
    ? handleAdminApi(context.request, context.env) : handleApi(context.request, context.env);
