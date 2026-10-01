---
chapter: 49
part: "Part III — Advanced (고급)"
title: "Microservices V: Writing a Custom Transporter"
level: advanced
reading_time: "50 min"
prerequisites: [45, 46]
source_docs:
  - "content/microservices/custom-transport.md"
source_url: "https://docs.nestjs.com/microservices/custom-transport"
nest_baseline: "11.x"
---

# Chapter 49 — Microservices V: Writing a Custom Transporter

> **한눈에 보기**
> 45–48장에서 쓴 트랜스포터들은 모두 같은 두 개의 부품으로 만들어져 있습니다:
> `Server`를 상속한 **전략(strategy)** 과 `ClientProxy`를 상속한 **클라이언트**입니다.
> 이 장에서는 그 두 부품을 직접 구현합니다. Nest가 지원하지 않는 브로커(Google Cloud Pub/Sub,
> Amazon Kinesis, 사내 프로토콜)를 붙이거나, 테스트용 인메모리 더블을 만들거나,
> 기존 트랜스포터에 QoS 같은 기능을 얹을 때 필요한 작업입니다. 동시에 이 장은
> "`@MessagePattern`이 도대체 무슨 일을 하는가"에 대한 가장 정확한 답이기도 합니다 —
> 핸들러 레지스트리, 패턴 직렬화, 상관관계 ID, 응답 패킷 규약을 전부 손으로 만들어 보기 때문입니다.

**What you will learn**

- The three legitimate reasons to write a transporter — and the one common reason that is a mistake, with the simpler alternative.
- What `CustomTransportStrategy` actually requires (`listen`, `close`, `on`, `unwrap`) and what the `Server` base class gives you for free.
- How the message-handler registry works: `this.messageHandlers`, `getHandlerByPattern()`, `normalizePattern()`, `addHandler()`, and exactly how an object pattern like `{ cmd: 'sum' }` becomes a `Map` key.
- How to tell an event handler from a message handler at runtime (`handler.isEventHandler`) and why the two must be dispatched differently.
- A complete, working Google Cloud Pub/Sub transporter — server and client — built line by line, including the response-packet contract that makes `send()` resolve.
- How to implement `ClientProxy.publish()` correctly: correlation IDs, the callback protocol, `isDisposed`, and the teardown function that RxJS calls on unsubscribe.
- `Serializer` and `Deserializer` interfaces, the `IncomingRequest` / `OutgoingResponse` shapes, and registering a custom client with `customClass`.
- Why guards, pipes, interceptors, and exception filters work in your transporter without you writing a line for them — and the one place you must cooperate.

**Why this matters**

Everything in Chapters 45 through 48 has been a black box with a consistent shape. You wrote `@MessagePattern({ cmd: 'sum' })`, something happened, and a Redis message arrived at your method. This chapter opens the box. By the end you will have written the thing that does the "something happened" part, and every transporter you have used will make sense retroactively.

The practical motivation is narrower but real. Nest ships transporters for TCP, Redis, NATS, MQTT, RabbitMQ, Kafka, and gRPC. It does not ship one for Google Cloud Pub/Sub, Amazon SQS or Kinesis, Azure Service Bus, NSQ, Solace, or the message bus your company built in 2014 and cannot replace. If you want `@MessagePattern`, DI, guards, pipes, interceptors, filters, and testability on top of those systems, you write a transporter. It is roughly 150 lines of real code plus the broker SDK, and once written it is the same code for every service in the fleet.

There is also a diagnostic motivation. When a Nest microservice misbehaves — a reply never arrives, an event handler fires twice, an interceptor's `tap` never runs — the fix requires knowing what layer owns the behaviour. Is `send()` hanging because the broker never delivered, because the responder threw before serializing, or because nobody set `isDisposed: true` on the reply packet? After this chapter you will know, because you will have implemented all three.

One caution before we start, and it is the source doc's own caution. Building a microservice with Nest does **not** require `@nestjs/microservices`. If you only need to publish to and consume from an external system, and you do not need declarative subscribers, a [standalone application](./42-standalone-and-cli-apps.md) with a provider wrapping the broker SDK is simpler, more flexible, and has no framework contract to satisfy. Write a transporter when you want the *declarative* layer — patterns, the request pipeline, and the ability to swap transports in tests. Write a plain provider otherwise.

---

## When to write a transporter (and when not to)

| Situation | Write a transporter? | Better alternative |
|---|---|---|
| Nest has no transporter for your broker, and you want `@MessagePattern` + guards/pipes | **Yes** | — |
| You need an in-memory transport for integration tests without a broker | **Yes** — a test double is the easiest transporter to write | — |
| You want to extend an existing transporter (MQTT QoS, RabbitMQ publisher confirms) | **Yes** — subclass `ServerRMQ` / `ServerMqtt` instead of `Server` | — |
| You just want to publish messages to SQS from a service | No | Inject an SDK client from a provider |
| You want to consume one queue and call one method | No | Standalone app + a consumer loop |
| You want different serialization on an existing transport | No | A custom `Serializer` / `Deserializer` (see below) |
| You want to add a header to every outgoing message | No | A custom `Serializer`, or `customClass` subclassing `ClientRMQ` |
| You want retry/backoff around `send()` | No | RxJS `retry({ delay })` at the call site |

The middle rows matter. Nest exposes three increasingly invasive extension points, and most needs are met by the least invasive one:

1. **Serializer / Deserializer** — change what goes on the wire, keep the transport.
2. **`customClass`** — subclass an existing `ClientProxy` implementation, override a method or two.
3. **Full `CustomTransportStrategy` + `ClientProxy`** — a new transport.

Reach for 3 only when 1 and 2 genuinely cannot do it.

---

## The anatomy of a transporter

A transporter is two independent halves that never import each other. They agree only on a wire format.

```mermaid
sequenceDiagram
    participant App as Caller (service A)
    participant CP as ClientProxy subclass
    participant Br as Broker / network
    participant Srv as CustomTransportStrategy (service B)
    participant H as Handler (@MessagePattern)

    App->>CP: send({cmd:'sum'}, [1,2])
    Note over CP: defer → connect() if not connected
    CP->>CP: assignPacketId() → id = "a1b2…"
    CP->>CP: serializer.serialize(packet)
    CP->>CP: routingMap.set(id, callback)
    CP->>Br: publish to "requests" topic
    Note over CP: returns teardown fn to RxJS

    Br->>Srv: message delivered
    Srv->>Srv: deserializer.deserialize(raw)
    Srv->>Srv: normalizePattern(pattern) → route
    Srv->>Srv: getHandlerByPattern(route)
    alt handler.isEventHandler
        Srv->>H: handleEvent(route, packet, ctx)
        Note over Srv: no reply, ever
    else message handler
        Srv->>H: handler(data, ctx) → Observable
        H-->>Srv: value(s)
        Srv->>Srv: this.send(stream$, respond)
        Srv->>Br: {id, response, isDisposed:true}
    end

    Br->>CP: reply delivered
    CP->>CP: deserializer.deserialize(raw)
    CP->>CP: routingMap.get(id) → callback
    CP->>App: observer.next(response); complete()
    CP->>CP: teardown → routingMap.delete(id)
```

Six responsibilities fall out of that diagram, and your implementation must cover all six:

