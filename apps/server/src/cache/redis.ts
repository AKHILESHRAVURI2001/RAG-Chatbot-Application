import Redis from 'ioredis';
import { env } from '../config/env';

/**
 * In-memory fallback cache when Redis is not configured or offline.
 * Enables zero-dependency fast caching on free hosting (Render, Vercel, etc.).
 */
class MemoryCache {
  private store = new Map<string, { value: string; expiresAt: number }>();
  private readonly MAX_ENTRIES = 2000;

  public get(key: string): string | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  public set(key: string, value: string, ttlSeconds: number): void {
    // Evict oldest entries if capacity reached
    if (this.store.size >= this.MAX_ENTRIES) {
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  public del(key: string): void {
    this.store.delete(key);
  }

  public flushAll(prefix: string): void {
    for (const key of Array.from(this.store.keys())) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }
}

const memoryFallback = new MemoryCache();
const NAMESPACE = 'minichatbot';

let redisInstance: Redis | null = null;
let isRedisAvailable = false;

if (env.REDIS_URL && env.REDIS_URL.trim().length > 0) {
  try {
    redisInstance = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: false,
      enableOfflineQueue: false,
      retryStrategy: () => 3000,
    });

    redisInstance.on('connect', () => {
      isRedisAvailable = true;
    });

    redisInstance.on('ready', () => {
      isRedisAvailable = true;
    });

    redisInstance.on('error', (err) => {
      isRedisAvailable = false;
      console.warn('[cache] Redis offline — continuing with in-memory cache:', err.message);
    });

    redisInstance.on('close', () => {
      isRedisAvailable = false;
    });
  } catch (err) {
    redisInstance = null;
    isRedisAvailable = false;
    console.warn('[cache] Redis init bypassed — using in-memory cache:', (err as Error).message);
  }
}

export const redis = redisInstance;

export const redisCache = {
  key(hash: string): string {
    return `${NAMESPACE}:qcache:${hash}`;
  },

  async get(hash: string): Promise<string | null> {
    const k = this.key(hash);
    if (redisInstance && isRedisAvailable) {
      try {
        const val = await redisInstance.get(k);
        if (val !== null) return val;
      } catch {
        /* fallback to memory */
      }
    }
    return memoryFallback.get(k);
  },

  async set(hash: string, value: string, ttlSeconds: number): Promise<void> {
    const k = this.key(hash);
    memoryFallback.set(k, value, ttlSeconds);
    if (redisInstance && isRedisAvailable) {
      try {
        await redisInstance.set(k, value, 'EX', ttlSeconds);
      } catch {
        /* memory cache already updated */
      }
    }
  },

  async del(hash: string): Promise<void> {
    const k = this.key(hash);
    memoryFallback.del(k);
    if (redisInstance && isRedisAvailable) {
      try {
        await redisInstance.del(k);
      } catch {
        /* ignore */
      }
    }
  },

  async flushAll(): Promise<void> {
    memoryFallback.flushAll(`${NAMESPACE}:qcache:`);
    if (redisInstance && isRedisAvailable) {
      try {
        const stream = redisInstance.scanStream({ match: `${NAMESPACE}:qcache:*` });
        const pipeline = redisInstance.pipeline();
        let queued = 0;
        for await (const keys of stream) {
          for (const key of keys as string[]) {
            pipeline.del(key);
            queued++;
          }
        }
        if (queued > 0) await pipeline.exec();
      } catch {
        /* ignore */
      }
    }
  },
};
