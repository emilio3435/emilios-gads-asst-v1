declare module 'connect-redis' {
  import { Store } from 'express-session';
  import { RedisClientType } from 'redis';

  export interface RedisStoreOptions {
    client?: RedisClientType;
    prefix?: string;
    ttl?: number;
    disableTouch?: boolean;
    disableTTL?: boolean;
    serializer?: {
      parse(string: string): any;
      stringify(object: any): string;
    };
  }

  export class RedisStore extends Store {
    constructor(options: RedisStoreOptions);
    client: RedisClientType;
    prefix: string;
    ttl: number;
    disableTouch: boolean;
    
    destroy(sid: string, callback?: (err?: any) => void): void;
    get(sid: string, callback: (err: any, session?: any) => void): void;
    set(sid: string, session: any, callback?: (err?: any) => void): void;
    touch(sid: string, session: any, callback?: (err?: any) => void): void;
    clear(callback?: (err?: any) => void): void;
  }

  const connectRedis: (session: { Store: typeof Store }) => {
    new(options: RedisStoreOptions): RedisStore;
  };
  
  export default connectRedis;
} 