1. **Connection lifecycle** — connect lazily, close on shutdown, on both sides.
2. **Pattern routing** — turn a pattern into a stable string, and look up the handler.
3. **Correlation** — match a reply to the request that caused it.
4. **The response protocol** — the `{ err, response, isDisposed }` packet shape.
5. **Event vs message dispatch** — events get no reply and are fire-and-forget.
6. **Teardown** — free the correlation entry when the caller unsubscribes.

---

## `CustomTransportStrategy` and the `Server` base class

The interface is small:

```typescript
export interface CustomTransportStrategy {
  /** Optional identifier so @MessagePattern(pattern, MY_TRANSPORT) can target this strategy. */
  transportId?: symbol;
  listen(callback: (err?: unknown, ...args: unknown[]) => void): any;
  close(): any;
  on<EventKey extends string, EventCallback extends Function>(
    event: EventKey,
    callback: EventCallback,
  ): any;
  unwrap<T = never>(): T;
}
```

Here is the skeleton the docs start from, with each method's contract spelled out:

```typescript title="src/transport/gcp-pubsub.server.ts"
import { CustomTransportStrategy, Server } from '@nestjs/microservices';

export class GoogleCloudPubSubServer
  extends Server
  implements CustomTransportStrategy
{
  /**
   * Called by Nest when you run app.listen(). Establish the broker
   * connection and register subscriptions here, then invoke callback().
   * Invoke callback(err) to fail startup loudly instead of silently.
   */
  listen(callback: (err?: unknown) => void) {
    callback();
  }

  /** Called on application shutdown. Unsubscribe and close the connection. */
  close() {}

  /**
   * Optional. Lets users of your transporter subscribe to lifecycle events
   * ('error', 'disconnect', …). Most custom implementations do not need it.
   */
  on(event: string, callback: Function) {
    throw new Error('Method not implemented.');
  }

  /**
   * Optional. Returns the underlying native client so users can reach
   * broker-specific APIs your strategy does not surface.
   */
  unwrap<T = never>(): T {
    throw new Error('Method not implemented.');
  }
}
```

`listen` and `close` are the only two you must implement. `on` and `unwrap` exist so that *consumers* of your transporter can escape it; leaving them throwing is a valid choice, and one your users will eventually complain about. Implementing `unwrap()` costs one line and saves your users from forking your package:

```typescript
unwrap<T = never>(): T {
  return this.pubSubClient as T;
}
```

The convention is a `Server` suffix on the class, because the strategy is the side that subscribes and responds.

> **Hint** — If you are extending rather than replacing a transport, subclass the concrete server instead: `class ServerRMQWithConfirms extends ServerRMQ { … }`. You inherit connection handling, reconnection, and pattern binding, and override only what differs.

### What `Server` gives you

`Server` is not an empty base class. It carries the machinery every transporter needs:

| Member | Kind | What it does |
|---|---|---|
| `messageHandlers` | `Map<string, MessageHandler>` | The registry. Keys are normalized patterns; values are bound handler functions. |
| `addHandler(pattern, cb, isEventHandler?, extras?)` | method | Called by Nest's `ListenersController` at bootstrap for every `@MessagePattern` / `@EventPattern`. You rarely call it yourself — except in tests. |
| `getHandlers()` | method | Returns the whole map. |
| `getHandlerByPattern(pattern)` | method | Look up one handler by normalized pattern; returns `null` when absent (and handles wildcard patterns for transporters that support them). |
| `normalizePattern(pattern)` | method | Turns any pattern value into the `Map` key. |
| `send(stream$, respond)` | method | Subscribes to a handler's result stream and calls `respond` with correctly-shaped write packets, including error and completion. |
| `handleEvent(pattern, packet, ctx)` | method | Dispatches an event: finds the handler, awaits it, connects an observable result, logs when no handler exists. |
| `transformToObservable(result)` | method | Normalizes a value / promise / observable into an observable. |
| `serializer` / `deserializer` | property | Populated by `initializeSerializer()` / `initializeDeserializer()`. |
| `logger` | property | A `Logger` scoped to your class name. |
| `getOptionsProp(options, key, default)` | method | Safe option read with a fallback. |
| `transportId` | property | Optional identity, see below. |
| `status` / `on()` / `unwrap()` | property/method | The v10.4+ observability surface. |

The two you will use constantly are `getHandlerByPattern` and `send`. Almost everything else is bookkeeping.

### `transportId` and targeted handlers

A handler can be scoped to one transport:

```typescript
export const GCP_PUBSUB_TRANSPORT = Symbol('GCP_PUBSUB');

// in the strategy
export class GoogleCloudPubSubServer extends Server implements CustomTransportStrategy {
  transportId = GCP_PUBSUB_TRANSPORT;
  // …
}

// in a controller
@MessagePattern('orders.created', GCP_PUBSUB_TRANSPORT)
handleOrderCreated(@Payload() data: OrderCreated) {}
```

In a [hybrid application](./57-advanced-http.md) with two microservice strategies attached, only the strategy whose `transportId` matches receives that handler. Without a `transportId`, every attached strategy gets every handler — which is usually what you want in a single-transport service and definitely not what you want in a hybrid one.

---

## The message-handler registry

This is the part that demystifies `@MessagePattern`. At bootstrap, Nest's `ListenersController` walks every controller, reads the pattern metadata off each decorated method, builds a **bound proxy function** for it (the one that runs guards, pipes, interceptors, and filters), and calls `server.addHandler(pattern, proxy, isEventHandler, extras)`.

Prove it to yourself. Given this handler somewhere in the app:

```typescript
@MessagePattern('echo')
echo(@Payload() data: object) {
  return data;
}
```

add a log line to `listen()`:

```typescript
listen(callback: () => void) {
  console.log(this.messageHandlers);
  callback();
}
```

You get:

```typescript
Map { 'echo' => [AsyncFunction] { isEventHandler: false } }
```

With `@EventPattern('echo')` instead, the output is identical except `isEventHandler: true`. That boolean is a property hung on the function object, and it is the *only* runtime signal distinguishing the two.

Fetch and call one:

```typescript
async listen(callback: () => void) {
  const echoHandler = this.messageHandlers.get('echo');
  console.log(await echoHandler('Hello world!'));
  callback();
}
```

```json
Hello world!
```

Your handler ran, through the full Nest pipeline, from four lines of code inside your transporter. That is the whole trick.

### How patterns become keys

`normalizePattern()` delegates to `transformPatternToRoute()`, and the algorithm matters because it defines pattern equality:

- A string or number becomes itself: `'echo'` → `'echo'`, `42` → `'42'`.
- An object is serialized to a JSON-like string with **keys sorted alphabetically**, recursively.

So `{ cmd: 'sum' }` becomes the key `{"cmd":"sum"}`, and — critically — `{ role: 'user', cmd: 'find' }` and `{ cmd: 'find', role: 'user' }` produce the *same* key. Key order in your decorator does not matter. Value types do: `{ id: 1 }` and `{ id: '1' }` are different patterns, because numbers are emitted bare and strings quoted.

Two rules follow for your implementation:

**Always normalize before looking up.** The pattern arriving on the wire is whatever the client serialized — usually the already-normalized string, but not necessarily. Run it through `this.normalizePattern()` (or accept the normalized string as the wire form, which is what the built-in transporters do) before touching the map.

