// 15장 15.3·15.4절 대응 - Redis 클라이언트, 재연결 전략, 요청 배칭으로 캐시 스탬피드 방지.
import Redis from 'ioredis';

/**
 * Redis 캐시 래퍼.
 *
 * 캐시 계층은 "있으면 빠르고 없으면 느릴 뿐" 이어야 한다. Redis 가 흔들릴 때
 * 서비스 전체가 같이 죽으면 캐시를 도입한 의미가 없다. 그래서 이 모듈의
 * 모든 읽기 경로는 실패를 삼키고 loader 로 폴백한다.
 */
export function createCache({ config, logger, RedisCtor = Redis } = {}) {
  const client = new RedisCtor(config?.redisUrl ?? 'redis://localhost:6379', {
    lazyConnect: true,
    // 큐가 무한정 쌓이면 Redis 장애가 메모리 고갈로 번진다. 끊겨 있을 때는
    // 즉시 실패시키고 loader 로 넘어가는 편이 낫다.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
    /**
     * 재연결 전략: 지수 백오프 + 상한 + 지터.
     * 상한이 없으면 재시도 간격이 무한정 커지고, 지터가 없으면 모든 인스턴스가
     * 같은 순간에 한꺼번에 재접속을 시도해(썬더링 허드) Redis 를 다시 넘어뜨린다.
     */
    retryStrategy(times) {
      const base = Math.min(1_000 * 2 ** Math.min(times, 5), 20_000);
      return base / 2 + Math.floor(Math.random() * (base / 2));
    },
  });

  let connected = false;
  client.on('ready', () => {
    connected = true;
    logger?.info?.('redis 연결됨');
  });
  client.on('end', () => {
    connected = false;
    logger?.warn?.('redis 연결 종료됨 - 재연결 대기');
  });
  client.on('error', (err) => {
    // 재연결은 ioredis 가 알아서 한다. 여기서 던지면 프로세스가 죽는다.
    logger?.warn?.({ err: err?.message }, 'redis 오류(캐시 미스로 폴백)');
  });

  /**
   * 진행 중인 로더를 공유하는 in-flight 맵.
   *
   * 캐시 스탬피드(= 인기 키가 만료되는 순간 수백 개 요청이 동시에 원본을
   * 때리는 현상)를 막는 가장 싼 방법이다. 같은 프로세스 안에서는 동일 키에 대해
   * loader 가 딱 한 번만 실행되고, 나머지 요청은 그 프로미스를 함께 기다린다.
   * (프로세스 간 중복까지 막으려면 분산 락이 필요하지만, 보통은 이 배칭만으로
   *  원본 부하가 인스턴스 수 수준으로 떨어져 충분하다.)
   */
  const inFlight = new Map();

  async function get(key) {
    try {
      const raw = await client.get(key);
      return raw === null ? undefined : JSON.parse(raw);
    } catch (err) {
      logger?.warn?.({ err: err?.message, key }, '캐시 조회 실패 - 미스로 처리');
      return undefined;
    }
  }

  async function set(key, value, ttlSeconds) {
    try {
      const payload = JSON.stringify(value);
      if (ttlSeconds > 0) await client.set(key, payload, 'EX', jitterTtl(ttlSeconds));
      else await client.set(key, payload);
      return true;
    } catch (err) {
      logger?.warn?.({ err: err?.message, key }, '캐시 저장 실패 - 무시');
      return false;
    }
  }

  async function del(key) {
    try {
      await client.del(key);
      return true;
    } catch (err) {
      logger?.warn?.({ err: err?.message, key }, '캐시 삭제 실패 - 무시');
      return false;
    }
  }

  /**
   * 캐시 조회 -> 미스면 loader 실행 -> 결과 저장.
   * 동일 키에 대한 동시 loader 실행은 in-flight 맵으로 하나로 합친다.
   */
  async function getOrSet(key, ttlSeconds, loader) {
    const hit = await get(key);
    if (hit !== undefined) return hit;

    const pending = inFlight.get(key);
    if (pending) return await pending;

    const promise = (async () => {
      const value = await loader();
      // undefined/null 은 캐시하지 않는다. "없음"을 캐시하려면 호출부가
      // 명시적인 표식 값을 돌려주게 해서 의도를 드러내야 한다.
      if (value !== undefined && value !== null) await set(key, value, ttlSeconds);
      return value;
    })();

    inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      // 성공이든 실패든 반드시 지운다. 남겨두면 실패한 프로미스가 영원히
      // 캐시되어 이후 모든 요청이 같은 오류를 받는다.
      inFlight.delete(key);
    }
  }

  /**
   * TTL 지터.
   * 같은 시각에 채워진 키들이 같은 시각에 한꺼번에 만료되면 스탬피드가
   * 주기적으로 재현된다. TTL 에 ±10% 흔들림을 줘서 만료 시점을 흩뜨린다.
   */
  function jitterTtl(ttlSeconds) {
    const spread = Math.max(1, Math.round(ttlSeconds * 0.1));
    return ttlSeconds + Math.floor(Math.random() * (2 * spread + 1)) - spread;
  }

  async function connect() {
    await client.connect();
    connected = true;
  }

  async function ping(timeoutMs = 1_000) {
    let timer;
    try {
      return await Promise.race([
        client.ping(),
        new Promise((_r, reject) => {
          timer = setTimeout(() => reject(new Error('redis ping timeout')), timeoutMs);
          if (typeof timer.unref === 'function') timer.unref();
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function close() {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }

  return {
    client,
    get,
    set,
    del,
    getOrSet,
    connect,
    ping,
    close,
    isConnected: () => connected,
    inFlightSize: () => inFlight.size,
  };
}

export default createCache;
