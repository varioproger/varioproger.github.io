// 19장 19.1절 대응 - recipes / idempotency_keys 테이블 스키마 마이그레이션.

/**
 * 마이그레이션은 항상 up/down 을 짝으로 쓴다.
 * 배포가 잘못됐을 때 되돌릴 방법이 없으면 롤백이 곧 장애 연장이 된다.
 *
 * @param {import('knex').Knex} knex
 */
export async function up(knex) {
  // uuid 생성 함수를 DB 쪽에서도 쓸 수 있게 한다(애플리케이션이 id 를 만들지만,
  // 시드/수동 삽입 때 편하다). pgcrypto 의 gen_random_uuid() 는 PG13+ 내장.
  await knex.raw('create extension if not exists "pgcrypto"');

  await knex.schema.createTable('recipes', (table) => {
    // uuid 를 쓰는 이유: 서비스가 여러 인스턴스로 뜨므로 시퀀스 채번을 위해
    // DB 왕복을 하기보다 애플리케이션에서 id 를 만들고 그대로 쓰는 편이 낫다.
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('title', 200).notNullable();
    // jsonb: 재료 목록은 스키마가 유연하고 통째로 읽고 쓰는 값이다.
    // json 이 아니라 jsonb 를 쓰는 이유는 인덱싱과 연산자 지원 때문이다.
    table.jsonb('ingredients').notNullable().defaultTo('[]');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // 커서 페이지네이션이 (created_at desc, id desc) 로 훑으므로
    // 정확히 그 순서의 복합 인덱스를 만들어 준다. 없으면 매 페이지가 정렬 비용을 낸다.
    table.index(['created_at', 'id'], 'recipes_created_at_id_idx');
  });

  await knex.schema.createTable('idempotency_keys', (table) => {
    // 키 자체가 기본 키다. 유니크 제약이 곧 "중복 처리 방지" 장치가 된다.
    table.string('key', 200).primary();
    // 처음 성공한 응답을 통째로 저장해 두었다가 재요청 때 그대로 돌려준다.
    table.jsonb('response').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // 오래된 키를 주기적으로 지우기 위한 인덱스.
    // 키를 영원히 두면 테이블이 무한히 커진다(보통 24시간~7일 보관).
    table.index(['created_at'], 'idempotency_keys_created_at_idx');
  });
}

/** @param {import('knex').Knex} knex */
export async function down(knex) {
  // 생성의 역순으로 지운다(참조 관계가 생겼을 때를 대비한 습관).
  await knex.schema.dropTableIfExists('idempotency_keys');
  await knex.schema.dropTableIfExists('recipes');
  // 확장은 다른 스키마가 쓸 수 있으므로 되돌리지 않는다.
}
