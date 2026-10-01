---
title: "Part 9. SQL 인덱스와 쿼리 성능"
parent: "NestJS SaaS 백엔드 필수 이론"
nav_order: 9
---

# Part 9. SQL 인덱스와 쿼리 성능 (출처: SQL Performance Explained)

> SaaS 백엔드가 느려지는 이유의 대부분은 Node.js 코드가 아니라 **DB 쿼리**다.
> 그리고 쿼리가 느린 대부분의 이유는 **인덱스를 잘못 설계했거나, 인덱스를 못 쓰게 쿼리를 썼기 때문**이다.
> 이 부는 PostgreSQL/MySQL(InnoDB) 공통으로 통하는 "인덱스 사고방식"을 정리한다.
>
> 💡 보충(원서 외) 안내: 원서는 B-Tree 인덱스만 다루고, 용어와 실행 계획 예시는 **Oracle 기준**이다(MySQL/PostgreSQL/SQL Server는 곁가지 설명과 부록 A에서만 나온다). 이 문서의 PostgreSQL/MySQL 문법·버전 정보, TypeORM/Prisma 코드, `pg_stat_statements` 등은 원서에 없는 저자 보충이며, 해당 위치에 `(보충)`으로 표시했다. 원서 집필 시점의 MySQL(5.6) 기준 설명은 최신 버전과 다를 수 있다.

---

### 1. 인덱스는 어떻게 생겼나

#### 1.1 인덱스 = 정렬된 복사본 + 트리

- 인덱스는 테이블과 **별개의 자료구조**다. 자기 디스크 공간을 쓰고, 인덱스 컬럼 값을 **복사해서** 갖고 있다.
- 책 맨 뒤의 "찾아보기"와 같다. 키워드(값) → 페이지 위치(테이블 행 위치)를 정렬해 둔 것.
- 테이블(힙)은 정렬되어 있지 않지만, 인덱스는 **항상 정렬**되어 있다.

인덱스는 두 가지 구조의 조합이다.

| 구조 | 역할 |
|---|---|
| 리프 노드(Leaf node)들의 **이중 연결 리스트** | 정렬 순서를 유지. 값이 끼어들어도 포인터만 바꾸면 됨. 앞/뒤 양방향 읽기 가능 |
| **B-Tree** (균형 트리) | 리프 노드 중 원하는 위치를 빠르게 찾는 "길 안내" |

- B-Tree는 **균형(balanced)** 트리다. 루트에서 어느 리프까지든 거리가 같다. (이진 트리가 아니다.)
- 한 노드에 수백 개의 항목이 들어가므로, 수백만 건이어도 트리 깊이는 보통 **4~5단계**다. 데이터가 100배 늘어도 깊이는 한 단계 정도만 늘어난다 (로그 성장).

#### 1.2 인덱스 조회의 3단계

1. **트리 탐색(Tree traversal)**: 루트 → 브랜치 → 리프. 항상 빠르다(깊이 4~5).
2. **리프 노드 체인 따라가기**: 같은 값이 여러 개면 옆 리프를 계속 읽는다.
3. **테이블 접근(Table access)**: 인덱스에서 찾은 각 행 위치로 가서 실제 행을 읽는다.

**"인덱스를 탔는데도 느린" 이유는 거의 2번과 3번이다.** 넓은 범위를 훑거나, 수천 건을 하나씩 테이블에서 읽어야 하기 때문이다. 트리가 "망가져서"가 아니다.
("인덱스 재구성(REINDEX)하면 빨라진다"는 대부분 미신이다.)

#### 1.3 왜 SaaS 백엔드에서 중요한가

- 개발 DB(수백 건)에서는 무엇이든 빠르다. 운영(수백만 건)에서 갑자기 느려진다. 이때 원인을 짚으려면 위 3단계 모델이 머릿속에 있어야 한다.

> 📖 원문: 1장 Anatomy of an Index (Index Leaf Nodes, Search Tree, Slow Indexes Part I)

---

### 2. WHERE 절과 인덱스

#### 2.1 기본 원칙: 옵티마이저와 통계

- <strong>옵티마이저(Optimizer/Planner)</strong>는 SQL을 받아 "어떻게 실행할지" **실행 계획**을 만든다. 후보 계획마다 비용(cost)을 추정해 가장 싼 것을 고른다.
- 비용 추정은 <strong>통계(Statistics)</strong>에 의존한다 (행 수, 값 분포 등). 통계가 낡으면 잘못된 계획을 고른다.
  - (보충) PostgreSQL: `ANALYZE` / autovacuum이 갱신. MySQL: `ANALYZE TABLE`.
- 인덱스가 있어도 **옵티마이저가 안 쓸 수 있다.** 결과 행이 테이블의 큰 비율이면 풀 스캔(Full Table Scan)이 더 빠르기 때문이다. 이는 정상이다.

#### 2.2 연결(복합) 인덱스의 컬럼 순서

여러 컬럼을 묶은 인덱스(`(a, b, c)`)는 **전화번호부**와 같다. 성 → 이름 순으로 정렬돼 있다.

- 정렬은 **첫 번째 컬럼 → 두 번째 → ...** 순서로 결정된다.
- 그래서 **왼쪽(선행) 컬럼부터 차례로** 조건이 있을 때만 트리를 잘 탄다.
  - `(a, b, c)` 인덱스는 `a` / `a, b` / `a, b, c` 조건에는 유효.
  - `b`만, `c`만, `b, c`만 조건이면 트리를 못 쓴다 (전화번호부를 "이름"으로 찾는 꼴).
- 즉 **컬럼 순서가 인덱스의 쓸모를 결정한다.**

```sql
-- 멀티테넌트 SaaS의 전형적 인덱스: tenant_id를 맨 앞에
CREATE INDEX idx_orders_tenant_created ON orders (tenant_id, created_at);

-- 이 쿼리들은 모두 이 인덱스를 잘 씀
WHERE tenant_id = $1
WHERE tenant_id = $1 AND created_at >= $2

-- 이 쿼리는 tenant_id 조건이 없어서 못 씀
WHERE created_at >= $2
```

핵심 규칙:

- **모든 쿼리가 쓰는 컬럼(예: `tenant_id`)을 앞에** 둔다. 그러면 인덱스 하나로 여러 쿼리를 커버한다.
- 컬럼 순서를 바꾸는 것만으로도 인덱스를 하나 덜 만들 수 있다. 인덱스가 적을수록 쓰기가 빠르다.
- 인덱스를 바꾸면 **그 테이블의 다른 쿼리에도 영향**이 간다. 실행 계획이 바뀔 수 있으니 주요 쿼리를 다시 확인한다.
- 인덱스 설계는 DBA가 아니라 **쿼리를 아는 개발자**의 몫이다. 어떤 컬럼 조합으로 조회하는지 아는 사람은 개발자뿐이다.

#### 2.3 등호(=)가 먼저, 범위가 나중

범위 조건(`>`, `<`, `BETWEEN`)은 인덱스의 **한 지점에서 시작해 다른 지점까지 리프를 훑는다.** 인덱스를 얼마나 좁게 훑느냐가 성능을 정한다.

