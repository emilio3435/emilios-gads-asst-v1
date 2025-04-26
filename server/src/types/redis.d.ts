declare module 'redis' {
  export interface RedisClientOptions {
    url?: string;
    socket?: {
      host?: string;
      port?: number;
      path?: string;
      tls?: boolean;
      connectTimeout?: number;
      reconnectStrategy?: (retries: number) => number | Error;
    };
    username?: string;
    password?: string;
    name?: string;
    database?: number;
    commandsQueueMaxLength?: number;
    readonly?: boolean;
    legacyMode?: boolean;
    disableOfflineQueue?: boolean;
    scripts?: Record<string, any>;
    pingInterval?: number;
    disableRetryOnFailure?: boolean;
  }

  export interface RedisModules {
    json?: any;
    ft?: any;
    bf?: any;
    ts?: any;
    graph?: any;
  }

  export interface RedisFunctions {
    [functionName: string]: any;
  }

  export interface RedisScripts {
    [scriptName: string]: any;
  }

  export interface RedisCommandArgument {
    toString(): string;
  }

  export type RedisCommandArguments = Array<RedisCommandArgument | Buffer | number | string | null>;

  export interface RedisClientType<M = RedisModules, F = RedisFunctions, S = RedisScripts> {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    quit(): Promise<void>;
    sendCommand(args: RedisCommandArguments): Promise<any>;
    executeIsolated<T>(fn: (isolatedClient: RedisClientType<M, F, S>) => Promise<T>): Promise<T>;
    
    // Event methods
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: string, listener: (...args: any[]) => void): this;
    off(event: string, listener: (...args: any[]) => void): this;
    removeListener(event: string, listener: (...args: any[]) => void): this;
    
    ping(): Promise<string>;
    get(key: string): Promise<string | null>;
    set(key: string, value: string | number, options?: {
      EX?: number;
      PX?: number;
      NX?: boolean;
      XX?: boolean;
      KEEPTTL?: boolean;
    }): Promise<'OK' | null>;
    del(key: string | string[]): Promise<number>;
    exists(key: string | string[]): Promise<number>;
    expire(key: string, seconds: number): Promise<number>;
    ttl(key: string): Promise<number>;
    incr(key: string): Promise<number>;
    incrBy(key: string, increment: number): Promise<number>;
    decr(key: string): Promise<number>;
    decrBy(key: string, decrement: number): Promise<number>;
    hGet(key: string, field: string): Promise<string | null>;
    hGetAll(key: string): Promise<Record<string, string>>;
    hSet(key: string, field: string, value: string | number): Promise<number>;
    hDel(key: string, field: string | string[]): Promise<number>;
    hExists(key: string, field: string): Promise<number>;
    lRange(key: string, start: number, stop: number): Promise<string[]>;
    lPush(key: string, elements: string | string[]): Promise<number>;
    rPush(key: string, elements: string | string[]): Promise<number>;
    lPop(key: string): Promise<string | null>;
    rPop(key: string): Promise<string | null>;
    sAdd(key: string, members: string | string[]): Promise<number>;
    sRem(key: string, members: string | string[]): Promise<number>;
    sMembers(key: string): Promise<string[]>;
    sIsMember(key: string, member: string): Promise<number>;
    keys(pattern: string): Promise<string[]>;
    flushAll(): Promise<'OK'>;
    time(): Promise<[string, string]>;
    select(index: number): Promise<'OK'>;
    configGet(parameter: string): Promise<Record<string, string>>;
    configSet(parameter: string, value: string | number): Promise<'OK'>;
  }

  export function createClient(options?: RedisClientOptions): RedisClientType;
} 