**Never construct map keys by hand.** `this.messageHandlers.get('{"cmd":"sum"}')` works today and breaks the day someone changes the serialization. Use `this.getHandlerByPattern(this.normalizePattern(pattern))`.

### `getHandlerByPattern` and wildcards

```typescript
const handler = this.getHandlerByPattern(route);
if (!handler) {
  // A message with no handler. Reply with an error; do not throw into the broker callback.
  return this.sendError(route, packet.id, new Error(`No handler for pattern "${route}"`));
}
```

`getHandlerByPattern` does a direct map lookup first, and — for transporters that opt in — falls back to wildcard matching. If your broker has topic wildcards (`orders.*`, `orders.#`), the built-in `ServerMqtt` and `ServerNats` implementations are the reference for how Nest handles them: they keep the wildcard pattern as the map key and match incoming concrete topics against it.

### Dispatching: message vs event

The two paths are genuinely different and must not be merged.

```typescript
private async handleMessage(rawMessage: Buffer, ack: () => void) {
  const packet = this.deserializer.deserialize(JSON.parse(rawMessage.toString()));
  const route = this.normalizePattern(packet.pattern);
  const handler = this.getHandlerByPattern(route);

  if (!handler) {
    this.logger.error(`There is no matching message handler defined for "${route}".`);
    ack();
    return;
  }

  const ctx = new GcpPubSubContext([route, rawMessage, ack]);

  if (handler.isEventHandler) {
    // Events: no reply channel, no correlation id, errors go to the logger.
    await this.handleEvent(route, packet, ctx);
    ack();
    return;
  }

  // Messages: execute, then stream results back on the reply channel.
  const response$ = this.transformToObservable(await handler(packet.data, ctx));
  const publish = (data: WritePacket) => this.sendResponse(packet.id, data);
  response$ && this.send(response$, publish);
  ack();
}
```

Three details to note.

`handleEvent()` is inherited, and doing this yourself is a mistake people make. It logs a standard message when no handler exists, and — importantly — it **connects** an observable result so the stream actually executes. If you call the handler and discard the returned observable, an event handler that returns an observable never runs.

`this.send(response$, publish)` is inherited too, and it implements the response protocol correctly so you do not have to. It subscribes to the stream, calls `publish({ response })` for each emission, `publish({ err, isDisposed: true })` on error, and `publish({ isDisposed: true })` on completion, scheduling on the next tick so ordering is preserved. Every one of those packets carries the semantics the client's observer depends on.

`ack()` placement is a design decision your transporter must make explicitly, and it is the one thing the framework cannot decide for you. Acking before handling gives at-most-once; acking inside the completion callback of `send()` gives at-least-once. Chapters 46 and 47 covered the trade-off; here you are the one implementing it.

---

## Building a complete server strategy

Now the real thing. Google Cloud Pub/Sub, with request–response over a reply topic and events fire-and-forget.

```bash
$ npm i --save @google-cloud/pubsub
```

Start with the context class, so handlers can reach transport-specific data through `@Ctx()`:

```typescript title="src/transport/gcp-pubsub.context.ts"
import { BaseRpcContext } from '@nestjs/microservices/ctx-host/base-rpc.context';
import type { Message } from '@google-cloud/pubsub';

type GcpPubSubContextArgs = [string, Message];

export class GcpPubSubContext extends BaseRpcContext<GcpPubSubContextArgs> {
  constructor(args: GcpPubSubContextArgs) {
    super(args);
  }

  /** The normalized pattern this message matched. */
  getPattern(): string {
    return this.args[0];
  }

  /** The raw Pub/Sub message — attributes, publishTime, deliveryAttempt, ack/nack. */
  getMessage(): Message {
    return this.args[1];
  }
}
```

Extending `BaseRpcContext` is what makes `@Ctx()` work; the argument array is stored and exposed however you choose. Now the strategy:

```typescript title="src/transport/gcp-pubsub.server.ts"
import {
  CustomTransportStrategy,
  IncomingRequest,
  ReadPacket,
  Server,
  WritePacket,
} from '@nestjs/microservices';
import { Message, PubSub, Subscription, Topic } from '@google-cloud/pubsub';
import { GcpPubSubContext } from './gcp-pubsub.context';

export const GCP_PUBSUB_TRANSPORT = Symbol('GCP_PUBSUB_TRANSPORT');

export interface GcpPubSubServerOptions {
  projectId: string;
  /** Subscription this service consumes requests and events from. */
  subscription: string;
  /** Topic replies are published to. Clients subscribe to it. */
  replyTopic: string;
  /** Ack after a successful handler run (at-least-once) instead of on receipt. */
  ackAfterHandle?: boolean;
  serializer?: import('@nestjs/microservices').Serializer;
  deserializer?: import('@nestjs/microservices').Deserializer;
}

export class GcpPubSubServer extends Server implements CustomTransportStrategy {
  transportId = GCP_PUBSUB_TRANSPORT;

  private client!: PubSub;
  private subscription!: Subscription;
  private replyTopic!: Topic;

  constructor(private readonly options: GcpPubSubServerOptions) {
    super();
    // Populate this.serializer / this.deserializer with the user's choices
    // or the framework defaults. Do this in the constructor, always.
    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  async listen(callback: (err?: unknown) => void) {
    try {
      this.client = new PubSub({ projectId: this.options.projectId });
      this.subscription = this.client.subscription(this.options.subscription);
      this.replyTopic = this.client.topic(this.options.replyTopic);

      this.subscription.on('message', (message: Message) => {
        this.handleMessage(message).catch((err) => this.logger.error(err));
      });
      this.subscription.on('error', (err) => {
        this.logger.error(err);
        this._status$.next('disconnected' as never);
      });

      this.logger.log(
        `Listening on subscription "${this.options.subscription}" ` +
          `(${this.messageHandlers.size} handlers registered)`,
      );
      callback();
    } catch (err) {
      // Reporting the error makes bootstrap fail loudly instead of hanging.
      callback(err);
    }
  }

  async close() {
    await this.subscription?.close();
    await this.client?.close();
  }

  on<K extends string, C extends Function>(event: K, callback: C) {
    this.subscription?.on(event, callback as never);
  }

  unwrap<T = never>(): T {
    return this.client as T;
  }

  private async handleMessage(message: Message): Promise<void> {
    const ackOnReceipt = !this.options.ackAfterHandle;
    if (ackOnReceipt) message.ack();

    let packet: ReadPacket & Partial<IncomingRequest>;
    try {
      packet = this.deserializer.deserialize(JSON.parse(message.data.toString()));
    } catch (err) {
      this.logger.error(`Undeserializable message dropped: ${err}`);
      message.ack(); // poison message — never retry a parse failure
      return;
    }

    const route = this.normalizePattern(packet.pattern);
    const handler = this.getHandlerByPattern(route);
    const ctx = new GcpPubSubContext([route, message]);

    if (!handler) {
      this.logger.error(`There is no matching message handler defined for "${route}".`);
      if (!ackOnReceipt) message.ack();
      return;
    }

    // ---- Event path: no reply, ever. ----
    if (handler.isEventHandler) {
      try {
        await this.handleEvent(route, packet, ctx);
        if (!ackOnReceipt) message.ack();
      } catch (err) {
        this.logger.error(err);
        if (!ackOnReceipt) message.nack(); // redeliver
      }
      return;
    }

    // ---- Message path: correlate, execute, reply. ----
    const correlationId = packet.id;
    if (!correlationId) {
      this.logger.error(`Request for "${route}" arrived without a correlation id.`);
      if (!ackOnReceipt) message.ack();
      return;
    }

    const publish = (data: WritePacket) => {
      this.publishReply(correlationId, data);
      if (!ackOnReceipt && data.isDisposed) message.ack();
    };

    try {
      const result = await handler(packet.data, ctx);
      const stream$ = this.transformToObservable(result);
      this.send(stream$, publish);
    } catch (err) {
      // A synchronous throw from the pipeline (e.g. a guard) lands here.
      publish({ err, isDisposed: true });
    }
  }

  private publishReply(id: string, data: WritePacket): void {
    const outgoing = this.serializer.serialize({ id, ...data });
    this.replyTopic
      .publishMessage({
        data: Buffer.from(JSON.stringify(outgoing)),
        attributes: { correlationId: id },
      })
      .catch((err) => this.logger.error(`Failed to publish reply for ${id}: ${err}`));
  }
}
```