- 규칙: **등호(=) 조건 컬럼을 앞에, 범위 조건 컬럼을 뒤에.**

```sql
WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3

-- 좋음: (tenant_id, created_at)  -> 해당 테넌트의 해당 기간만 정확히 훑음
-- 나쁨: (created_at, tenant_id)  -> 기간 내 모든 테넌트를 훑고 tenant_id는 필터로 걸러냄
```

- 인덱스는 "줄 서 있는 연결 리스트"라서 **범위 조건은 하나만** 접근 조건(access predicate)으로 쓸 수 있다. 서로 독립적인 범위 조건 두 개(`a < ? AND b < ?`)는 어떤 인덱스로도 완벽히 못 좁힌다.
- "가장 선택도가 높은 컬럼을 앞에"라는 속설은 절반만 맞다. 위 규칙(등호 먼저)이 우선이다.

#### 2.4 접근 조건(Access) vs 필터 조건(Filter)

같은 인덱스를 써도 조건이 **어떻게** 쓰이는지가 다르다.

| 종류 | 의미 | 성능 |
|---|---|---|
| 접근 조건(Access / Index Cond) | 트리 탐색과 스캔 범위를 **좁힘** | 좋음 |
| 필터 조건(Filter) | 범위 안의 행을 하나씩 읽으며 **버림** | 범위가 넓으면 느림 |

- 실행 계획에서 이 둘을 구분해서 보는 습관이 중요하다 (아래 4절).
- 데이터가 늘면 필터 조건이 많은 계획은 급격히 느려지고, 접근 조건으로 처리되는 계획은 완만하게 느려진다. 원서는 인덱스 필터 조건을 "언제 터질지 모르는 불발탄"에 비유한다.
- 원서 부록 A 기준: Oracle은 실행 계획의 `access` / `filter`로 구분해 보여 준다. **PostgreSQL은 접근 조건과 인덱스 필터 조건이 둘 다 `Index Cond`로 표시**되어 계획만으로는 구분이 안 되므로 인덱스 정의와 대조해야 한다. PostgreSQL의 `Filter`는 (Index Scan 아래에 있어도) 테이블 접근 뒤에 걸러내는 조건이다. MySQL은 `key_len`(접근), `Using index condition`(인덱스 필터), `Using where`(테이블 필터)로 추정한다.

> 📖 원문: 2장 The Equality Operator, Concatenated Indexes, Slow Indexes Part II, Searching for Ranges

#### 2.5 컬럼에 함수를 쓰면 인덱스가 무효화된다

DB에게 함수는 **블랙박스**다. `LOWER(email)`은 `email`과 완전히 다른 값이다.

```sql
-- email에 인덱스가 있어도 못 씀 (풀 스캔)
SELECT * FROM users WHERE LOWER(email) = 'a@b.com';

-- 해결 1: 함수 기반(표현식) 인덱스
-- (원서: Oracle 등에서 지원, MySQL 5.6은 미지원. 보충: PostgreSQL은 지원, MySQL은 8.0.13+)
CREATE INDEX idx_users_email_lower ON users (LOWER(email));
-- 쿼리도 반드시 똑같이 LOWER(email)을 써야 함

-- 해결 2: 저장 시점에 소문자로 정규화해서 저장 후 일반 인덱스 사용
```

- 일관성이 중요하다. 어떤 쿼리는 `LOWER`, 어떤 쿼리는 `UPPER`를 쓰면 인덱스가 두 개 필요해진다. **애플리케이션 전체에서 한 가지 방식으로 통일**한다.
- 원본 데이터 자체를 인덱싱하는 것이 가장 쓸모 있다.
- 많이 쓰이는 함정들:
  - `WHERE DATE(created_at) = '2025-01-01'`
  - `WHERE YEAR(created_at) = 2025`
  - `WHERE price * 1.1 > 100`, `WHERE amount - 1000 > ?` (DB는 방정식을 풀어주지 않는다)
  - 타입이 다른 값 비교(문자열 컬럼을 숫자와 비교하는 등) → 암묵적 형 변환이 컬럼에 적용되어 인덱스 무효화. 원서는 숫자를 문자열 컬럼에 저장하는 것 자체를 피하라고 하며, 반대 방향(숫자 컬럼 = '42')은 문제가 없다고 설명한다. (PostgreSQL은 이 경우 오류를 낸다.)
  - 날짜/시간을 두 컬럼에 나눠 저장하고 `ADDTIME(d, t) > ...`처럼 합쳐서 비교하는 경우: 앞쪽 컬럼에 "중복 조건"(`d >= 기준일`)을 하나 더 붙이면 인덱스가 어느 정도 쓰인다. 애초에 DATETIME/timestamp 한 컬럼으로 저장하는 편이 낫다.
  - 인덱스 함수의 결과는 "저장 시점에 고정"된다. 현재 시각 같은 비결정 함수(예: 나이 계산)는 인덱스에 쓸 수 없다. 나이 42세 조회는 생년월일 **범위 조건**으로 바꿔 쓴다.

**날짜 범위는 함수 대신 "반열린 구간"으로 쓴다.** 어느 DB에서나 통한다.

```sql
-- 나쁨
WHERE DATE(created_at) = '2025-03-01'

-- 좋음 (인덱스 사용 가능): [시작, 다음날 시작)
WHERE created_at >= '2025-03-01' AND created_at < '2025-03-02'
```

```ts
// (보충) TypeScript/TypeORM 예시: 월 범위 조회 — 원서에는 없는 저자 예시
const start = new Date(Date.UTC(2025, 2, 1));
const end = new Date(Date.UTC(2025, 3, 1)); // 다음 달 1일 (미포함)
qb.andWhere('o.created_at >= :start AND o.created_at < :end', { start, end });
```

- `BETWEEN`은 양쪽 끝을 **포함**하므로 시간 성분이 있는 컬럼에서는 경계 실수가 나기 쉽다. `>=` + `<` 조합이 안전하다.

> 📖 원문: 2장 Functions, Obfuscated Conditions (Date Types, Math)

#### 2.6 과도한 인덱싱(Over-Indexing) 금지

- "일단 다 인덱싱하자"는 최악의 전략이다. 인덱스마다 **INSERT/UPDATE/DELETE 때 유지 비용**이 든다.
- 함수 기반 인덱스는 특히 중복 인덱스가 쉽게 생긴다. 접근 경로를 통일해서 **하나의 인덱스가 여러 쿼리를 처리**하게 만든다.
- 인덱스 하나 vs 컬럼별 인덱스 여러 개? 대부분 **컬럼 조합에 맞춘 복합 인덱스 하나**가 낫다. 여러 인덱스를 합치는 방식(Index Merge / Bitmap)은 메모리와 CPU를 더 쓴다.

> 📖 원문: 2장 Over-Indexing, Index Merge

#### 2.7 바인드 파라미터(Parameterized Query)

