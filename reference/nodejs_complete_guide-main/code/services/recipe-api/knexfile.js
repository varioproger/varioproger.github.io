// 19장 19.1절 대응 - knex 마이그레이션 설정(런타임 질의는 pg 풀을 직접 쓴다).
export default {
  client: 'pg',
  connection: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/recipes',
  pool: { min: 0, max: 2 }, // 마이그레이션 전용이라 커넥션을 많이 쓸 이유가 없다.
  migrations: {
    directory: './src/db/migrations',
    tableName: 'knex_migrations',
    loadExtensions: ['.js'],
  },
};
