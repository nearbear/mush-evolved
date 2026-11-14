// Copies a finished game's history from the room's storage to R2 (#336; the format is shared/src/replayChunks.ts, the
// bucket setup docs/ops/r2.md). The replay is served only from R2 (#337), so the room is never woken to show one.
//
// Keys depend only on the game, so a retry writes the same objects again: idempotent with nothing read first and no
// progress to store. Each chunk is written as soon as the next one starts, while paging through the record, so the
// whole record is never in memory at once. Moderator-only data (`moderation.json`, #339, #157) goes before the index,
// and the index goes last: a copy without one is incomplete.

import {
  ChunkBuilder,
  HISTORY_VERSION,
  replayIndex,
  replayKeys,
  type BlockedText,
  type ReplayChunk,
  type ReplayIndex,
  type RecordedInput,
  type ReplayMeta,
  type ReplayModeration,
} from "@mush2/shared";

/** The part of R2 the copy uses. */
export type ReplayBucket = Pick<R2Bucket, "put">;

/** The part of R2 the integrity check before deleting room storage uses (#339). */
export type ReplayVerifyBucket = Pick<R2Bucket, "get" | "head">;

/** The part of Durable Object storage the copy reads. */
export interface RecordSource {
  list(options: { prefix: string; startAfter?: string; limit: number }): Promise<Map<string, unknown>>;
}

/** Record entries read per storage call. Each holds ~300 B, a cycle's full copy ~100-200 KB. */
const PAGE = 100;

/** Zero-padded record keys (GameRoom's `inputKey`): the sequence number after the prefix. */
const INPUT_PREFIX = "input:";
const BLOCKED_PREFIX = "blocked:";

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
 * Writes every chunk, then `moderation.json` (#339, #157), then the index, and returns the index. A resolved `put`
 * counts as confirmed; any failure throws, and the caller tries the whole copy again.
 */
export async function copyReplay(
  storage: RecordSource,
  bucket: ReplayBucket,
  meta: ReplayMeta,
): Promise<ReplayIndex> {
  const builder = new ChunkBuilder();
  const infos: ReplayChunk["info"][] = [];
  const raw: Record<number, string> = {};
  const rawByInput: Record<number, string> = {};
  const flush = async (chunk: ReplayChunk | null) => {
    if (!chunk) return;
    await putChunk(bucket, meta.roomId, infos.length, chunk);
    infos.push(chunk.info);
  };
  let startAfter: string | undefined;
  for (;;) {
    const page = await storage.list({ prefix: INPUT_PREFIX, ...(startAfter !== undefined && { startAfter }), limit: PAGE });
    for (const [key, value] of page) {
      const seq = Number(key.slice(INPUT_PREFIX.length));
      const recorded = value as RecordedInput;
      await flush(builder.add(seq, recorded));
      if (recorded.raw !== undefined) {
        if (recorded.chatId !== undefined) raw[recorded.chatId] = recorded.raw;
        else rawByInput[seq] = recorded.raw;
      }
      startAfter = key;
    }
    if (page.size < PAGE) break;
  }
  await flush(builder.finish());

  const blocked: BlockedText[] = [];
  let blockedAfter: string | undefined;
  for (;;) {
    const page = await storage.list({ prefix: BLOCKED_PREFIX, ...(blockedAfter !== undefined && { startAfter: blockedAfter }), limit: PAGE });
    for (const [key, value] of page) {
      blocked.push(value as BlockedText);
      blockedAfter = key;
    }
    if (page.size < PAGE) break;
  }
  const moderation: ReplayModeration = {
    v: HISTORY_VERSION,
    roomId: meta.roomId,
    raw,
    rawByInput,
    blocked,
    rateLimited: { ...meta.rateLimited },
  };
  await bucket.put(replayKeys.moderation(meta.roomId), JSON.stringify(moderation), {
    httpMetadata: { contentType: "application/json" },
  });

  const index = replayIndex(meta, infos);
  await bucket.put(replayKeys.index(meta.roomId), JSON.stringify(index), { httpMetadata: { contentType: "application/json" } });
  return index;
}

/**
 * Verifies R2 holds the full replay (`index.json`, every chunk it lists summing to `inputs`, and `moderation.json`)
 * before room storage is deleted (#339). Throws if anything is missing or mismatched.
 */
export async function verifyReplay(bucket: ReplayVerifyBucket, roomId: string, inputs: number): Promise<void> {
  const indexObj = await bucket.get(replayKeys.index(roomId));
  if (!indexObj) throw new Error(`Missing ${replayKeys.index(roomId)}`);
  const index = await indexObj.json<ReplayIndex>();
  if (index.roomId !== roomId) throw new Error(`Mismatched roomId in ${replayKeys.index(roomId)}`);
  const totalInputs = index.chunks.reduce((n, c) => n + c.inputs, 0);
  if (totalInputs !== inputs) throw new Error(`Replay chunk input count ${totalInputs} does not match ${inputs}`);
  for (let n = 0; n < index.chunks.length; n++) {
    if (!(await bucket.head(replayKeys.chunk(roomId, n)))) throw new Error(`Missing ${replayKeys.chunk(roomId, n)}`);
  }
  const modObj = await bucket.get(replayKeys.moderation(roomId));
  if (!modObj) throw new Error(`Missing ${replayKeys.moderation(roomId)}`);
  const mod = await modObj.json<ReplayModeration>();
  if (mod.roomId !== roomId) throw new Error(`Mismatched roomId in ${replayKeys.moderation(roomId)}`);
}