- 값을 SQL 문자열에 끼워 넣지 않고 `$1`, `?` 같은 **자리표시자**로 전달한다.
- 이유 2가지:
  1. **보안**: SQL 인젝션을 막는 가장 확실한 방법.
  2. **성능**: SQL 문장이 같아 DB가 실행 계획을 재사용할 수 있다. 다만 원서 기준으로 이는 **실행 계획 캐시가 있는 DB(Oracle, SQL Server)** 얘기다. MySQL은 계획 캐시가 없고, PostgreSQL은 준비된(prepared) 문장을 열어 둔 동안만 캐시한다. 그래도 인젝션 방지 때문에 바인딩은 항상 한다.
- 한계: 자리표시자로는 **테이블명/컬럼명/정렬 방향** 같은 SQL 구조를 바꿀 수 없다. 이런 값은 <strong>허용 목록(whitelist)</strong>으로 검증한 뒤 문자열로 조립한다.
- 값에 따라 최적 계획이 달라질 수 있어서(소수 행 vs 대량 행) 가끔 파라미터 때문에 계획이 부적절해지기도 한다. 원서의 예: 값 분포가 심하게 치우친 상태 컬럼(`todo` 소수 vs `done` 다수)은 값이 계획을 바꾸므로 리터럴로 쓰는 게 나을 수 있다. 하지만 이런 경우는 드물다. 의심스러우면 **항상 바인딩**이다.

```ts
// (보충) node-postgres 스타일 예시 — 원서에는 없는 저자 예시
// 나쁨: 인젝션 위험
await db.query(`SELECT * FROM users WHERE email = '${email}'`);

// 좋음
await db.query('SELECT * FROM users WHERE email = $1', [email]);

// 정렬 컬럼은 허용 목록으로
const SORTABLE = { createdAt: 'created_at', name: 'name' } as const;
const col = SORTABLE[sortKey] ?? 'created_at';
await db.query(`SELECT * FROM users ORDER BY ${col} DESC LIMIT $1`, [limit]);
```

> 🔗 NestJS 연결 (보충): 입력값 검증은 `ValidationPipe` + DTO로 하고, 정렬/필터 필드는 enum/`@IsIn()`으로 허용 목록화한다. TypeORM/Prisma/Knex 모두 기본이 파라미터 바인딩이므로 `raw` 쿼리에서만 조심하면 된다.

> 📖 원문: 2장 Parameterized Queries

#### 2.8 LIKE 검색

- `LIKE`는 **첫 와일드카드(`%`) 앞의 문자열만** 인덱스 탐색에 쓰인다. 나머지는 필터다.

| 패턴 | 인덱스 활용 |
|---|---|
| `LIKE 'kim%'` | 접두사로 범위 탐색 가능 (좋음) |
| `LIKE 'ki%m'` | `ki`까지만 탐색, 나머지는 필터 |
| `LIKE '%kim'`, `LIKE '%kim%'` | **인덱스 탐색 불가**, 풀 스캔 |

- 접두사가 길고 구체적일수록 훑는 범위가 줄어든다. 원서의 예: `'WI%ND'`는 18행을 훑고 `'WINA%'`는 정확히 1행만 읽는다.
- 앞에 `%`가 붙은 검색(부분 문자열 검색)이 필요하면 **전문 검색(Full-Text Search)** 을 쓴다.
  - 원서: MySQL은 `MATCH ... AGAINST`(5.6부터 InnoDB도 FULLTEXT 인덱스), PostgreSQL은 `@@` 연산자 기반 전문 검색.
  - (보충) PostgreSQL `tsvector` + GIN 인덱스, `pg_trgm` 확장. 규모가 커지면 Elasticsearch 같은 검색 엔진을 고려한다.
- 바인드 파라미터와 LIKE: 값이 계획 단계에서 안 보이면 옵티마이저가 와일드카드 위치를 추측한다. 원서에 따르면 대부분 DB는 "앞에 와일드카드 없음"으로 가정하고, **PostgreSQL은 반대로 "있음"으로 가정해 인덱스를 안 쓴다.** 접두사 검색에는 연산자 클래스(원서 예: `varchar_pattern_ops`)가 필요할 수 있다.
- (보충) 로케일에 따라 `LIKE 'abc%'`에 일반 인덱스가 안 먹을 수 있어 `text_pattern_ops`를 쓴다.
- 대소문자 무시 검색은 2.5절(함수 기반 인덱스) 또는 콜레이션을 쓴다(원서: SQL Server/MySQL 기본 콜레이션은 대소문자를 구분하지 않음). (보충) PostgreSQL `citext`도 있다.
- 원서 주의: Hibernate 같은 ORM은 대소문자 무시 검색에 `LOWER`/`UPPER`를 몰래 넣는다. ORM이 만든 SQL을 확인하지 않으면 인덱스가 안 맞을 수 있다.

> 📖 원문: 2장 Indexing LIKE Filters

#### 2.9 부분 인덱스(Partial Index)

인덱스에 **조건에 맞는 행만** 넣는다. 원서는 PostgreSQL의 partial index, SQL Server의 filtered index로 소개한다(Oracle은 별도 방식). (보충) MySQL은 직접 지원하지 않으므로 생성 컬럼 + 인덱스 등 대안을 쓴다.

```sql
-- 아직 처리되지 않은 작업만 인덱싱 (큐 테이블) — 원서의 messages_todo 예시를 옮긴 것
CREATE INDEX idx_jobs_todo ON jobs (queue) WHERE status = 'pending';

-- (보충) soft delete 테이블에서 살아있는 행만 — 원서에 없는 저자 예시
CREATE UNIQUE INDEX uq_users_email_active ON users (tenant_id, email) WHERE deleted_at IS NULL;
```

- 장점: 인덱스가 훨씬 작다. 테이블이 계속 커져도 "처리 대기" 행만 담으면 인덱스 크기는 거의 일정하다.
- (보충) SaaS에서 자주 쓰는 곳: 소프트 삭제(Soft delete)와 유니크 제약, 상태값(pending/active) 조회, 작업 큐. (원서 예시는 작업 큐뿐)
- 쿼리의 `WHERE`가 인덱스 조건을 포함해야 옵티마이저가 그 인덱스를 쓴다. 인덱스 조건에 쓰는 함수는 결정적(deterministic)이어야 한다.

> 📖 원문: 2장 Partial Indexes

#### 2.10 "똑똑한" 동적 조건 안티패턴

검색 조건이 선택적일 때 쿼리 하나로 처리하려고 이렇게 쓰는 경우가 많다.

```sql
-- 안티패턴: 모든 조건을 넣고 NULL이면 무력화
WHERE (tenant_id = $1 OR $1 IS NULL)
  AND (status = $2 OR $2 IS NULL)
  AND (name = $3 OR $3 IS NULL)
```

