import type { MigrationInterface, QueryRunner } from 'typeorm';

export class VietnameseSearch1794820000000 implements MigrationInterface {
  name = 'VietnameseSearch1794820000000';
  async up(queryRunner: QueryRunner) {
    // NFC handles decomposed Vietnamese input; translate is independent of DB locale.
    const groups = {
      a: 'àáạảãâầấậẩẫăằắặẳẵ',
      e: 'èéẹẻẽêềếệểễ',
      i: 'ìíịỉĩ',
      o: 'òóọỏõôồốộổỗơờớợởỡ',
      u: 'ùúụủũưừứựửữ',
      y: 'ỳýỵỷỹ',
      d: 'đ',
    };
    let source = '',
      target = '';
    for (const [ascii, letters] of Object.entries(groups)) {
      source += letters + letters.toUpperCase();
      target += ascii.repeat(letters.length * 2);
    }
    await queryRunner.query(`CREATE FUNCTION safeops_fold(text) RETURNS text
      LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
      AS $$ SELECT lower(translate(normalize($1, NFC), '${source}', '${target}')) $$`);
    await queryRunner.query(
      'CREATE INDEX "IDX_incidents_coordinates" ON incidents (latitude, longitude)',
    );
  }
  async down(queryRunner: QueryRunner) {
    await queryRunner.query('DROP INDEX "IDX_incidents_coordinates"');
    await queryRunner.query('DROP FUNCTION safeops_fold(text)');
  }
}