Walk the non-obvious decisions.

**`initializeSerializer` / `initializeDeserializer` in the constructor.** If you skip these, `this.serializer` is `undefined` and your first message throws a `TypeError` deep inside your own code. They install an identity serializer and an `IncomingRequestDeserializer` unless the user supplied their own.

**`callback(err)` on failure.** `listen()`'s callback takes an optional error. Passing it makes `NestFactory.createMicroservice(...).listen()` reject, so a bad broker config kills the process at boot instead of producing a service that is up and deaf.

**Parse failures are acked, not nacked.** A message that cannot be JSON-parsed will never parse. Nacking it creates an infinite redelivery loop — the poison-message failure from [Chapter 47](./47-kafka.md), in a new costume.

**`data.isDisposed` gates the ack.** `Server#send` emits one or more `{ response }` packets and exactly one packet with `isDisposed: true`. That flag is your "the handler is finished" signal, and it is the only correct place to ack in at-least-once mode.

**Errors reach the client as `{ err, isDisposed: true }`.** They are not thrown into your broker callback and they do not crash the process. This is also where a global exception filter's output lands, because the filter runs inside the bound handler proxy — before your code sees anything.

### Interceptors return observables, and observables must be subscribed

The source docs flag this and it deserves emphasis. When interceptors are in play, the handler's return value is an RxJS stream, and a stream that nobody subscribes to does nothing at all — including not running the controller method.

```typescript
async listen(callback: () => void) {
  const echoHandler = this.messageHandlers.get('echo');
  const streamOrResult = await echoHandler('Hello World');
  if (isObservable(streamOrResult)) {
    streamOrResult.subscribe();
  }
  callback();
}
```

In the real strategy above this is handled for you: `transformToObservable()` normalizes the value and `this.send()` subscribes. The failure only bites when you call a handler manually — which you do in tests and in ad-hoc probes. Symptom: your controller's log line never prints, and no error appears anywhere.

### Wiring it up

```typescript title="src/main.ts"
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { AppModule } from './app.module';
import { GcpPubSubServer } from './transport/gcp-pubsub.server';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    strategy: new GcpPubSubServer({
      projectId: process.env.GCP_PROJECT_ID!,
      subscription: 'orders-service-requests',
      replyTopic: 'orders-service-replies',
      ackAfterHandle: true,
    }),
  });
  app.enableShutdownHooks();
  await app.listen();
}
bootstrap();
```

Instead of `{ transport, options }`, you pass a single `strategy` property holding an **instance**. Nest calls `addHandler()` on it for every discovered pattern, then `listen()`. On shutdown it calls `close()` — provided you enabled shutdown hooks ([Chapter 39](./39-lifecycle-and-shutdown.md)).

The same instance works in a hybrid app:

```typescript
const app = await NestFactory.create(AppModule);
app.connectMicroservice<MicroserviceOptions>({ strategy: new GcpPubSubServer({ /* … */ }) });
await app.startAllMicroservices();
await app.listen(3000);
```

---

## The client side: extending `ClientProxy`

`ClientProxy` declares five abstract members. Everything user-facing — `send()`, `emit()`, the observable wrapping, the connect-on-first-use behaviour — is implemented in the base class in terms of them.

```typescript
import { ClientProxy, ReadPacket, WritePacket } from '@nestjs/microservices';

class GoogleCloudPubSubClient extends ClientProxy {
  async connect(): Promise<any> {}
  async close() {}
  async dispatchEvent(packet: ReadPacket<any>): Promise<any> {}
  publish(
    packet: ReadPacket<any>,
    callback: (packet: WritePacket<any>) => void,
  ): Function {}
  unwrap<T = never>(): T {
    throw new Error('Method not implemented.');
  }
}
```

If you do not need request–response, leave `publish()` empty. If you do not need events, leave `dispatchEvent()` empty. Both are legitimate.

### Observing the contract before implementing it

The fastest way to internalise the protocol is the docs' instrumented stub. Build it, run it, watch the order of operations:

```typescript
class GoogleCloudPubSubClient extends ClientProxy {
  async connect(): Promise<any> {
    console.log('connect');
  }

  async close() {
    console.log('close');
  }

  async dispatchEvent(packet: ReadPacket<any>): Promise<any> {
    return console.log('event to dispatch: ', packet);
  }

  publish(
    packet: ReadPacket<any>,
    callback: (packet: WritePacket<any>) => void,
  ): Function {
    console.log('message:', packet);

    // In a real-world application, the "callback" function should be executed
    // with the payload sent back from the responder. Here we simulate a
    // 5-second round trip by echoing the data we were given.
    //
    // The "isDisposed" bool on the WritePacket tells the response that no
    // further data is expected. If not sent or false, this simply emits data
    // to the Observable without completing it.
    setTimeout(
      () => callback({ response: packet.data, isDisposed: true }),
      5000,
    );

    return () => console.log('teardown');
  }

  unwrap<T = never>(): T {
    throw new Error('Method not implemented.');
  }
}
```

```typescript
const googlePubSubClient = new GoogleCloudPubSubClient();
googlePubSubClient
  .send('pattern', 'Hello world!')
  .subscribe((response) => console.log(response));
```

```typescript
connect
message: { pattern: 'pattern', data: 'Hello world!' }
Hello world!   // <-- after 5 seconds
```

Three things are proven by that output. `connect()` ran automatically, on subscribe, not on construction — `send()` is `defer(() => this.connect()).pipe(mergeMap(…))`, so an unsubscribed observable connects to nothing. `publish()` received a bare `{ pattern, data }` with no id — assigning the correlation id is *your* job. And the observable completed after one value, because `isDisposed: true` was set.

Now the teardown half. Apply a timeout shorter than the simulated latency:

```typescript
import { timeout } from 'rxjs/operators';

const googlePubSubClient = new GoogleCloudPubSubClient();
googlePubSubClient
  .send('pattern', 'Hello world!')
  .pipe(timeout(2000))
  .subscribe(
    (response) => console.log(response),
    (error) => console.error(error.message),
  );
```

```typescript
connect
message: { pattern: 'pattern', data: 'Hello world!' }
teardown            // <-- the function publish() returned
Timeout has occurred
```