- DB는 "모든 조건이 꺼질 수 있는" 최악의 경우에 맞춰 계획을 세워서 **풀 스캔**으로 가기 쉽다 (특히 계획을 캐싱해 재사용할 때). 원서는 값을 리터럴로 넣으면 인덱스가 선택되지만, 그건 해법이 아니라 DB가 풀 수 있음을 보이는 것뿐이라고 한다(인젝션 위험). 원서 기준 MySQL은 계획 캐시가 없어 이 문제가 덜하다.
- "동적 SQL은 느리다"는 미신이다. 필요한 조건만 담되 바인딩을 쓰면 된다.
- 해결: **필요한 조건만 붙여서 쿼리를 동적으로 조립**한다. 단, 값은 반드시 바인딩한다.

```ts
// (보충) TypeORM QueryBuilder 예시 — 원서에는 없는 저자 예시
const qb = repo.createQueryBuilder('u').where('u.tenant_id = :tid', { tid });
if (dto.status) qb.andWhere('u.status = :status', { status: dto.status });
if (dto.name)   qb.andWhere('u.name LIKE :name', { name: `${dto.name}%` });
return qb.getMany();
```

> 📖 원문: 2장 Obfuscated Conditions – Smart Logic

---

### 3. 성능과 확장성: 데이터가 늘고 부하가 걸리면

- **성능 수치 하나는 확장성 그래프의 점 하나일 뿐이다.** "지금 30ms"는 데이터 100배·동시 접속 25배일 때 의미가 없다.
- 같은 인덱스 스캔이어도 접근 조건 기반인지 필터 기반인지에 따라, 데이터가 늘 때 응답 시간이 **완만하게** 늘거나 **급격하게** 늘어난다.
- **동시 부하**가 걸리면 느린 쿼리는 훨씬 더 느려진다 (디스크·캐시 경쟁). 개발 환경에서 혼자 돌려본 결과는 운영을 대변하지 못한다.
- **하드웨어를 늘려도 느린 쿼리는 빨라지지 않는다.** 서버를 늘리면 "더 많은 요청"을 처리할 수 있을 뿐 "한 쿼리의 응답 시간"은 그대로다. 넓은 도로는 차를 빠르게 하지 못한다.
- 한 번의 쿼리에서는 디스크 접근이 몇 번 안 되더라도, 쿼리가 수백~수천 번 반복되거나 조인이 많으면 지연이 누적된다. 특히 앱과 DB 사이 **네트워크 왕복**도 비용이다.
- 결론: **적절한 인덱싱이 응답 시간을 줄이는 가장 효과적인 방법**이다. 그리고 실행 계획을 눈으로 확인하는 것이 어설픈 벤치마크보다 믿을 만하다.

> 📖 원문: 3장 Performance and Scalability

---

### 4. 실행 계획(EXPLAIN) 읽기

성능 문제의 첫 번째 확인 지점은 항상 **실행 계획**이다. (코드가 아니라.) 원서 부록 A도 같은 입장이다.

```sql
-- PostgreSQL (원서: EXPLAIN [ANALYZE]. BUFFERS 옵션은 보충)
EXPLAIN (ANALYZE, BUFFERS) SELECT ...;   -- 실제로 실행하며 실측값까지 표시
-- MySQL
EXPLAIN SELECT ...;                        -- 계획만
EXPLAIN ANALYZE SELECT ...;                -- (보충) 8.0.18+: 실제 실행 포함
```

> 주의: `EXPLAIN ANALYZE`는 쿼리를 **실제로 실행**한다. `UPDATE/DELETE`에 쓸 때는 트랜잭션으로 감싸고 롤백한다. (원서 부록 A의 경고)
> 원서: PostgreSQL에서 바인드 파라미터(`$1`)가 든 문장은 그냥 EXPLAIN이 안 되므로 `PREPARE` 후 `EXPLAIN EXECUTE`를 쓴다(9.2부터 실제 값을 고려해 계획을 세운다).

#### 4.1 자주 보는 연산

| 개념 | PostgreSQL 표기 | MySQL 표기 | 의미 |
|---|---|---|---|
| 풀 스캔 | Seq Scan | type: `ALL` | 테이블 전체를 읽음 |
| 인덱스 범위 스캔 | Index Scan / Bitmap Heap Scan | `ref`, `range` | 트리 탐색 후 리프를 따라감 |
| 인덱스만으로 처리 | Index Only Scan | Extra: `Using index` | 테이블 접근 없음 (커버링) |
| 정렬 | Sort | Extra: `Using filesort` | 명시적 정렬 발생 |
| 조인 | Nested Loop / Hash Join / Merge Join | Nested Loop (원서: Hash Join 미지원. 보충: 8.0.18+에서 지원) | 조인 알고리즘 |

#### 4.2 무엇을 볼 것인가 (체크 순서)

1. **풀 스캔(Seq Scan / ALL)** 이 큰 테이블에서 나오는가?
2. 인덱스를 쓰더라도 **필터 조건이 많은가?** PostgreSQL에서 `Filter`는 테이블 접근 후 걸러내는 조건이므로 그 컬럼을 인덱스에 넣을 후보다. 반대로 `Index Cond`에도 (인덱스 필터 조건이 섞여 있을 수 있으니) **인덱스 컬럼 순서와 대조**해 정말 접근 조건인지 확인한다. (원서 부록 A)
3. **예상 행 수 vs 실제 행 수**가 크게 다른가? (통계가 낡았을 수 있음 → `ANALYZE`)
4. 불필요한 **Sort**가 있는가? (인덱스로 정렬을 대체할 수 있는지)
5. 조인 시 안쪽 테이블을 **반복적으로 조회**하는가?

- 비용(cost) 숫자만 보지 말고 **어떤 조건이 접근/필터로 쓰였는지**를 함께 본다. 비용이 비슷해 보여도 실제 성능은 크게 다를 수 있다.
- 작은 테이블에서는 인덱스가 있어도 풀 스캔이 나오는 게 정상이다. **운영과 비슷한 양의 데이터**로 확인해야 한다.
- (보충) 느린 쿼리는 미리 찾는다: PostgreSQL `pg_stat_statements`(확장 설치 필요), `log_min_duration_statement`; MySQL slow query log. 원서에는 이 도구들이 나오지 않는다.

> 📖 원문: 2~3장 Predicate Information(access/filter), 부록 A Execution Plans (PostgreSQL/MySQL 절). 4.1의 표는 부록 A의 연산 설명을 바탕으로 하되 일부 버전 정보는 보충.

---

### 5. 커버링 인덱스와 SELECT * 지양

#### 5.1 인덱스만으로 답하기 (Index-Only Scan)

- 쿼리가 필요로 하는 **모든 컬럼이 인덱스 안에** 있으면 테이블을 읽지 않고 인덱스만으로 결과를 만든다. "커버링 인덱스(Covering Index)"라고도 부른다.
- 테이블 접근 수천 번을 통째로 생략하므로 강력한 최적화다. 특히 **많은 행을 집계**하는 쿼리에 효과적이다.

```sql
-- 테넌트별 매출 합계
CREATE INDEX idx_sales_tenant_amount ON sales (tenant_id, amount);
SELECT SUM(amount) FROM sales WHERE tenant_id = $1;   -- 인덱스만으로 처리
```

