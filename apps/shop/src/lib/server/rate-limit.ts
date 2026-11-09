import { createRedisClient, type RedisClient } from '@workspace/redis'

let redis: RedisClient | null = null
const memory = new Map<string, { count: number; resetAt: number }>()

function getRedis() {
  if (!redis) {
    redis = createRedisClient({ maxRetriesPerRequest: 1 })
    redis.on('error', () => undefined)
  }
  return redis
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('redis timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function memoryAllow(key: string, limit: number, windowSeconds: number): boolean {
  const now = Date.now()
  const entry = memory.get(key)
  if (!entry || entry.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 })
    return true
  }
  entry.count += 1
  return entry.count <= limit
}

export async function allowRateLimited(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const client = getRedis()
    const count = await withTimeout(client.incr(`ratelimit:${key}`), 500)
    if (count === 1) {
      await withTimeout(client.expire(`ratelimit:${key}`, windowSeconds), 500)
    }
    return count <= limit
  } catch {
    return memoryAllow(key, limit, windowSeconds)
  }
}
