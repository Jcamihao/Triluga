import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';

@Injectable()
export class CacheQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheQueueService.name);
  private readonly ttlSeconds: number;
  private hasLoggedRedisError = false;
  private cacheClient: Redis | null = null;
  private queueClient: Redis | null = null;
  private notificationsQueue: Queue | null = null;
  private notificationsWorker: Worker | null = null;
  private queueConnection:
    | {
        host: string;
        port: number;
        password?: string;
        db?: number;
        maxRetriesPerRequest: null;
      }
    | null = null;
  private isAvailable = false;

  constructor(private readonly configService: ConfigService) {
    this.ttlSeconds = this.configService.get<number>('cache.ttlSeconds', 300);
  }

  async onModuleInit() {
    const redisUrl = this.configService.get<string | null>('cache.redisUrl');

    if (!redisUrl) {
      this.logger.log(
        'REDIS_URL não configurado. Cache e fila seguirão em modo degradado.',
      );
      return;
    }

    try {
      const parsedRedisUrl = new URL(redisUrl);
      this.queueConnection = {
        host: parsedRedisUrl.hostname,
        port: Number(parsedRedisUrl.port || 6379),
        password: parsedRedisUrl.password || undefined,
        db: parsedRedisUrl.pathname
          ? Number(parsedRedisUrl.pathname.replace('/', '') || 0)
          : 0,
        maxRetriesPerRequest: null,
      };

      this.cacheClient = new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
        retryStrategy: () => null,
        enableOfflineQueue: false,
      });
      this.queueClient = new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
        retryStrategy: () => null,
        enableOfflineQueue: false,
      });

      this.attachRedisErrorHandler(this.cacheClient, 'cache');
      this.attachRedisErrorHandler(this.queueClient, 'queue');

      await Promise.all([this.cacheClient.connect(), this.queueClient.connect()]);

      this.notificationsQueue = new Queue('notifications', {
        connection: this.queueConnection,
      });

      this.notificationsWorker = new Worker(
        'notifications',
        async (job: Job) => {
          this.logger.debug(
            `Processando job ${job.name} com payload ${JSON.stringify(job.data)}`,
          );
        },
        {
          connection: this.queueConnection,
        },
      );

      this.isAvailable = true;
    } catch (error) {
      this.logger.warn(
        'Redis não disponível. Cache e fila seguirão em modo degradado.',
      );
      await this.closeRedisClients();
    }
  }

  async onModuleDestroy() {
    await Promise.all([
      this.notificationsWorker?.close(),
      this.notificationsQueue?.close(),
      this.closeRedisClients(),
    ]);
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.isAvailable || !this.cacheClient) {
      return null;
    }

    const rawValue = await this.cacheClient.get(key);
    return rawValue ? (JSON.parse(rawValue) as T) : null;
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number) {
    if (!this.isAvailable || !this.cacheClient) {
      return;
    }

    await this.cacheClient.set(
      key,
      JSON.stringify(value),
      'EX',
      ttlSeconds ?? this.ttlSeconds,
    );
  }

  async del(key: string) {
    if (!this.isAvailable || !this.cacheClient) {
      return;
    }

    await this.cacheClient.del(key);
  }

  async invalidateByPrefix(prefix: string) {
    if (!this.isAvailable || !this.cacheClient) {
      return;
    }

    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.cacheClient.scan(
        cursor,
        'MATCH',
        `${prefix}*`,
        'COUNT',
        '100',
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        await this.cacheClient.del(...keys);
      }
    } while (cursor !== '0');
  }

  async enqueue(name: string, payload: Record<string, unknown>) {
    if (!this.isAvailable || !this.notificationsQueue) {
      return;
    }

    await this.notificationsQueue.add(name, payload);
  }

  private attachRedisErrorHandler(client: Redis, clientName: string) {
    client.on('error', (error) => {
      if (this.hasLoggedRedisError) {
        return;
      }

      this.hasLoggedRedisError = true;
      this.logger.warn(
        `Redis ${clientName} indisponível (${error.message}). Cache e fila seguirão em modo degradado.`,
      );
    });
  }

  private async closeRedisClients() {
    const cacheClient = this.cacheClient;
    const queueClient = this.queueClient;

    this.cacheClient = null;
    this.queueClient = null;

    await Promise.all([
      cacheClient?.disconnect(),
      queueClient?.disconnect(),
    ]);
  }
}