- 원서: SQL Server는 `INCLUDE`로 검색에는 못 쓰지만 리프에만 저장되는 컬럼(nonkey column)을 추가할 수 있다. (보충) PostgreSQL도 11부터 `CREATE INDEX ... ON t (a) INCLUDE (b)`를 지원한다. MySQL에는 없다.
- 원서: PostgreSQL의 Index Only Scan은 9.2부터이며, MVCC 가시성 정보 때문에 테이블 확인이 완전히 사라지지는 않는다(예외 있음). 또한 "커버링 인덱스"는 인덱스의 속성이 아니라 실행 계획의 동작(index-only scan)이다.
- 얻는 이득의 크기는 **읽는 행 수**와 **클러스터링 정도**(테이블 행이 인덱스 순서와 비슷하게 모여 있는지)에 좌우된다. 행이 1개뿐이면 이득이 거의 없다.
- 조심할 점:
  - `WHERE`나 `SELECT`에 인덱스에 없는 컬럼을 **하나만 추가해도** 커버링이 깨지고 갑자기 느려질 수 있다.
  - 커버링 인덱스는 인덱스가 커지고 쓰기가 느려지는 비용이 있다. **추측으로 만들지 말고**, 먼저 일반 인덱스를 만든 뒤 필요할 때 확장한다.
  - 함수 기반 인덱스(`LOWER(name)`)는 원본 `name`을 돌려주지 못하므로 커버링에 쓰기 어렵다.
- 그러므로 **`SELECT *`를 피하고 필요한 컬럼만** 조회한다. 컬럼이 많을수록 커버링이 불가능해지고, 전송량도 늘어난다.

```ts
// (보충) 원서에는 없는 저자 예시 (원서는 Hibernate/Doctrine 등의 부분 객체 예시)
// TypeORM
repo.find({ select: { id: true, name: true }, where: { tenantId } });
// Prisma
prisma.user.findMany({ where: { tenantId }, select: { id: true, name: true } });
```

#### 5.2 필터 조건을 일부러 인덱스에 넣기

- 접근 조건이 될 수 없는 조건(예: `LIKE '%ina%'`)이라도, **선두 컬럼으로 이미 범위가 좁혀진 상태에서** 인덱스에 넣어두면, 테이블을 읽기 전에 미리 걸러 테이블 접근 횟수를 줄일 수 있다.
- 단, 이를 위해 **새 인덱스를 만들지 말고 기존 인덱스를 확장**한다. 컬럼이 늘면 인덱스가 커지고 유지 비용도 는다.

> 📖 원문: 5장 Index Filter Predicates Used Intentionally, Index-Only Scan

#### 5.3 클러스터드 인덱스(InnoDB)와 보조 인덱스

- **MySQL InnoDB**는 테이블 자체가 **기본키(PK) 순서로 정렬된 B-Tree**(클러스터드 인덱스)다. 별도의 힙이 없다.
  - 장점: PK로 조회하면 곧바로 행이 나온다. 공간도 절약된다(힙이 없음).
  - 단점: **보조 인덱스**(secondary index)는 행 위치(ROWID) 대신 **클러스터링 키(보통 PK) 값**을 저장한다. 행이 인덱스 순서 유지 때문에 옮겨 다니므로 고정 주소를 못 쓰기 때문이다. 그래서 보조 인덱스로 행을 읽으려면 보조 인덱스 탐색 + PK 트리 탐색, 두 번의 트리 탐색이 필요하다.
  - 원서 결론: 클러스터드 인덱스의 이점은 대체로 "보조 인덱스가 없는 테이블"에 한정된다. 인덱스가 여러 개인 테이블은 힙 테이블 + index-only scan이 나을 때가 많다.
- 실무 영향:
  - PK를 **짧게** 유지한다. 클러스터링 키가 ROWID보다 길어서 보조 인덱스가 커지기 때문이다(원서). 긴 UUID 문자열 PK는 특히 주의.
  - (보충) 랜덤한 UUID(v4) PK는 삽입 위치가 흩어져 페이지 분할이 잦다. 시간순 정렬이 되는 ID(BIGINT auto-increment, UUIDv7, ULID)가 유리하다. 이 UUID 관련 내용은 원서에 없는 일반 지식이다.
  - 보조 인덱스로 많은 행을 읽는 쿼리는 특히 비싸므로 커버링 인덱스(원서: "secondary-index-only scan")가 더 효과적이다. 참고로 보조 인덱스는 PK 값을 이미 갖고 있어서 PK만 조회하면 테이블 접근이 필요 없다.
- **PostgreSQL**은 힙 테이블만 쓴다(원서). 그래서 위 문제가 InnoDB만큼은 아니다. (`CLUSTER` 명령으로 힙을 인덱스 순서에 한 번 맞출 수는 있다.) MySQL MyISAM은 힙, InnoDB는 항상 클러스터드다.

> 📖 원문: 5장 Index-Organized Tables

---

### 6. 정렬과 그룹핑

#### 6.1 ORDER BY를 인덱스로 처리하기 (Pipelined Order By)

- 인덱스는 이미 정렬되어 있으므로, **`WHERE`와 `ORDER BY`를 같은 인덱스로 처리**하면 별도 정렬(Sort/filesort)을 생략할 수 있다.
- 정렬은 전체 결과를 다 읽은 뒤에야 첫 행을 내보낼 수 있어서 **메모리와 시간**을 많이 쓴다. 인덱스 순서를 이용하면 읽는 즉시 내보낼 수 있다.

```sql
-- 인덱스 (tenant_id, created_at)
SELECT id, title FROM posts
WHERE tenant_id = $1
ORDER BY created_at DESC
LIMIT 20;
-- tenant_id가 고정되면 그 범위 안은 created_at 순 -> 정렬 불필요
```

- 조건:
  - `WHERE`의 등호 조건 컬럼이 인덱스 앞부분, 그 다음 `ORDER BY` 컬럼이 오도록 정의.
  - 스캔하는 범위가 여러 값에 걸치면 (예: `tenant_id IN (...)`, `created_at >=`로 범위) 그 범위 전체가 정렬된 상태가 아닐 수 있어 정렬이 다시 생긴다.
- 정렬이 예상과 다르게 남으면, `ORDER BY`에 **인덱스 정의 전체를 그대로** 써 보라. 그러면 원인을 알 수 있다 (인덱스 순서가 내 생각과 다르거나, 옵티마이저가 비용상 정렬을 선택했거나).

#### 6.2 ASC / DESC, NULL 정렬

- 인덱스는 **양방향**으로 읽을 수 있다 (이중 연결 리스트). 그래서 `ORDER BY a DESC, b DESC`처럼 **전부 반대**면 같은 인덱스를 거꾸로 읽는다.
- 하지만 **섞이면** (`a ASC, b DESC`) 인덱스를 그렇게 정의해야 정렬을 생략할 수 있다.
- 원서 주의: MySQL(원서 시점 5.6)은 인덱스 정의의 ASC/DESC를 무시한다. (보충: MySQL 8.0부터는 내림차순 인덱스를 지원한다.)

```sql
CREATE INDEX idx_posts ON posts (tenant_id ASC, created_at DESC);
-- ORDER BY tenant_id, created_at DESC 에 적합
```

