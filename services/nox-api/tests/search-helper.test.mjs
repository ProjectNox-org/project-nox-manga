import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkSearchCondition,
  buildWorkSearchRelevanceOrder,
  escapeLike,
  foldAccents,
} from '../search-helper.js';

test('foldAccents normalizes PT-BR diacritics consistently with PostgreSQL index_work_search', () => {
  assert.equal(foldAccents('O Começo Depois do Fim'), 'o comeco depois do fim');
  assert.equal(foldAccents('Nível Único — Ação'), 'nivel unico — acao');
});

test('escapeLike escapes SQL LIKE wildcards safely', () => {
  assert.equal(escapeLike('100%_test\\ok'), '100\\%\\_test\\\\ok');
});

test('buildWorkSearchCondition generates parameterized raw, folded, and slug predicates for accented PT-BR queries', () => {
  const res = buildWorkSearchCondition('w.', 'O Começo Depois do Fim', 3);
  assert.equal(
    res.clause,
    '(w.search_text ILIKE $3 OR w.search_text ILIKE $4 OR w.slug = $5)',
  );
  assert.deepEqual(res.params, [
    '%O Começo Depois do Fim%',
    '%o comeco depois do fim%',
    'o-comeco-depois-do-fim',
  ]);
});

test('buildWorkSearchCondition avoids duplicate ILIKE param for ASCII/English queries and handles CJK without empty slug', () => {
  const en = buildWorkSearchCondition('w.', 'The Beginning After the End', 3);
  assert.equal(en.clause, '(w.search_text ILIKE $3 OR w.slug = $4)');
  assert.deepEqual(en.params, ['%The Beginning After the End%', 'the-beginning-after-the-end']);

  const ko = buildWorkSearchCondition('w.', '나 혼자만 레벨업', 1);
  assert.equal(ko.clause, '(w.search_text ILIKE $1)');
  assert.deepEqual(ko.params, ['%나 혼자만 레벨업%']);
});

test('catalog.js count filter placeholder shifting stays aligned across search + kind + status params', () => {
  const fp = [];
  const cond = [];
  const s = buildWorkSearchCondition('w.', 'O Começo', fp.length + 3);
  fp.push(...s.params);
  cond.push(s.clause);
  fp.push('MANHWA');
  cond.push('w.kind::text = $' + (fp.length + 2));
  fp.push('ONGOING');
  cond.push('w.status::text = $' + (fp.length + 2));

  const filtro = 'WHERE ' + cond.join(' AND ');
  const filtroTot = filtro.replace(/\$(\d+)/g, (_, d) => '$' + (Number(d) - 2));

  assert.equal(
    filtro,
    'WHERE (w.search_text ILIKE $3 OR w.search_text ILIKE $4 OR w.slug = $5) AND w.kind::text = $6 AND w.status::text = $7',
  );
  assert.equal(
    filtroTot,
    'WHERE (w.search_text ILIKE $1 OR w.search_text ILIKE $2 OR w.slug = $3) AND w.kind::text = $4 AND w.status::text = $5',
  );
  assert.equal(fp.length, 5);
});

test('buildWorkSearchRelevanceOrder builds parameterized exact-match priority tiers for Latin and CJK queries', () => {
  const latin = buildWorkSearchRelevanceOrder('w.', 'Solo Leveling', 5);
  assert.match(latin.orderPrefix, /lower\(w\.title\) = \$5 OR w\.slug = \$7/);
  assert.match(latin.orderPrefix, /unnest\(COALESCE\(w\.aliases, ARRAY\[\]::text\[\]\)\) _a WHERE lower\(_a\) = \$5/);
  assert.match(latin.orderPrefix, /w\.title ILIKE \$6/);
  assert.deepEqual(latin.params, ['solo leveling', 'Solo Leveling%', 'solo-leveling']);

  const cjk = buildWorkSearchRelevanceOrder('w.', '나 혼자만 레벨업', 4);
  assert.match(cjk.orderPrefix, /lower\(w\.title\) = \$4 THEN 0/);
  assert.deepEqual(cjk.params, ['나 혼자만 레벨업', '나 혼자만 레벨업%']);
});
