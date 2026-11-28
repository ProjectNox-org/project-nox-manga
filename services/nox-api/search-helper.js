const ACCENT_MAP = {
  á: 'a', à: 'a', â: 'a', ã: 'a', ä: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', ì: 'i', î: 'i', ï: 'i',
  ó: 'o', ò: 'o', ô: 'o', õ: 'o', ö: 'o',
  ú: 'u', ù: 'u', û: 'u', ü: 'u',
  ç: 'c', ñ: 'n',
};

export function foldAccents(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[áàâãäéèêëíìîïóòôõöúùûüçñ]/g, (ch) => ACCENT_MAP[ch] || ch);
}

export function escapeLike(value) {
  return String(value || '').replace(/[\\%_]/g, '\\$&');
}

/**
 * Builds a parameterized SQL condition matching PT-BR primary titles,
 * English/foreign aliases (KO/JA/ZH/Romaji), accent-folded and case-folded
 * variants, partial substrings, and exact canonical slugs without 1:N JOINs.
 */
export function buildWorkSearchCondition(aliasPrefix, rawQuery, startParamIndex) {
  const clean = String(rawQuery || '').trim().replace(/\s+/g, ' ');
  if (!clean) return { clause: '', params: [] };

  const folded = foldAccents(clean);
  const rawPat = '%' + escapeLike(clean) + '%';
  const foldedPat = '%' + escapeLike(folded) + '%';
  const slugExact = folded
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const params = [rawPat];
  const parts = [`${aliasPrefix}search_text ILIKE $${startParamIndex}`];

  if (folded !== clean.toLowerCase()) {
    params.push(foldedPat);
    parts.push(`${aliasPrefix}search_text ILIKE $${startParamIndex + params.length - 1}`);
  }

  if (slugExact) {
    params.push(slugExact);
    parts.push(`${aliasPrefix}slug = $${startParamIndex + params.length - 1}`);
  }

  return {
    clause: '(' + parts.join(' OR ') + ')',
    params,
  };
}
