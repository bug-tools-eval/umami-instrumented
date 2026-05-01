import { z } from 'zod';
import * as send from '@/app/api/send/route';
import { parseRequest } from '@/lib/request';
import { json, serverError } from '@/lib/response';
import { anyObjectParam } from '@/lib/schema';

const schema = z.array(anyObjectParam);

export async function POST(request: Request) {
  try {
    const { body, error } = await parseRequest(request, schema, { skipAuth: true });

    if (error) {
      return error();
    }

    // Fan out the per-item sends in parallel rather than awaiting them one by
    // one. Each iteration builds an independent Request and calls send.POST,
    // so they don't need to be serialized.
    const settled = await Promise.all(
      body.map(async data => {
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

        return { ok: response.ok, responseJson };
      }),
    );

    const errors = [];
    let cache = null;

    settled.forEach(({ ok, responseJson }, index) => {
      if (!ok) {
        errors.push({ index, response: responseJson });
      } else {
        cache ??= responseJson.cache;
      }
    });

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
