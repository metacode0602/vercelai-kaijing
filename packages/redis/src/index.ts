import IORedis, {
  type ChainableCommander,
  type RedisOptions as IORedisOptions,
} from 'ioredis'
import { Redis as UpstashRedis } from '@upstash/redis'

/**
 * 统一 Redis 连接配置：
 * - 配置或环境变量含 UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN 时使用 Upstash Redis（Vercel 等云端）
 * - 否则回落本地 Redis（REDIS_HOST / REDIS_PORT / REDIS_PASSWORD / REDIS_DB），默认 localhost:6379
 */
export type RedisConnectionOptions = {
  url?: string
  token?: string
  /** 本地 Redis 连接 URL（redis:// 或 rediss://，支持 REDIS_URL 环境变量），优先级高于 host/port */
  redisUrl?: string
  host?: string
  port?: number
  password?: string
  db?: number
  maxRetriesPerRequest?: number
  lazyConnect?: boolean
  retryStrategy?: (times: number) => number | void | null
}

export interface RedisPipeline {
  incr(key: string): RedisPipeline
  expire(key: string, seconds: number): RedisPipeline
  ttl(key: string): RedisPipeline
  exec(): Promise<Array<[Error | null, unknown]>>
}

export interface RedisClient {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<unknown>
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>
  setex(key: string, seconds: number, value: string): Promise<unknown>
  del(...keys: string[]): Promise<number>
  expire(key: string, seconds: number): Promise<number>
  ttl(key: string): Promise<number>
  incr(key: string): Promise<number>
  keys(pattern: string): Promise<string[]>
  pipeline(): RedisPipeline
  quit(): Promise<unknown>
  connect(): Promise<unknown>
  readonly status: string
  on(event: 'error', listener: (err: Error) => void): unknown
}

class IORedisClient implements RedisClient {
  constructor(private readonly inner: IORedis) {}

  get status(): string {
    return this.inner.status
  }

  async get(key: string): Promise<string | null> {
    return this.inner.get(key)
  }

  async set(key: string, value: string, mode?: 'EX', ttl?: number): Promise<unknown> {
    if (mode === 'EX' && ttl !== undefined) {
      return this.inner.set(key, value, 'EX', ttl)
    }
    return this.inner.set(key, value)
  }

  async setex(key: string, seconds: number, value: string): Promise<unknown> {
    return this.inner.setex(key, seconds, value)
  }

  async del(...keys: string[]): Promise<number> {
    return this.inner.del(...keys)
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.inner.expire(key, seconds)
  }

  async ttl(key: string): Promise<number> {
    return this.inner.ttl(key)
  }

  async incr(key: string): Promise<number> {
    return this.inner.incr(key)
  }

  async keys(pattern: string): Promise<string[]> {
    return this.inner.keys(pattern)
  }

  pipeline(): RedisPipeline {
    return new IORedisPipeline(this.inner)
  }

  async quit(): Promise<unknown> {
    return this.inner.quit()
  }

  async connect(): Promise<unknown> {
    return this.inner.connect()
  }

  on(event: 'error', listener: (err: Error) => void): unknown {
    return this.inner.on(event, listener)
  }
}

class IORedisPipeline implements RedisPipeline {
  private readonly chain: ChainableCommander

  constructor(inner: IORedis) {
    this.chain = inner.pipeline()
  }

  incr(key: string): RedisPipeline {
    this.chain.incr(key)
    return this
  }

  expire(key: string, seconds: number): RedisPipeline {
    this.chain.expire(key, seconds)
    return this
  }

  ttl(key: string): RedisPipeline {
    this.chain.ttl(key)
    return this
  }

  async exec(): Promise<Array<[Error | null, unknown]>> {
    const results = await this.chain.exec()
    return results ?? []
  }
}

class UpstashRedisClient implements RedisClient {
  constructor(private readonly inner: UpstashRedis) {}

  get status(): string {
    return 'ready'
  }