- NULL이 앞에 올지 뒤에 올지(`NULLS FIRST/LAST`)는 표준이 정하지 않아 DB마다 기본이 다르다. 원서: `ORDER BY`와 인덱스 정의 양쪽에서 이를 완전히 지원하는 곳은 PostgreSQL(8.3+)뿐이고, MySQL 5.6은 아예 지원하지 않는다. (보충) MySQL은 NULL을 가장 작은 값으로 다룬다.

#### 6.3 GROUP BY

- GROUP BY는 두 가지 방식으로 실행된다: **해시**(해시 테이블에 집계) 또는 **정렬 후 집계**. 후자는 인덱스로 정렬을 대체할 수 있다.
- `WHERE`와 `GROUP BY` 컬럼이 인덱스 순서에 맞으면 스트리밍 방식으로 집계된다. 하지만 대개 GROUP BY 최적화의 핵심은 **넓은 범위의 행을 먼저 줄이는 인덱스 WHERE**다.
- 원서: 파이프라인 GROUP BY도 파이프라인 ORDER BY와 같은 조건(범위가 여러 값에 걸치면 깨짐)이 필요하다. 해시 방식은 집계 결과만 메모리에 두므로 메모리를 덜 쓴다. MySQL 5.6은 해시 방식을 안 쓴다. PostgreSQL은 NULLS LAST 인덱스를 GROUP BY에 쓰려면 ORDER BY를 추가해야 한다.
- (보충) 리포트/대시보드용 집계가 무거워지면 인덱스만으로 한계가 있다. **사전 집계 테이블(Materialized View, Rollup 테이블), 캐시, 읽기 전용 복제본**을 고려한다. 원서에 없는 일반 조언이다.

> 📖 원문: 6장 Indexing Order By, Indexing ASC/DESC/NULLS, Indexing Group By

---

### 7. 페이징: OFFSET vs Keyset (Seek)

API의 목록 조회는 SaaS의 가장 흔한 쿼리다. 여기서 성능 차이가 크게 난다.

#### 7.1 Top-N과 LIMIT

- "최근 20개"처럼 일부만 필요할 때는 반드시 `LIMIT`(또는 `FETCH FIRST n ROWS ONLY`)을 **쿼리에 명시**한다. DB가 "일부만 필요함"을 알아야 인덱스 순서로 읽다가 멈추는 계획을 고를 수 있다.
- 앱에서 전부 읽어 온 뒤 잘라내는 것은 최악이다.
- 이 최적화가 통하려면 `ORDER BY`가 **인덱스로 처리(6.1)** 되어야 한다. 그렇지 않으면 전체를 읽고 정렬한 후 상위 N개를 고른다.

#### 7.2 OFFSET 방식

```sql
SELECT * FROM posts WHERE tenant_id = $1
ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 4000;
```

- 장점: 구현이 쉽고 임의 페이지(예: 201페이지)로 점프 가능.
- 단점 2가지:
  1. **뒤 페이지로 갈수록 느려진다.** DB가 앞의 4000행을 세면서 읽고 버리기 때문이다.
  2. **페이지가 밀린다(drift).** 페이지 사이에 새 행이 들어오거나 삭제되면 같은 항목이 중복되거나 누락된다.

#### 7.3 Keyset(Seek) 방식

"이전 페이지의 **마지막 행 값**보다 뒤에 있는 것"을 조건으로 건다.

```sql
-- 인덱스: (tenant_id, created_at DESC, id DESC)
SELECT * FROM posts
WHERE tenant_id = $1
  AND (created_at, id) < ($2, $3)      -- 마지막 행의 (created_at, id)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

- 인덱스에서 바로 그 위치로 점프하므로 **몇 번째 페이지든 속도가 일정**하다. 새 행이 들어와도 결과가 흔들리지 않는다.
- 필수 조건: **결정적(deterministic) 정렬**. `created_at`만으로는 같은 값이 여러 개일 수 있어 행을 건너뛴다. **유일한 컬럼(`id`)을 마지막 정렬 키에 추가**한다. 정렬이 비결정적이면 페이징은 무조건 깨진다.
- 행 값(row values) 비교 `(a, b) < (x, y)` 문법은 표준 SQL이지만 지원이 제각각이다. 원서: PostgreSQL은 이를 인덱스 접근에 쓰고, MySQL(당시 5.6)은 값은 맞게 계산하지만 인덱스 접근 조건으로 못 쓴다. SQL Server 2012는 미지원, Oracle은 범위 연산 불가. 그래서 아래처럼 풀어 쓴 "근사" 방식이 쓰인다. (아래 식은 원서 예시와 형태가 다르지만 같은 논리다.)

```sql
WHERE created_at <= $2
  AND (created_at < $2 OR id < $3)   -- 첫 조건이 인덱스 접근용, 두 번째는 중복 제거용
```

- 원서: `(created_at < ?) OR (created_at = ? AND id < ?)`처럼만 쓰면 DB가 전체를 필터로 처리한다. 앞의 중복 조건(`created_at <= ?`)이 인덱스 접근 조건 역할을 한다. 이 조건을 나중에 "불필요해 보인다"며 지우지 않도록 주의한다.
- 단점: 임의 페이지 점프, "이전 페이지" 이동이 불편하다 (비교와 정렬 방향을 모두 뒤집어야 함). **무한 스크롤/"더 보기"** UI에는 이상적이다(원서). (보충) 총 페이지 수 표시도 불편하다.

```ts
// (보충) 커서를 API로 주고받는 예 (개념) — 원서에는 없는 Node.js 예시
interface Cursor { createdAt: string; id: string }
const encode = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url');
const decode = (s: string): Cursor => JSON.parse(Buffer.from(s, 'base64url').toString());

