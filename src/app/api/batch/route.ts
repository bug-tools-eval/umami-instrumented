import { z } from 'zod';
import * as send from '@/app/api/send/route';
import { parseRequest } from '@/lib/request';
import { json, serverError } from '@/lib/response';
import { anyObjectParam } from '@/lib/schema';

const schema = z.array(anyObjectParam);
const BATCH_CONCURRENCY = 10;

export async function POST(request: Request) {
  try {
    const { body, error } = await parseRequest(request, schema, { skipAuth: true });

    if (error) {
      return error();
    }

    const results = [];

    for (let i = 0; i < body.length; i += BATCH_CONCURRENCY) {
      results.push(
        ...(await Promise.all(
          body.slice(i, i + BATCH_CONCURRENCY).map(async (data, offset) => {
            // Recreate a fresh Request since `new Request(request)` will have the following error:
            // > Cannot read private member #state from an object whose class did not declare it

            // Copy headers we received, ensure JSON content type, and avoid conflicting content-length
            const headers = new Headers(request.headers);
            headers.set('content-type', 'application/json');
            headers.delete('content-length');

            const newRequest = new Request(request.url, {
              method: 'POST',
              headers,
              body: JSON.stringify(data),
            });

            const response = await send.POST(newRequest);
            const responseJson = await response.json();

            return { index: i + offset, ok: response.ok, response: responseJson };
          }),
        )),
      );
    }

    const errors = results
      .filter(({ ok }) => !ok)
      .map(({ index, response }) => ({ index, response }));
    const cache = results.find(({ ok, response }) => ok && response.cache)?.response.cache ?? null;

    return json({
      size: body.length,
      processed: body.length - errors.length,
      errors: errors.length,
      details: errors,
      cache,
    });
  } catch (e) {
    return serverError(e);
  }
}