  async get(key: string): Promise<string | null> {
    const value = await this.inner.get<string>(key)
    return value ?? null
  }

  async set(key: string, value: string, mode?: 'EX', ttl?: number): Promise<unknown> {
    if (mode === 'EX' && ttl !== undefined) {
      return this.inner.set<string>(key, value, { ex: ttl })
    }
    return this.inner.set<string>(key, value)
  }

  async setex(key: string, seconds: number, value: string): Promise<unknown> {
    return this.inner.setex<string>(key, seconds, value)
  }

  async del(...keys: string[]): Promise<number> {
    return toNumber(await this.inner.del(...keys))
  }

  async expire(key: string, seconds: number): Promise<number> {
    return toNumber(await this.inner.expire(key, seconds))
  }

  async ttl(key: string): Promise<number> {
    return toNumber(await this.inner.ttl(key))
  }

  async incr(key: string): Promise<number> {
    return toNumber(await this.inner.incr(key))
  }

  async keys(pattern: string): Promise<string[]> {
    return this.inner.keys(pattern)
  }

  pipeline(): RedisPipeline {
    return new UpstashPipeline(this.inner)
  }

  async quit(): Promise<void> {
    // REST 无连接生命周期，空实现
  }

  async connect(): Promise<void> {
    // REST 无连接生命周期，空实现
  }

  on(): unknown {
    return this
  }
}

class UpstashPipeline implements RedisPipeline {
  private readonly chain: ReturnType<UpstashRedis['pipeline']>

  constructor(private readonly inner: UpstashRedis) {
    this.chain = inner.pipeline()
  }

  incr(key: string): RedisPipeline {
    this.chain.incr(key)
    return this
  }

  expire(key: string, seconds: number): RedisPipeline {
    this.chain.expire(key, seconds)
    return this
  }

  ttl(key: string): RedisPipeline {
    this.chain.ttl(key)
    return this
  }

  async exec(): Promise<Array<[Error | null, unknown]>> {
    const results = (await this.chain.exec<unknown[]>()) as unknown[]
    return results.map((result) => [null, normalizeNumeric(result)] as [Error | null, unknown])
  }
}

function toNumber(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

function normalizeNumeric(value: unknown): unknown {
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return Number(value)
  }
  return value
}

/**
 * 创建统一 Redis 客户端：有 Upstash 配置走 Upstash，否则回落本地 ioredis。
 * 未显式传入的字段会回落到对应环境变量。
 */
export function createRedisClient(options: RedisConnectionOptions = {}): RedisClient {
  const url = options.url ?? process.env.UPSTASH_REDIS_REST_URL
  const token = options.token ?? process.env.UPSTASH_REDIS_REST_TOKEN
  if (url && token) {
    return new UpstashRedisClient(
      new UpstashRedis({ url, token, automaticDeserialization: false })
    )
  }
  const connOptions: IORedisOptions = {
    maxRetriesPerRequest: options.maxRetriesPerRequest ?? 3,
    lazyConnect: options.lazyConnect ?? true,
    retryStrategy: options.retryStrategy,
  }
  const redisUrl = options.redisUrl ?? process.env.REDIS_URL
  if (redisUrl) {
    return new IORedisClient(new IORedis(redisUrl, connOptions))
  }
  return new IORedisClient(
    new IORedis({
      host: options.host ?? process.env.REDIS_HOST ?? 'localhost',
      port: options.port ?? Number(process.env.REDIS_PORT ?? '6379'),
      password: options.password ?? process.env.REDIS_PASSWORD,
      db: options.db ?? Number(process.env.REDIS_DB ?? '0'),
      ...connOptions,
    })
  )
}

export {
  sendTencentSms,
  sendOtpSmsWithRateLimit,
  getSmsOtpValidityMinutes,
  SmsRateLimitError,
  type TencentSmsOptions,
  type TencentSmsSendResult,
  type SendOtpSmsInput,
  type SendOtpSmsResult,
} from './sms'