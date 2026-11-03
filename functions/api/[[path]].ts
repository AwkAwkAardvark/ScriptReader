import { handleApi, type Environment } from '../../server/api';
import { handleAdminApi } from '../../server/admin-api';
export const onRequest = async (context: { request: Request; env: Environment }) => {
  const response = await (new URL(context.request.url).pathname.startsWith('/api/admin/')
    ? handleAdminApi(context.request, context.env) : handleApi(context.request, context.env));
  response.headers.set('X-Robots-Tag', 'noindex');
  return response;
};