The function you return from `publish()` is RxJS's unsubscribe hook. It runs when the caller unsubscribes, times out, or errors. **If you do not free your correlation entry there, you have written a memory leak**: every timed-out request leaves a callback in the map forever, and in a service doing 500 rps with a 1% timeout rate that is five entries per second, permanently.

And events:

```typescript
googlePubSubClient.emit('event', 'Hello world!');
```

```typescript
connect
event to dispatch:  { pattern: 'event', data: 'Hello world!' }
```

No id, no callback, no reply. `emit()` returns a hot connectable observable that has already been connected, so the dispatch happens whether or not you subscribe.

### The write-packet protocol

`ClientProxy#createObserver` turns your callback invocations into observer notifications. This is the exact mapping, and getting it wrong is the cause of nearly every "my `send()` never resolves" bug:

| You call `callback(...)` with | The subscriber sees |
|---|---|
| `{ err }` | `error(err)` — terminal |
| `{ response, isDisposed: true }` | `next(response)` then `complete()` |
| `{ isDisposed: true }` (no response) | `complete()` with no value |
| `{ response }` | `next(response)`, stream stays open |

The last row is how streaming responses work: a responder that returns an observable emits several `{ response }` packets and one final `{ isDisposed: true }`. `firstValueFrom()` on the caller resolves at the first value; `lastValueFrom()` waits for the disposal packet.

The classic bug is omitting `isDisposed` on a single-value reply. The caller receives the value and then hangs forever, because from RxJS's point of view more values may still arrive.

### A real client implementation

```typescript title="src/transport/gcp-pubsub.client.ts"
import { ClientProxy, ReadPacket, WritePacket } from '@nestjs/microservices';
import { Message, PubSub, Subscription, Topic } from '@google-cloud/pubsub';

export interface GcpPubSubClientOptions {
  projectId: string;
  /** Topic the responder consumes from. */
  requestTopic: string;
  /** Subscription on the responder's reply topic, unique per client instance. */
  replySubscription: string;
  serializer?: import('@nestjs/microservices').Serializer;
  deserializer?: import('@nestjs/microservices').Deserializer;
}

export class GcpPubSubClient extends ClientProxy {
  private client?: PubSub;
  private requestTopic?: Topic;
  private replySubscription?: Subscription;

  constructor(private readonly options: GcpPubSubClientOptions) {
    super();
    this.initializeSerializer(options);
    this.initializeDeserializer(options);
  }

  async connect(): Promise<PubSub> {
    if (this.client) return this.client;

    this.client = new PubSub({ projectId: this.options.projectId });
    this.requestTopic = this.client.topic(this.options.requestTopic);
    this.replySubscription = this.client.subscription(this.options.replySubscription);

    this.replySubscription.on('message', (message: Message) => {
      message.ack();
      this.handleReply(message);
    });

    return this.client;
  }

  async close() {
    await this.replySubscription?.close();
    await this.client?.close();
    this.client = undefined;
    this.routingMap.clear();
  }

  unwrap<T = never>(): T {
    if (!this.client) throw new Error('Client is not connected.');
    return this.client as T;
  }

  /** Request–response. Must return a teardown function. */
  publish(partialPacket: ReadPacket, callback: (packet: WritePacket) => void): () => void {
    try {
      const packet = this.assignPacketId(partialPacket);   // adds a random `id`
      const serialized = this.serializer.serialize(packet);

      this.routingMap.set(packet.id, callback);

      this.requestTopic!
        .publishMessage({ data: Buffer.from(JSON.stringify(serialized)) })
        .catch((err) => {
          this.routingMap.delete(packet.id);
          callback({ err });
        });

      // RxJS calls this on unsubscribe / timeout / error. Free the entry.
      return () => this.routingMap.delete(packet.id);
    } catch (err) {
      callback({ err });
      return () => undefined;
    }
  }

  /** Fire-and-forget. No id, no callback, no reply subscription. */
  protected async dispatchEvent(packet: ReadPacket): Promise<void> {
    const serialized = this.serializer.serialize(packet);
    await this.requestTopic!.publishMessage({
      data: Buffer.from(JSON.stringify(serialized)),
    });
  }

  private handleReply(message: Message): void {
    let packet: WritePacket & { id: string };
    try {
      packet = this.deserializer.deserialize(JSON.parse(message.data.toString()));
    } catch (err) {
      return; // an unparseable reply cannot be correlated to anything
    }

    const callback = this.routingMap.get(packet.id);
    if (!callback) {
      // Late reply: the caller already timed out and tore down. Dropping is correct.
      return;
    }

    if (packet.isDisposed) {
      this.routingMap.delete(packet.id);
    }
    callback({
      err: packet.err,
      response: packet.response,
      isDisposed: packet.isDisposed,
    });
  }
}
```

Four points worth pausing on.

**`assignPacketId()` is inherited.** It attaches a random string `id` to the packet, giving you the `OutgoingRequest` shape (`{ pattern, data, id }`). Do not invent your own scheme; you gain nothing and lose interoperability with Nest's default deserializers.

**`routingMap` is inherited too** — a `Map<string, Function>` on `ClientProxy` for exactly this purpose.

**Deleting on `isDisposed` and in the teardown are both required.** The first frees entries for successful calls; the second frees them for abandoned ones. Skip either and you leak.

**Timeouts belong at the call site, not in the transporter.** RxJS `timeout(ms)` composes, is per-call configurable, and triggers your teardown automatically:

```typescript
this.client.send({ cmd: 'sum' }, [1, 2, 3]).pipe(
  timeout(3000),
  retry({ count: 2, delay: 200 }),
);
```

Building a fixed timeout into `publish()` makes it un-overridable and duplicates machinery RxJS already provides. The exception is a *maximum* timeout — a safety net so a broker that never replies cannot leak entries indefinitely. If you add one, make it long and configurable.

### Registering the client

Nest can construct your client for you through `customClass`:

```typescript title="src/app.module.ts"
import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { GcpPubSubClient } from './transport/gcp-pubsub.client';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'ORDERS_CLIENT',
        customClass: GcpPubSubClient,
        options: {
          projectId: process.env.GCP_PROJECT_ID,
          requestTopic: 'orders-service-requests',
          replySubscription: `orders-replies-${process.pid}`,
        },
      },
    ]),
  ],
})
export class AppModule {}
```

> **Hint** — This is the class itself being passed to `customClass`, not an instance. Nest creates the instance and passes whatever is in `options` to the constructor.

`registerAsync()` works the same way when the options come from `ConfigService`:

```typescript
ClientsModule.registerAsync([
  {
    name: 'ORDERS_CLIENT',
    customClass: GcpPubSubClient,
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({
      options: {
        projectId: config.getOrThrow('GCP_PROJECT_ID'),
        requestTopic: config.getOrThrow('ORDERS_REQUEST_TOPIC'),
        replySubscription: config.getOrThrow('ORDERS_REPLY_SUBSCRIPTION'),
      },
    }),
  },
]);
```

Inject it as `ClientProxy` and the calling code cannot tell the difference from a Redis or NATS client — which is the point of the whole exercise.

---

## Serializers and deserializers

Before writing a transporter, check whether a serializer solves your problem. It is the cheapest extension point in the package.