// 다음 커서는 "limit + 1"개를 조회해서 마지막 하나가 있으면 hasNext = true 로 판단
```

| 항목 | OFFSET | Keyset |
|---|---|---|
| 구현 난이도 | 쉬움 | 조금 어려움 |
| 깊은 페이지 성능 | 나빠짐 | 일정 |
| 데이터 변경 시 안정성 | 중복/누락 발생 | 안정 |
| 임의 페이지 이동 | 가능 | 불가 |

- 실무 권장: 목록이 커질 수 있는 API(로그, 알림, 피드, 주문 내역)는 **Keyset(커서 기반)**, 관리자 화면의 작은 테이블은 OFFSET도 무방.
- (보충) `COUNT(*)`로 전체 개수를 매번 구하는 것도 비싸다 (큰 테이블에서는 넓은 범위 스캔). 꼭 필요한 화면이 아니면 빼거나 근사치를 쓴다. 원서에 없는 조언이다.
- 원서에는 윈도 함수(`ROW_NUMBER`)로 페이징하는 방법도 나오지만, PostgreSQL은 그 방식에서 인덱스 스캔을 일찍 멈추지 못해 비효율적이라고 한다. 이 문서는 다루지 않는다.

> 🔗 NestJS 연결 (보충): 커서/페이지 파라미터는 DTO + `ValidationPipe`로 검증(limit 최대값 제한 필수), 응답 포맷은 `Interceptor`로 `{ items, nextCursor }` 형태로 통일한다.

> 📖 원문: 7장 Querying Top-N Rows, Paging Through Results

---

### 8. 조인(Join)과 N+1 문제

#### 8.1 조인 알고리즘 3가지 (개념만)

조인은 한 번에 **두 테이블씩** 처리한다. 옵티마이저가 순서와 방식을 고른다.

| 방식 | 동작 | 잘 맞는 상황 | 인덱스 전략 |
|---|---|---|---|
| **Nested Loops** | 바깥 결과의 각 행마다 안쪽 테이블을 인덱스로 조회 | 바깥 결과가 **적을 때** (OLTP 요청의 대부분) | **조인 컬럼(FK)에 인덱스**가 필수 |
| **Hash Join** | 한쪽을 메모리 해시 테이블로 만들어 다른 쪽이 조회 | 양쪽이 **많은 행**일 때 (리포트/집계) | 조인 컬럼 인덱스는 도움 안 됨. **각 테이블의 독립 WHERE 조건**에 인덱스 |
| **Sort Merge** | 양쪽을 정렬해서 병합 | 양쪽이 이미 정렬돼 있을 때 강점. 양쪽 정렬 비용이 커서 실제로는 드물게 쓰임(대개 해시 조인이 우세) | Hash Join과 같음(독립 WHERE 조건에 인덱스, 조인 컬럼 인덱스는 무의미). 조인 순서와 무관하게 대칭이라 outer join에 유리 |

- 실무 요점:
  - 원서: Nested Loops의 안쪽 테이블은 **조인 조건 컬럼에 인덱스**(복합키면 복합 인덱스)가 필요하다. 예: `sales (subsidiary_id, employee_id)`. Hash Join은 조인 컬럼 인덱스가 필요 없다.
  - (보충) 이를 실무 규칙으로 옮기면 **외래키(FK) 컬럼에는 인덱스를 만든다.** PostgreSQL은 FK에 인덱스를 자동 생성하지 않는다(MySQL InnoDB는 자동 생성). 부모 삭제/수정 시 자식 테이블 검색에도 쓰인다. 이 FK 관련 내용은 원서에 없는 일반 지식이다.
  - 조인 결과가 필요 이상으로 크면 **조회 컬럼을 줄이고**(원서: 해시 테이블 크기가 줄어 해시 조인이 빨라짐), 조인 전에 **각 테이블에서 필터링**되도록 인덱스를 준다.
  - 조인 테이블 수가 늘면 실행 계획 후보가 급증한다(원서: n! 조합). 바인드 파라미터로 계획 수립 비용을 줄이고(계획 캐시가 있는 DB 기준), 지나치게 복잡한 쿼리는 나눠서 생각한다.
  - **조인은 DB에서 실행**한다(원서 Tip). 앱에서 여러 쿼리로 나누어 붙이면 네트워크 왕복이 늘어난다.

#### 8.2 N+1 문제 (ORM의 함정)

```ts
// (보충) 아래 TypeORM 예시는 원서에 없는 저자 예시다. (원서는 Hibernate/DBIx::Class/Doctrine의 같은 문제를 보여 준다.)
// 나쁨: 사용자 N명 조회(1번) + 사용자마다 주문 조회(N번) = N+1번 쿼리
const users = await userRepo.find({ where: { tenantId } });
for (const u of users) {
  u.orders = await orderRepo.find({ where: { userId: u.id } });
}
```

- 원인: 부모 목록을 가져온 뒤 반복문 안에서 자식을 하나씩 조회 (직접 짜거나, ORM의 **지연 로딩(Lazy loading)** 이 몰래 수행).
- DB 안에서의 조인보다 **네트워크 왕복** 때문에 훨씬 느리다. 응답 시간은 **왕복 횟수**에 크게 좌우된다 (전송량보다 지연이 문제).
- 해결책:

```ts
// 1) JOIN / 관계 미리 로딩
const users = await userRepo.find({ where: { tenantId }, relations: { orders: true } });

// 2) QueryBuilder로 조인 (leftJoinAndSelect는 자식 컬럼을 전부 select한다.
//    컬럼을 줄이려면 leftJoin + addSelect로 필요한 것만 고른다)
const rows = await userRepo.createQueryBuilder('u')
  .leftJoinAndSelect('u.orders', 'o')
  .where('u.tenantId = :tid', { tid: tenantId })
  .getMany();

