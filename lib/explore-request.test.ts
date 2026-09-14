/* oxlint-disable typescript/no-floating-promises -- Registered with Node test. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseExploreRequest,
  readExploreRequest,
  MAX_REQUEST_BYTES,
} from './explore-request.ts';

function streamed(body: ReadableStream<Uint8Array>, signal?: AbortSignal) {
  return new Request('http://localhost/api/explore', {
    method: 'POST',
    body,
    signal,
    duplex: 'half',
  } as RequestInit);
}

test('stream reader preserves Chinese characters split across chunks', async () => {
  const data = new TextEncoder().encode('{"topic":"光合作用"}');
  let index = 0;
  const request = streamed(
    new ReadableStream({
      pull(c) {
        if (index < data.length) c.enqueue(data.slice(index, ++index));
        else c.close();
      },
    }),
  );
  assert.deepEqual(await readExploreRequest(request), { topic: '光合作用' });
});

test('oversized stream is cancelled without reading the rest', async () => {
  let cancelled = false;
  let pulls = 0;
  const request = streamed(
    new ReadableStream({
      pull(c) {
        pulls++;
        c.enqueue(new Uint8Array(MAX_REQUEST_BYTES + 1));
      },
      cancel() {
        cancelled = true;
      },
    }),
  );
  await assert.rejects(readExploreRequest(request), { status: 413 });
  assert.equal(cancelled, true);
  assert.ok(pulls <= 2);
});

test('cancelling a pending body read settles promptly and cancels source', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const request = streamed(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
    controller.signal,
  );
  const pending = readExploreRequest(request);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(cancelled, true);
});

test('truncated UTF-8 body reports client encoding error', async () => {
  const request = streamed(
    new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array([0xe5]));
        c.close();
      },
    }),
  );
  await assert.rejects(readExploreRequest(request), { status: 400 });
});
test('valid Chinese JSON remains intact', () =>
  assert.deepEqual(parseExploreRequest('{"topic":"光合作用"}'), {
    topic: '光合作用',
  }));
test('malformed request returns 400, not provider failure', () =>
  assert.throws(() => parseExploreRequest('{'), { status: 400 }));
test('oversize request rejected with 413', () =>
  assert.throws(() => parseExploreRequest(' '.repeat(64001)), { status: 413 }));
test('long valid task history is accepted within bounded size', () =>
  assert.ok(
    parseExploreRequest(JSON.stringify({ history: '文'.repeat(30000) })),
  ));