```typescript
export interface Serializer<TInput = any, TOutput = any> {
  serialize(value: TInput, options?: Record<string, any>): TOutput;
}

export interface Deserializer<TInput = any, TOutput = any> {
  deserialize(value: TInput, options?: Record<string, any>): TOutput;
}
```

The shapes flowing through them:

| Type | Shape | Where |
|---|---|---|
| `ReadPacket<T>` | `{ pattern: any; data: T }` | What `send()`/`emit()` hand to your client |
| `PacketId` | `{ id: string }` | Merged in by `assignPacketId()` |
| `OutgoingRequest` | `{ pattern, data, id }` | Client → wire |
| `IncomingRequest` | `{ pattern, data, id }` | Wire → server |
| `IncomingEvent` | `{ pattern, data }` | Wire → server, no id |
| `WritePacket<T>` | `{ err?, response?, isDisposed?, status? }` | Handler result → client callback |
| `OutgoingResponse` | `{ id, err?, response, isDisposed, status? }` | Server → wire |
| `IncomingResponse` | `{ id, err?, response?, isDisposed?, status? }` | Wire → client |

A serializer that adds tracing metadata to every outgoing request, without touching a single call site:

```typescript title="src/transport/tracing.serializer.ts"
import { Serializer, OutgoingRequest } from '@nestjs/microservices';
import { AsyncLocalStorage } from 'node:async_hooks';

export class TracingSerializer implements Serializer<OutgoingRequest, OutgoingRequest> {
  constructor(private readonly als: AsyncLocalStorage<{ traceId: string }>) {}

  serialize(value: OutgoingRequest): OutgoingRequest {
    const store = this.als.getStore();
    return {
      ...value,
      data: { payload: value.data, traceId: store?.traceId ?? 'unknown' },
    };
  }
}
```

Combine with the `AsyncLocalStorage` context from [Chapter 43](./43-async-local-storage.md) and every message in the fleet carries a trace id, with no change to any handler. The matching deserializer unwraps it on the server and re-enters the store.

The complementary hook lives on the client: `serializeResponse()` and `serializeError()` shape what the subscriber sees. Combined with `customClass`, this is how you normalise errors across a whole codebase without a new transport:

```typescript title="src/transport/error-handling.proxy.ts"
import { ClientTCP, RpcException } from '@nestjs/microservices';

export class ErrorHandlingProxy extends ClientTCP {
  serializeError(err: Error) {
    return new RpcException(err);
  }
}
```

```typescript title="src/app.module.ts"
@Module({
  imports: [
    ClientsModule.register([{
      name: 'CustomProxy',
      customClass: ErrorHandlingProxy,
    }]),
  ],
})
export class AppModule {}
```

Every error from that client is now an `RpcException`, uniformly catchable by an `RpcExceptionFilter`, and you wrote four lines.

---

## Guards, pipes, interceptors, and filters come free

A question worth answering explicitly, because it looks like magic: why do guards and pipes work in a transporter you wrote, when you never mention them?

Because you never receive the controller method. `addHandler()` gives you a **proxy function** that `ListenersController` built by wrapping the method in the full RPC execution pipeline: guards, then pipes on parameters, then interceptors around the call, with exception filters catching everything. By the time your strategy invokes `handler(data, ctx)`, all of that is inside.

Your obligations are exactly three, and they are all in the code above:

1. **Pass a context object as the second argument.** `ExecutionContext.switchToRpc().getContext()` returns it, and guards, `@Ctx()`, and interceptors read it. Pass `undefined` and every guard that inspects the context throws.
2. **Handle an observable return value.** Interceptors make the result a stream. `transformToObservable()` plus `this.send()` — or an explicit `subscribe()` — is required.
3. **Route errors into the write packet, not into a throw.** Filters produce an error *result*; your job is to deliver it as `{ err, isDisposed: true }`.

Get those three right and every feature from Part I works. Get the second one wrong and your controller silently never executes — the single most confusing failure in custom-transporter work.

---

## Testing a transporter

Two levels, and you want both.

**Unit-test the strategy in isolation.** `addHandler()` is public, so you can register a fake handler and drive the strategy with a synthetic message, with no broker anywhere:

```typescript title="test/gcp-pubsub.server.spec.ts"
import { GcpPubSubServer } from '../src/transport/gcp-pubsub.server';
import { firstValueFrom, of } from 'rxjs';

describe('GcpPubSubServer', () => {
  it('routes an object pattern to the right handler', async () => {
    const server = new GcpPubSubServer({
      projectId: 'test',
      subscription: 's',
      replyTopic: 'r',
    });

    const handler = jest.fn().mockResolvedValue(6);
    server.addHandler({ cmd: 'sum' }, handler as never, false);

    const route = (server as any).normalizePattern({ cmd: 'sum' });
    expect(route).toBe('{"cmd":"sum"}');
    expect(server.getHandlerByPattern(route)).toBe(handler);
  });

  it('marks event handlers', () => {
    const server = new GcpPubSubServer({ projectId: 't', subscription: 's', replyTopic: 'r' });
    server.addHandler('order.created', (() => {}) as never, true);
    expect(server.getHandlerByPattern('order.created')!.isEventHandler).toBe(true);
  });

  it('emits response then disposal through Server#send', async () => {
    const server = new GcpPubSubServer({ projectId: 't', subscription: 's', replyTopic: 'r' });
    const packets: any[] = [];
    server.send(of(1, 2), (p) => packets.push(p));
    await new Promise((r) => setImmediate(r));
    expect(packets).toEqual([
      { response: 1 },
      { response: 2 },
      { isDisposed: true },
    ]);
  });
});
```

That third test is the one to write first when adopting this chapter's code, because it pins down the response protocol you must not break.

**Write an in-memory transporter as a test double.** This is the highest-value transporter most teams will ever write. Both halves share a `Map`, so a full request–response round trip happens in-process with no broker, no ports, and no flakiness:

```typescript title="test/support/in-memory.transport.ts"
import {
  ClientProxy,
  CustomTransportStrategy,
  ReadPacket,
  Server,
  WritePacket,
} from '@nestjs/microservices';

/** Shared bus. One per test, so tests cannot bleed into each other. */
export class InMemoryBus {
  server?: InMemoryServer;
}

export class InMemoryServer extends Server implements CustomTransportStrategy {
  constructor(private readonly bus: InMemoryBus) {
    super();
    this.initializeSerializer({});
    this.initializeDeserializer({});
  }

  listen(callback: () => void) {
    this.bus.server = this;
    callback();
  }
  close() {
    this.bus.server = undefined;
  }
  on() {}
  unwrap<T = never>(): T {
    return this.bus as unknown as T;
  }

  async dispatch(packet: ReadPacket & { id?: string }, respond: (p: WritePacket) => void) {
    const route = this.normalizePattern(packet.pattern);
    const handler = this.getHandlerByPattern(route);
    if (!handler) {
      return respond({ err: new Error(`No handler for "${route}"`), isDisposed: true });
    }
    const ctx = { getPattern: () => route } as never;
    if (handler.isEventHandler) {
      await this.handleEvent(route, packet, ctx);
      return;
    }
    this.send(this.transformToObservable(await handler(packet.data, ctx)), respond);
  }
}

export class InMemoryClient extends ClientProxy {
  constructor(private readonly bus: InMemoryBus) {
    super();
    this.initializeSerializer({});
    this.initializeDeserializer({});
  }

  async connect() {
    return this.bus;
  }
  async close() {}
  unwrap<T = never>(): T {
    return this.bus as unknown as T;
  }

  publish(packet: ReadPacket, callback: (p: WritePacket) => void): () => void {
    let torn = false;
    const withId = this.assignPacketId(packet);
    void this.bus.server?.dispatch(withId, (p) => { if (!torn) callback(p); });
    return () => { torn = true; };
  }

  protected async dispatchEvent(packet: ReadPacket): Promise<void> {
    await this.bus.server?.dispatch(packet, () => undefined);
  }
}
```

