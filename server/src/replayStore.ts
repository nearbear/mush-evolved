// Copies a finished game's history from the room's storage to R2 (#336; the format is shared/src/replayChunks.ts, the
// bucket setup docs/ops/r2.md). The replay is served only from R2 (#337), so the room is never woken to show one.
//
// Keys depend only on the game, so a retry writes the same objects again: idempotent with nothing read first and no
// progress to store. Each chunk is written as soon as the next one starts, while paging through the record, so the
// whole record is never in memory at once. The index goes last: a copy without one is incomplete.

import { ChunkBuilder, replayIndex, replayKeys, type ReplayChunk, type ReplayIndex, type RecordedInput, type ReplayMeta } from "@mush2/shared";

/** The part of R2 the copy uses. */
export type ReplayBucket = Pick<R2Bucket, "put">;

/** The part of Durable Object storage the copy reads. */
export interface RecordSource {
  list(options: { prefix: string; startAfter?: string; limit: number }): Promise<Map<string, unknown>>;
}

/** Record entries read per storage call. Each holds ~300 B, a cycle's full copy ~100-200 KB. */
const PAGE = 100;

/** Zero-padded record keys (GameRoom's `inputKey`): the sequence number after the prefix. */
const INPUT_PREFIX = "input:";

/** Gzipped with the built-in stream (no dependency), stored with `contentEncoding` so it can go to a browser as is. */
async function gzip(text: string): Promise<ArrayBuffer> {
  return new Response(new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
}

async function putChunk(bucket: ReplayBucket, roomId: string, n: number, chunk: ReplayChunk): Promise<void> {
  await bucket.put(replayKeys.chunk(roomId, n), await gzip(JSON.stringify(chunk.entries)), {
    httpMetadata: { contentType: "application/json", contentEncoding: "gzip" },
  });
}

/**
 * Writes every chunk, then the index, and returns the index. A resolved `put` counts as confirmed; any failure
 * throws, and the caller tries the whole copy again.
 */
export async function copyReplay(
  storage: RecordSource,
  bucket: ReplayBucket,
  meta: ReplayMeta,
): Promise<ReplayIndex> {
  const builder = new ChunkBuilder();
  const infos: ReplayChunk["info"][] = [];
  const flush = async (chunk: ReplayChunk | null) => {
    if (!chunk) return;
    await putChunk(bucket, meta.roomId, infos.length, chunk);
    infos.push(chunk.info);
  };
  let startAfter: string | undefined;
  for (;;) {
    const page = await storage.list({ prefix: INPUT_PREFIX, ...(startAfter !== undefined && { startAfter }), limit: PAGE });
    for (const [key, value] of page) {
      await flush(builder.add(Number(key.slice(INPUT_PREFIX.length)), value as RecordedInput));
      startAfter = key;
    }
    if (page.size < PAGE) break;
  }
  await flush(builder.finish());
  const index = replayIndex(meta, infos);
  await bucket.put(replayKeys.index(meta.roomId), JSON.stringify(index), { httpMetadata: { contentType: "application/json" } });
  return index;
}
