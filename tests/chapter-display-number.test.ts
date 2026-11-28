import { describe, expect, it } from 'vitest';
import { chapterDisplayNumber, chapterIdentityLabel } from '../src/lib/chapter-identity';

const show = (display_number: string | null, number?: string | number | null) =>
  chapterDisplayNumber({ display_number, number });

describe('chapterDisplayNumber', () => {
  it('rende inteiros migrados como `.00` sem os zeros', () => {
    expect(show('1.00')).toBe('1');
    expect(show('100.00')).toBe('100');
    expect(show('0.00')).toBe('0');
    expect(show(null, 9)).toBe('9');
  });

  it('preserva fracionarios e especiais legitimos', () => {
    for (const label of ['1.02', '1.03', '1.5', '12.10', '3.50', '370.50', '10.30']) {
      expect(show(label)).toBe(label);
    }
    expect(show('Prólogo')).toBe('Prólogo');
  });

  it('cai no fallback apenas quando nao ha numero', () => {
    expect(show(null, null)).toBe('Especial');
    expect(show('', '')).toBe('Especial');
  });

  it('nao altera o rotulo com qualificadores de edicao', () => {
    expect(chapterIdentityLabel({ display_number: '12.00', edition: 'scan' })).toBe('12 · scan');
  });
});