In an e2e test, swap it in:

```typescript
const bus = new InMemoryBus();
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider('ORDERS_CLIENT')
  .useValue(new InMemoryClient(bus))
  .compile();

const app = moduleRef.createNestApplication();
app.connectMicroservice({ strategy: new InMemoryServer(bus) });
await app.startAllMicroservices();
await app.init();
```

Your controllers, guards, pipes, interceptors, and filters all execute for real; only the network is fake. This is materially better than mocking `ClientProxy`, which tests nothing about your handlers, and materially faster than spinning up Redis in CI. See [Chapter 31](../part2-intermediate/31-testing.md) for the surrounding testing patterns.

---

## Common mistakes

1. **Forgetting `initializeSerializer` / `initializeDeserializer` in the constructor.**
   *Symptom:* `TypeError: Cannot read properties of undefined (reading 'serialize')` on the first message.
   *Cause:* `this.serializer` is only populated by those calls.
   *Fix:* Call both in the constructor, passing the options object even if it has no serializer keys.

2. **Never setting `isDisposed: true`.**
   *Symptom:* `firstValueFrom(client.send(...))` resolves, but `lastValueFrom()` — and any `await` on a stream — hangs forever.
   *Cause:* The observer only completes on a disposal packet.
   *Fix:* Use the inherited `Server#send()` on the responder side; it emits disposal on completion. On the client side, never swallow the flag.

3. **Not returning a teardown function from `publish()`.**
   *Symptom:* Memory grows in proportion to timed-out requests; `routingMap.size` climbs and never falls.
   *Cause:* Abandoned correlation entries are never removed.
   *Fix:* `return () => this.routingMap.delete(packet.id);` — and delete on `isDisposed` in the reply handler as well.

4. **Constructing map keys by hand.**
   *Symptom:* `@MessagePattern({ role: 'user', cmd: 'find' })` is never invoked.
   *Cause:* You built `'{"role":"user","cmd":"find"}'` while `normalizePattern` sorts keys and produced `'{"cmd":"find","role":"user"}'`.
   *Fix:* Always `this.getHandlerByPattern(this.normalizePattern(pattern))`.

5. **Ignoring `handler.isEventHandler`.**
   *Symptom:* Events produce a reply nobody consumes, filling a reply topic; or a message handler's response is discarded and the caller times out.
   *Cause:* One dispatch path for both kinds.
   *Fix:* Branch on `isEventHandler` and route events through the inherited `handleEvent()`.

6. **Dropping an observable result on the floor.**
   *Symptom:* With interceptors installed, the controller method never runs and no error appears.
   *Cause:* An unsubscribed cold observable does nothing.
   *Fix:* `transformToObservable()` + `this.send()`, or an explicit `subscribe()` when calling a handler manually.

7. **Nacking unparseable messages.**
   *Symptom:* One malformed message consumes 100% CPU and floods logs forever.
   *Cause:* Redelivery of a message that can never succeed.
   *Fix:* Ack (or dead-letter) parse failures; only nack failures that could plausibly succeed on retry.

8. **Calling `callback()` in `listen()` before subscriptions are actually established.**
   *Symptom:* Messages published immediately after startup are lost; tests are flaky.
   *Cause:* Nest considers the microservice ready as soon as `callback()` fires.
   *Fix:* `await` the broker's subscription-ready promise, then call `callback()`. On failure, call `callback(err)`.

9. **Writing a full transporter when a serializer would do.**
   *Symptom:* 400 lines of transport code to add a header to messages.
   *Cause:* Skipping the cheaper extension points.
   *Fix:* Try `Serializer`/`Deserializer` first, `customClass` second, a strategy third.

---

## Putting it together

A minimal but genuinely complete transporter over Node's built-in `EventEmitter`, useful as a monorepo in-process bus and as a template you can port to any broker. Both halves, a context class, and the wiring.

```typescript title="src/transport/emitter.transport.ts"
import { EventEmitter } from 'node:events';
import {
  ClientProxy,
  CustomTransportStrategy,
  ReadPacket,
  Server,
  WritePacket,
} from '@nestjs/microservices';
import { BaseRpcContext } from '@nestjs/microservices/ctx-host/base-rpc.context';

export const EMITTER_TRANSPORT = Symbol('EMITTER_TRANSPORT');

const REQUESTS = 'requests';
const REPLIES = 'replies';

export class EmitterContext extends BaseRpcContext<[string, string | undefined]> {
  getPattern(): string { return this.args[0]; }
  getCorrelationId(): string | undefined { return this.args[1]; }
}

// ---------------------------------------------------------------- server ----
export class EmitterServer extends Server implements CustomTransportStrategy {
  transportId = EMITTER_TRANSPORT;

  constructor(private readonly emitter: EventEmitter) {
    super();
    this.initializeSerializer({});
    this.initializeDeserializer({});
  }

  listen(callback: (err?: unknown) => void) {
    try {
      this.emitter.on(REQUESTS, this.onRequest);
      this.logger.log(`EmitterServer ready — ${this.messageHandlers.size} handlers`);
      callback();
    } catch (err) {
      callback(err);
    }
  }

  close() {
    this.emitter.off(REQUESTS, this.onRequest);
  }

  on<K extends string, C extends Function>(event: K, cb: C) {
    this.emitter.on(event, cb as never);
  }

  unwrap<T = never>(): T {
    return this.emitter as unknown as T;
  }

  private onRequest = async (raw: string) => {
    const packet = this.deserializer.deserialize(JSON.parse(raw)) as ReadPacket & { id?: string };
    const route = this.normalizePattern(packet.pattern);
    const handler = this.getHandlerByPattern(route);
    const ctx = new EmitterContext([route, packet.id]);

    if (!handler) {
      this.logger.error(`There is no matching message handler defined for "${route}".`);
      if (packet.id) this.reply(packet.id, { err: `No handler for "${route}"`, isDisposed: true });
      return;
    }

    if (handler.isEventHandler) {
      await this.handleEvent(route, packet, ctx);
      return;
    }

    try {
      const stream$ = this.transformToObservable(await handler(packet.data, ctx));
      this.send(stream$, (p) => this.reply(packet.id!, p));
    } catch (err) {
      this.reply(packet.id!, { err, isDisposed: true });
    }
  };

  private reply(id: string, packet: WritePacket) {
    const payload = this.serializer.serialize({ id, ...packet });
    this.emitter.emit(REPLIES, JSON.stringify(payload));
  }
}

// ---------------------------------------------------------------- client ----
export class EmitterClient extends ClientProxy {
  constructor(private readonly emitter: EventEmitter) {
    super();
    this.initializeSerializer({});
    this.initializeDeserializer({});
  }

  async connect(): Promise<EventEmitter> {
    this.emitter.on(REPLIES, this.onReply);
    return this.emitter;
  }

  async close() {
    this.emitter.off(REPLIES, this.onReply);
    this.routingMap.clear();
  }

  unwrap<T = never>(): T {
    return this.emitter as unknown as T;
  }

  publish(partial: ReadPacket, callback: (p: WritePacket) => void): () => void {
    const packet = this.assignPacketId(partial);
    this.routingMap.set(packet.id, callback);
    this.emitter.emit(REQUESTS, JSON.stringify(this.serializer.serialize(packet)));
    return () => this.routingMap.delete(packet.id);
  }

  protected async dispatchEvent(packet: ReadPacket): Promise<void> {
    this.emitter.emit(REQUESTS, JSON.stringify(this.serializer.serialize(packet)));
  }

  private onReply = (raw: string) => {
    const packet = this.deserializer.deserialize(JSON.parse(raw)) as WritePacket & { id: string };
    const callback = this.routingMap.get(packet.id);
    if (!callback) return;                       // already torn down
    if (packet.isDisposed) this.routingMap.delete(packet.id);
    callback(packet);
  };
}
```