// 3) IN 절로 한 번에 (2 쿼리로 끝)
const orders = await orderRepo.find({ where: { userId: In(users.map(u => u.id)) } });
// 메모리에서 userId별로 그룹핑
```

- **Eager 로딩을 엔티티 설정에 고정하는 것은 답이 아니다.** 어떤 화면은 자식이 필요하고 어떤 화면은 필요 없다. **쿼리마다 필요한 관계를 명시**하는 것이 정답. (원서: "정적 설정은 해법이 아니다", ORM이 조인을 어떻게 만드는지 알고 직접 통제하라.)
- 1:N 조인은 부모 행이 자식 수만큼 **중복**될 수 있다. 원서: JPA/Hibernate는 자식 30개면 부모가 30번 나오며(명세대로의 동작) 개발자가 중복을 제거해야 한다. 결과 행 수와 페이징(LIMIT)에 주의한다. (보충) 부모 기준 페이징 + 자식 IN 조회 방식이 안전하다.
- **개발 중에 ORM의 SQL 로그를 켜서** 생성되는 쿼리를 주기적으로 확인한다. 운영 배포에 켜진 채 나가는 사고를 조심한다(원서).
  - (보충) TypeORM: `logging: true`, Prisma: `log: ['query']`, Sequelize: `logging: console.log`. (원서는 Hibernate `show_sql`, Doctrine 로거 등을 소개)
- (보충) GraphQL을 쓴다면 DataLoader로 배치 처리를 한다 (N+1의 대표적 재발 지점).

> 🔗 NestJS 연결 (보충): 리포지토리/서비스 계층에서 "필요한 관계를 명시적으로 지정하는 메서드"를 만들고, 개발 환경에서는 TypeORM `logger`/Prisma 쿼리 로그로 요청당 쿼리 수를 확인한다. `Interceptor`로 요청별 쿼리 개수/시간을 측정할 수도 있다.

> 📖 원문: 4장 The Join Operation (Nested Loops, Hash Join, Sort Merge)

---

### 9. 쓰기(INSERT/UPDATE/DELETE)와 인덱스 비용

인덱스는 **읽기를 빠르게 하는 대신 쓰기를 느리게 한다.** 인덱스는 테이블의 중복 복사본이라 쓸 때마다 함께 맞춰야 하기 때문이다.

| 작업 | 인덱스 영향 |
|---|---|
| INSERT | 모든 인덱스에 새 항목 추가 (**인덱스 개수가 곧 곱셈 비용**). 리프가 꽉 차면 분할이 일어남. WHERE가 없어 인덱스 혜택이 전혀 없는 유일한 작업 |
| DELETE | 먼저 SELECT처럼 대상 행을 찾고(여기엔 인덱스가 도움), 이후 모든 인덱스에서 항목을 제거 |
| UPDATE | 변경된 컬럼이 **포함된 인덱스만** 영향. 기존 항목 제거 + 새 위치에 삽입 |

실무 포인트:

- **인덱스는 신중하고 최소한으로.** 첫 번째 인덱스를 추가할 때의 비용 증가가 가장 크고, 이후에도 하나씩 쌓인다. 사용되지 않는 인덱스, 다른 인덱스에 포함되는 중복 인덱스는 지운다.
  - (보충) PostgreSQL: `pg_stat_user_indexes`의 `idx_scan = 0`인 인덱스 점검.
- UPDATE는 **바뀌는 컬럼만** 갱신한다. ORM이 모든 컬럼을 매번 SET하면 관련 없는 인덱스까지 건드리게 된다(원서: Hibernate가 dynamic-update를 끄면 그렇게 동작). (보충) TypeORM에서는 `save()` 대신 변경 필드만 `update()`.
- (보충) 자주 갱신되는 컬럼(`updated_at`, `last_seen_at`, 카운터)을 **여러 인덱스에 넣지 않는다**. 원서의 "바뀐 컬럼이 든 인덱스만 영향받는다"를 응용한 조언이며, 락 경합 언급은 일반 지식이다.
- 대량 적재는 원서에서 "인덱스를 임시로 빼고 로드한 뒤 다시 만드는" 방법(데이터 웨어하우스의 관행)을 소개한다. 서비스 중인 테이블에서는 조심한다. (보충) **배치 INSERT**(여러 행을 한 문장)나 PostgreSQL `COPY`도 자주 쓴다.
- DELETE/UPDATE에도 실행 계획이 있다(원서 Tip). `WHERE`에 인덱스를 못 타면 쓰기 쿼리가 테이블 전체를 훑는다. (보충) 이때 **락을 오래 잡는다**는 것은 일반 지식이다.
- 전체 삭제는 `DELETE`보다 `TRUNCATE`가 훨씬 빠르지만, 원서 기준으로 트리거가 실행되지 않고 암묵적 커밋이 일어나는 부작용이 있다(PostgreSQL은 예외).
- (보충) 대량 삭제/갱신은 한 번에 하지 말고 **작은 배치로 나눠서** 실행해 락과 복제 지연을 피한다.
- 참고(MVCC, 원서 박스): PostgreSQL은 삭제 시 행에 표시만 해 두고 실제 정리와 인덱스 정리는 VACUUM이 한다. 그래서 PostgreSQL의 DELETE 성능은 인덱스 수에 덜 좌우된다. (보충) 대량 UPDATE/DELETE 뒤 테이블 팽창(bloat)을 신경 써야 한다는 부분은 일반 지식이다.

```ts
// (보충) 작은 배치로 오래된 로그 삭제 (PostgreSQL 예) — 원서에 없는 저자 예시
let deleted = 0;
do {
  const r = await db.query(
    `DELETE FROM audit_logs WHERE id IN (
       SELECT id FROM audit_logs WHERE created_at < $1 ORDER BY id LIMIT 5000)`,
    [cutoff],
  );
  deleted = r.rowCount ?? 0;
} while (deleted > 0);
```

> 📖 원문: 8장 Modifying Data (Insert, Delete, Update)

---

### 10. 한눈에 보는 실전 흐름

느린 쿼리를 만났을 때의 순서:

(이 절은 위 내용을 묶은 저자 정리이며 (보충), 도구 이름은 원서에 없다.)

1. **어떤 쿼리인지** 찾는다 (slow query log, `pg_stat_statements`, APM).
2. **`EXPLAIN (ANALYZE)`** 로 실행 계획을 본다 (운영과 비슷한 데이터량으로).
3. 풀 스캔인가? 필터가 넓은가? 정렬이 남았는가? 예상/실제 행 수가 어긋나는가?
4. 쿼리를 고친다: 컬럼에 함수 쓰지 않기, 범위 조건으로 바꾸기, 필요한 컬럼만 SELECT, 동적 조건 조립, keyset 페이징, N+1 제거.
5. 그래도 부족하면 **인덱스를 설계/수정**한다: 등호 컬럼 → 범위 컬럼 → (ORDER BY 컬럼) 순, 기존 인덱스 확장 우선.
6. 다시 `EXPLAIN`으로 확인하고, 쓰기 성능·다른 쿼리에 미치는 영향도 본다.

---

### ✅ 이 부 핵심 체크리스트

- [ ] 인덱스는 **정렬된 복사본**이며, 느린 이유는 대개 "넓은 범위 스캔"과 "테이블 접근 반복"이다 (트리가 망가진 것이 아니다).
- [ ] 복합 인덱스는 **왼쪽 컬럼부터** 쓰인다. 멀티테넌트라면 `tenant_id`를 선두에, **등호 컬럼 → 범위 컬럼** 순서로 설계한다.
- [ ] **인덱스 컬럼에 함수/연산을 씌우지 않는다** (`LOWER()`, `DATE()`, `col + 1`). 필요하면 표현식 인덱스로 통일하고, 날짜는 `>= 시작 AND < 다음날` 범위로 쓴다.
- [ ] 값은 **항상 바인드 파라미터**로 전달한다. 컬럼명/정렬 방향은 허용 목록으로 검증한다.
- [ ] `LIKE '%검색어'`는 인덱스를 못 탄다. 접두사 검색만 인덱스에 맡기고, 부분 검색은 전문 검색(FTS/검색 엔진)으로 넘긴다.
- [ ] **선택적 검색 조건은 쿼리를 동적으로 조립**하고 `(col = $1 OR $1 IS NULL)` 패턴은 피한다.
- [ ] 소프트 삭제·상태값 조회에는 **부분 인덱스**(PostgreSQL)를 고려한다.
- [ ] 성능 문제는 **`EXPLAIN (ANALYZE)`** 부터 본다. 풀 스캔, Filter, Sort, 예상/실제 행 수 불일치를 확인한다. 운영 규모 데이터로 검증한다.
- [ ] 목록 API는 **LIMIT 필수 + 결정적 정렬(마지막에 유니크 컬럼)**, 큰 목록은 **Keyset(커서) 페이징**을 쓴다.
- [ ] 조인 컬럼(FK)에 인덱스를 만들고(보충: PostgreSQL은 FK 인덱스가 자동이 아님), ORM의 **N+1**은 쿼리별로 관계를 명시적 조인/IN 조회로 해결한다. 개발 중 SQL 로그로 쿼리 수를 확인한다.
- [ ] `SELECT *`를 피하고 필요한 컬럼만 조회한다. 커버링 인덱스는 필요할 때만 쓴다.
- [ ] 인덱스는 쓰기 비용이다. **꼭 필요한 인덱스만** 유지하고, 미사용/중복 인덱스는 정리하며, UPDATE는 바뀐 컬럼만 갱신한다. 대량 삭제·갱신은 배치로 나눈다.
