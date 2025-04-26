declare module 'firebase-admin' {
  export interface ServiceAccount {
    projectId?: string;
    clientEmail?: string;
    privateKey?: string;
  }

  export interface AppOptions {
    credential?: Credential;
    databaseURL?: string;
    databaseAuthVariableOverride?: object;
    serviceAccountId?: string;
    storageBucket?: string;
    projectId?: string;
  }

  export interface Credential {
    getAccessToken(): Promise<{
      access_token: string;
      expires_in: number;
    }>;
  }

  export function initializeApp(options?: AppOptions, name?: string): App;
  export function app(name?: string): App;
  export function apps(): App[];

  export interface App {
    name: string;
    options: AppOptions;
    auth(): auth.Auth;
    database(url?: string): database.Database;
    firestore(): firestore.Firestore;
    messaging(): messaging.Messaging;
    storage(): storage.Storage;
    delete(): Promise<void>;
  }

  export function firestore(): firestore.Firestore;

  export namespace auth {
    interface Auth {
      createUser(properties: UserRecord): Promise<UserRecord>;
      deleteUser(uid: string): Promise<void>;
      getUser(uid: string): Promise<UserRecord>;
      getUserByEmail(email: string): Promise<UserRecord>;
      getUserByPhoneNumber(phoneNumber: string): Promise<UserRecord>;
      updateUser(uid: string, properties: UpdateRequest): Promise<UserRecord>;
      verifyIdToken(idToken: string, checkRevoked?: boolean): Promise<DecodedIdToken>;
      setCustomUserClaims(uid: string, customClaims: object): Promise<void>;
      revokeRefreshTokens(uid: string): Promise<void>;
      createCustomToken(uid: string, developerClaims?: object): Promise<string>;
    }

    interface UserRecord {
      uid: string;
      email?: string;
      emailVerified: boolean;
      displayName?: string;
      phoneNumber?: string;
      photoURL?: string;
      disabled: boolean;
      metadata: {
        creationTime: string;
        lastSignInTime: string;
      };
      providerData: UserInfo[];
      toJSON(): object;
    }

    interface UserInfo {
      uid: string;
      displayName?: string;
      email?: string;
      photoURL?: string;
      providerId: string;
      phoneNumber?: string;
    }

    interface UpdateRequest {
      displayName?: string;
      email?: string;
      emailVerified?: boolean;
      phoneNumber?: string;
      photoURL?: string;
      disabled?: boolean;
      password?: string;
    }

    interface DecodedIdToken {
      aud: string;
      auth_time: number;
      exp: number;
      firebase: {
        identities: {
          [key: string]: any;
        };
        sign_in_provider: string;
      };
      iat: number;
      iss: string;
      sub: string;
      uid: string;
      [key: string]: any;
    }
  }

  export namespace firestore {
    interface Firestore {
      collection(collectionPath: string): CollectionReference;
      doc(documentPath: string): DocumentReference;
      getAll(...documentRefsOrReadOptions: any[]): Promise<DocumentSnapshot[]>;
      runTransaction<T>(updateFunction: (transaction: Transaction) => Promise<T>): Promise<T>;
      batch(): WriteBatch;
      settings(settings: Settings): void;
    }

    interface Settings {
      timestampsInSnapshots?: boolean;
    }

    interface CollectionReference {
      id: string;
      parent: DocumentReference | null;
      path: string;
      doc(documentPath?: string): DocumentReference;
      add(data: object): Promise<DocumentReference>;
      get(): Promise<QuerySnapshot>;
      where(fieldPath: string, opStr: string, value: any): Query;
      orderBy(fieldPath: string, directionStr?: 'asc' | 'desc'): Query;
      limit(limit: number): Query;
      startAt(snapshot: DocumentSnapshot): Query;
      startAt(...fieldValues: any[]): Query;
      startAfter(snapshot: DocumentSnapshot): Query;
      startAfter(...fieldValues: any[]): Query;
      endBefore(snapshot: DocumentSnapshot): Query;
      endBefore(...fieldValues: any[]): Query;
      endAt(snapshot: DocumentSnapshot): Query;
      endAt(...fieldValues: any[]): Query;
      offset(offset: number): Query;
    }

    interface Query {
      get(): Promise<QuerySnapshot>;
      where(fieldPath: string, opStr: string, value: any): Query;
      orderBy(fieldPath: string, directionStr?: 'asc' | 'desc'): Query;
      limit(limit: number): Query;
      startAt(snapshot: DocumentSnapshot): Query;
      startAt(...fieldValues: any[]): Query;
      startAfter(snapshot: DocumentSnapshot): Query;
      startAfter(...fieldValues: any[]): Query;
      endBefore(snapshot: DocumentSnapshot): Query;
      endBefore(...fieldValues: any[]): Query;
      endAt(snapshot: DocumentSnapshot): Query;
      endAt(...fieldValues: any[]): Query;
      offset(offset: number): Query;
    }

    interface DocumentReference {
      id: string;
      parent: CollectionReference;
      path: string;
      collection(collectionPath: string): CollectionReference;
      get(): Promise<DocumentSnapshot>;
      set(data: object, options?: { merge?: boolean }): Promise<WriteResult>;
      update(data: object): Promise<WriteResult>;
      delete(): Promise<WriteResult>;
    }

    interface DocumentSnapshot {
      id: string;
      ref: DocumentReference;
      exists: boolean;
      data(): object | null;
      get(fieldPath: string): any;
    }

    interface QueryDocumentSnapshot extends DocumentSnapshot {
      data(): object;
    }

    interface QuerySnapshot {
      size: number;
      empty: boolean;
      docs: QueryDocumentSnapshot[];
      forEach(callback: (result: QueryDocumentSnapshot) => void): void;
    }

    interface Transaction {
      get(documentRef: DocumentReference): Promise<DocumentSnapshot>;
      set(documentRef: DocumentReference, data: object, options?: { merge?: boolean }): Transaction;
      update(documentRef: DocumentReference, data: object): Transaction;
      delete(documentRef: DocumentReference): Transaction;
    }

    interface WriteBatch {
      set(documentRef: DocumentReference, data: object, options?: { merge?: boolean }): WriteBatch;
      update(documentRef: DocumentReference, data: object): WriteBatch;
      delete(documentRef: DocumentReference): WriteBatch;
      commit(): Promise<WriteResult[]>;
    }

    interface WriteResult {
      writeTime: Timestamp;
    }

    interface Timestamp {
      seconds: number;
      nanoseconds: number;
      toDate(): Date;
      toMillis(): number;
    }

    namespace FieldValue {
      function serverTimestamp(): FieldValue;
      function deleteField(): FieldValue;
      function arrayUnion(...elements: any[]): FieldValue;
      function arrayRemove(...elements: any[]): FieldValue;
      function increment(n: number): FieldValue;
    }

    interface FieldValue {
      isEqual(other: FieldValue): boolean;
    }
  }

  export namespace messaging {
    interface Messaging {
      send(message: Message, dryRun?: boolean): Promise<string>;
      sendMulticast(message: MulticastMessage, dryRun?: boolean): Promise<BatchResponse>;
      sendToDevice(registrationToken: string | string[], payload: MessagingPayload, options?: MessagingOptions): Promise<MessagingDevicesResponse>;
      sendToTopic(topic: string, payload: MessagingPayload, options?: MessagingOptions): Promise<MessagingTopicResponse>;
      subscribeToTopic(registrationTokens: string | string[], topic: string): Promise<MessagingTopicManagementResponse>;
      unsubscribeFromTopic(registrationTokens: string | string[], topic: string): Promise<MessagingTopicManagementResponse>;
    }

    interface Message {
      data?: { [key: string]: string };
      notification?: Notification;
      android?: AndroidConfig;
      webpush?: WebpushConfig;
      apns?: ApnsConfig;
      token?: string;
      topic?: string;
      condition?: string;
    }

    interface MulticastMessage {
      tokens: string[];
      data?: { [key: string]: string };
      notification?: Notification;
      android?: AndroidConfig;
      webpush?: WebpushConfig;
      apns?: ApnsConfig;
    }

    interface Notification {
      title?: string;
      body?: string;
    }

    interface MessagingPayload {
      data?: { [key: string]: string };
      notification?: {
        title?: string;
        body?: string;
        [key: string]: any;
      };
    }

    interface MessagingOptions {
      dryRun?: boolean;
      priority?: string;
      timeToLive?: number;
      collapseKey?: string;
      mutableContent?: boolean;
      contentAvailable?: boolean;
      restrictedPackageName?: string;
    }

    interface AndroidConfig {
      collapseKey?: string;
      priority?: string;
      ttl?: string;
      restrictedPackageName?: string;
      data?: { [key: string]: string };
      notification?: AndroidNotification;
    }

    interface AndroidNotification {
      title?: string;
      body?: string;
      icon?: string;
      color?: string;
      sound?: string;
      tag?: string;
      clickAction?: string;
      bodyLocKey?: string;
      bodyLocArgs?: string[];
      titleLocKey?: string;
      titleLocArgs?: string[];
      channelId?: string;
    }

    interface WebpushConfig {
      headers?: { [key: string]: string };
      data?: { [key: string]: string };
      notification?: { [key: string]: any };
      fcmOptions?: WebpushFcmOptions;
    }

    interface WebpushFcmOptions {
      link?: string;
    }

    interface ApnsConfig {
      headers?: { [key: string]: string };
      payload?: { [key: string]: any };
      fcmOptions?: ApnsFcmOptions;
    }

    interface ApnsFcmOptions {
      imageUrl?: string;
    }

    interface BatchResponse {
      responses: SendResponse[];
      successCount: number;
      failureCount: number;
    }

    interface SendResponse {
      success: boolean;
      messageId?: string;
      error?: FirebaseError;
    }

    interface MessagingDevicesResponse {
      canonicalRegistrationTokenCount: number;
      failureCount: number;
      multicastId: number;
      results: MessagingDeviceResult[];
      successCount: number;
    }

    interface MessagingDeviceResult {
      error?: FirebaseError;
      messageId?: string;
      canonicalRegistrationToken?: string;
    }

    interface MessagingTopicResponse {
      messageId: number;
    }

    interface MessagingTopicManagementResponse {
      failureCount: number;
      successCount: number;
      errors: FirebaseArrayIndexError[];
    }

    interface FirebaseArrayIndexError {
      index: number;
      error: FirebaseError;
    }
  }

  export namespace storage {
    interface Storage {
      bucket(name?: string): Bucket;
    }

    interface Bucket {
      file(path: string): File;
      upload(localFilePath: string, options?: UploadOptions): Promise<UploadResponse>;
      getFiles(options?: GetFilesOptions): Promise<GetFilesResponse>;
      makePublic(): Promise<any>;
    }

    interface File {
      name: string;
      bucket: Bucket;
      download(options?: DownloadOptions): Promise<DownloadResponse>;
      getMetadata(): Promise<FileMetadata>;
      setMetadata(metadata: FileMetadata): Promise<any>;
      delete(): Promise<any>;
      move(destination: string | File): Promise<any>;
      copy(destination: string | File): Promise<any>;
      createReadStream(options?: CreateReadStreamOptions): NodeJS.ReadableStream;
      createWriteStream(options?: CreateWriteStreamOptions): NodeJS.WritableStream;
      makePublic(): Promise<any>;
      getSignedUrl(config: GetSignedUrlConfig): Promise<GetSignedUrlResponse>;
    }

    interface GetSignedUrlConfig {
      action: 'read' | 'write' | 'delete' | 'resumable';
      expires: string | number | Date;
      contentType?: string;
      responseDisposition?: string;
      responseType?: string;
    }

    type GetSignedUrlResponse = [string];

    type UploadResponse = [File, any];

    type GetFilesResponse = [File[], any];

    type DownloadResponse = [Buffer];

    interface UploadOptions {
      destination?: string;
      metadata?: FileMetadata;
      public?: boolean;
      predefinedAcl?: string;
      private?: boolean;
      gzip?: boolean;
      resumable?: boolean;
    }

    interface GetFilesOptions {
      prefix?: string;
      maxResults?: number;
      autoPaginate?: boolean;
    }

    interface FileMetadata {
      contentType?: string;
      metadata?: { [key: string]: any };
      cacheControl?: string;
    }

    interface DownloadOptions {
      destination?: string;
    }

    interface CreateReadStreamOptions {
      start?: number;
      end?: number;
    }

    interface CreateWriteStreamOptions {
      metadata?: FileMetadata;
      resumable?: boolean;
      contentType?: string;
      predefinedAcl?: string;
    }
  }

  export namespace database {
    interface Database {
      ref(path?: string): Reference;
      refFromURL(url: string): Reference;
      getRules(): Promise<string>;
      getRulesJSON(): Promise<object>;
      setRules(rules: string | object): Promise<void>;
      goOffline(): void;
      goOnline(): void;
    }

    interface Reference {
      key: string | null;
      parent: Reference | null;
      root: Reference;
      path: string;
      child(path: string): Reference;
      push(value?: any, onComplete?: (error: Error | null) => void): ThenableReference;
      remove(onComplete?: (error: Error | null) => void): Promise<void>;
      set(value: any, onComplete?: (error: Error | null) => void): Promise<void>;
      update(values: object, onComplete?: (error: Error | null) => void): Promise<void>;
      transaction(
        transactionUpdate: (currentData: any) => any,
        onComplete?: (error: Error | null, committed: boolean, snapshot: DataSnapshot | null) => void,
        applyLocally?: boolean
      ): Promise<{ committed: boolean; snapshot: DataSnapshot | null }>;
      once(
        eventType: 'value' | 'child_added' | 'child_changed' | 'child_removed' | 'child_moved',
        successCallback?: (snapshot: DataSnapshot, previousChildName?: string | null) => any,
        failureCallback?: (error: Error) => void
      ): Promise<DataSnapshot>;
      on(
        eventType: 'value' | 'child_added' | 'child_changed' | 'child_removed' | 'child_moved',
        callback: (snapshot: DataSnapshot, previousChildName?: string | null) => any,
        cancelCallback?: (error: Error) => void
      ): (snapshot: DataSnapshot, previousChildName?: string | null) => any;
      off(
        eventType?: 'value' | 'child_added' | 'child_changed' | 'child_removed' | 'child_moved',
        callback?: (snapshot: DataSnapshot, previousChildName?: string | null) => any
      ): void;
      orderByChild(path: string): Query;
      orderByKey(): Query;
      orderByValue(): Query;
    }

    interface ThenableReference extends Reference, Promise<Reference> {}

    interface Query {
      ref: Reference;
      endAt(value: number | string | boolean | null, key?: string): Query;
      equalTo(value: number | string | boolean | null, key?: string): Query;
      isEqual(other: Query): boolean;
      limitToFirst(limit: number): Query;
      limitToLast(limit: number): Query;
      off(
        eventType?: 'value' | 'child_added' | 'child_changed' | 'child_removed' | 'child_moved',
        callback?: (snapshot: DataSnapshot, previousChildName?: string | null) => any
      ): void;
      on(
        eventType: 'value' | 'child_added' | 'child_changed' | 'child_removed' | 'child_moved',
        callback: (snapshot: DataSnapshot, previousChildName?: string | null) => any,
        cancelCallback?: (error: Error) => void
      ): (snapshot: DataSnapshot, previousChildName?: string | null) => any;
      once(
        eventType: 'value' | 'child_added' | 'child_changed' | 'child_removed' | 'child_moved',
        successCallback?: (snapshot: DataSnapshot, previousChildName?: string | null) => any,
        failureCallback?: (error: Error) => void
      ): Promise<DataSnapshot>;
      orderByChild(path: string): Query;
      orderByKey(): Query;
      orderByValue(): Query;
      startAt(value: number | string | boolean | null, key?: string): Query;
      toJSON(): object;
      toString(): string;
    }

    interface DataSnapshot {
      key: string | null;
      ref: Reference;
      child(path: string): DataSnapshot;
      exists(): boolean;
      forEach(action: (snapshot: DataSnapshot) => boolean | void): boolean;
      getPriority(): string | number | null;
      hasChild(path: string): boolean;
      hasChildren(): boolean;
      numChildren(): number;
      toJSON(): object | null;
      val(): any;
    }
  }

  export interface FirebaseError {
    code: string;
    message: string;
    stack?: string;
    toJSON(): object;
  }

  export const credential: {
    cert(serviceAccountPathOrObject: string | ServiceAccount): Credential;
    refreshToken(refreshToken: string): Credential;
    applicationDefault(): Credential;
  };
} 