```typescript title="src/main.ts"
import { EventEmitter } from 'node:events';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions } from '@nestjs/microservices';
import { AppModule, BUS } from './app.module';
import { EmitterServer } from './transport/emitter.transport';

async function bootstrap() {
  const bus = new EventEmitter();
  const app = await NestFactory.create(AppModule.forBus(bus));
  app.connectMicroservice<MicroserviceOptions>({ strategy: new EmitterServer(bus) });
  app.enableShutdownHooks();
  await app.startAllMicroservices();
  await app.listen(3000);
}
bootstrap();
```

```typescript title="src/orders/orders.controller.ts"
import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { EmitterContext, EMITTER_TRANSPORT } from '../transport/emitter.transport';

@Controller()
export class OrdersController {
  @MessagePattern({ cmd: 'sum' }, EMITTER_TRANSPORT)
  sum(@Payload() numbers: number[], @Ctx() ctx: EmitterContext): number {
    console.log(`pattern=${ctx.getPattern()} correlation=${ctx.getCorrelationId()}`);
    return numbers.reduce((a, b) => a + b, 0);
  }

  @EventPattern('order.created', EMITTER_TRANSPORT)
  async onOrderCreated(@Payload() order: { id: string }) {
    console.log(`order ${order.id} created`);   // no reply is sent
  }
}
```

Everything in Part I applies to those handlers unchanged: put a `@UseGuards()` on `sum`, a `ValidationPipe` on the payload, an interceptor around the class, and all of it runs — because the function your transporter pulls out of `messageHandlers` already contains them.

---

> **핵심 정리**
> - 트랜스포터는 두 개의 독립적인 반쪽입니다: `Server`를 상속한 **전략**(구독·응답)과 `ClientProxy`를 상속한 **클라이언트**(발행·상관관계). 둘은 와이어 포맷만 공유합니다.
> - `CustomTransportStrategy`가 요구하는 것은 `listen`, `close`, `on`, `unwrap` 네 개뿐이며, 실질적으로 필수는 앞의 둘입니다. `listen(callback)`은 실패 시 `callback(err)`로 부트스트랩을 실패시키세요.
> - `this.messageHandlers`는 정규화된 패턴 문자열을 키로 하는 `Map`입니다. 객체 패턴은 **키가 알파벳순으로 정렬되어** 직렬화되므로, 키를 손으로 만들지 말고 항상 `normalizePattern` → `getHandlerByPattern`을 쓰세요.
> - `handler.isEventHandler`가 메시지와 이벤트를 구분하는 유일한 런타임 신호입니다. 이벤트는 상속된 `handleEvent()`로 보내고 절대 응답하지 마세요.
> - 응답 프로토콜의 핵심은 `isDisposed`입니다. `{ response }`는 `next`, `{ response, isDisposed: true }`는 `next` + `complete`, `{ err }`는 `error`입니다. `isDisposed`를 빠뜨리면 호출자는 영원히 기다립니다.
> - `publish()`가 반환하는 함수는 RxJS의 구독 해제 훅입니다. 여기서 `routingMap` 항목을 지우지 않으면 타임아웃마다 메모리가 샙니다.
> - 가드·파이프·인터셉터·필터는 저절로 동작합니다. `addHandler`가 준 함수가 이미 전체 파이프라인을 감싸고 있기 때문입니다. 당신의 의무는 컨텍스트 객체 전달, Observable 구독, 오류의 write 패킷 변환 세 가지뿐입니다.
> - 전체 트랜스포터를 쓰기 전에 더 싼 확장점을 먼저 보세요: 와이어 포맷만 바꾼다면 `Serializer`/`Deserializer`, 기존 클라이언트의 동작만 바꾼다면 `customClass`.
> - 가장 실용적인 첫 트랜스포터는 **인메모리 테스트 더블**입니다. 브로커 없이 컨트롤러·가드·파이프를 진짜로 실행하는 e2e 테스트를 만들 수 있습니다.

> **연습 문제**
> 1. `normalizePattern`의 동작을 실험으로 확인하세요. `{ cmd: 'find', role: 'user' }`와 `{ role: 'user', cmd: 'find' }`, `{ id: 1 }`과 `{ id: '1' }`이 각각 같은 키를 만드는지 출력해 보고, 그 결과가 패턴 설계에 주는 함의를 서술하세요.
> 2. 이 장의 `EmitterServer`/`EmitterClient`를 그대로 구현한 뒤, `publish()`에서 반환하는 teardown 함수를 제거해 보세요. `timeout(50)`을 건 요청을 1,000번 보낸 뒤 `routingMap.size`를 출력해 누수를 관찰하고, 다시 되돌려 0이 되는 것을 확인하세요.
> 3. `Server#send`가 만들어 주는 write 패킷 시퀀스를 `of(1, 2, 3)`으로 테스트하세요. 이어서 `throwError(() => new Error('x'))`로 실패 스트림을 테스트해 어떤 패킷이 나오는지 확인하고, 클라이언트 구독자가 각각 무엇을 보는지 표로 정리하세요.
> 4. Amazon SQS(또는 사내 브로커)용 `CustomTransportStrategy`를 작성하세요. 요청-응답은 별도 응답 큐로, 이벤트는 응답 없이 처리하고, 파싱 실패 메시지는 DLQ로 보내도록 만드세요.
> 5. 모든 나가는 요청에 `traceId`를 붙이는 `Serializer`와 서버에서 이를 풀어 `AsyncLocalStorage`에 넣는 `Deserializer` 쌍을 작성하세요. 핸들러 코드는 한 줄도 바꾸지 않아야 합니다.
> 6. 인메모리 트랜스포터를 사용해, 가드가 `false`를 반환할 때 클라이언트가 어떤 오류를 받는지 검증하는 e2e 테스트를 작성하세요. 그런 다음 전략에서 컨텍스트 객체 전달을 빼면 무엇이 깨지는지 확인하세요.

**Next:** [Chapter 50 — GraphQL I: Code First, Schema First, and Resolvers](./50-graphql-fundamentals.md) leaves RPC behind for a different way of shaping an API boundary — one where the *client* decides what data a request returns, and the server's job is to make that safe and fast.
