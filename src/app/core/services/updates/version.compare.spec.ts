// core/services/updates/version.compare.spec.ts
import { parseVersion, compareVersions } from './version.compare';

describe('version.compare — parseVersion', () => {
  it('parsea una versión estable', () => {
    expect(parseVersion('1.2.3')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      stage: null,
      num: 0,
    });
  });

  it('normaliza el prefijo v', () => {
    expect(parseVersion('v1.0.0')).toEqual(parseVersion('1.0.0'));
  });

  it('parsea las etapas alpha/beta/rc', () => {
    expect(parseVersion('0.0.0-alpha.4')).toEqual({
      major: 0,
      minor: 0,
      patch: 0,
      stage: 'alpha',
      num: 4,
    });
    expect(parseVersion('1.0.0-beta.2')?.stage).toBe('beta');
    expect(parseVersion('1.0.0-beta.2')?.num).toBe(2);
    expect(parseVersion('1.0.0-rc.1')?.stage).toBe('rc');
  });

  it('strip del prefijo dev- ANTES de la v', () => {
    expect(parseVersion('dev-v0.0.0-alpha.5')).toEqual(
      parseVersion('0.0.0-alpha.5'),
    );
  });

  it('devuelve null para formatos fuera de la convención', () => {
    expect(parseVersion('banana')).toBeNull();
    expect(parseVersion('1.0')).toBeNull();
    expect(parseVersion('1.0.0-gamma.1')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });
});

describe('version.compare — compareVersions', () => {
  // [a, b, resultado esperado] — el resultado es compareVersions(a, b)
  const cases: Array<[string, string, -1 | 0 | 1]> = [
    // alpha vs stable, misma base → stable gana
    ['0.0.0-alpha.4', '0.0.0', -1],
    ['0.0.0', '0.0.0-alpha.4', 1],
    // base distinta gana aunque la etapa sea menor (no empuja alpha a prod)
    ['1.0.0', '1.0.1-alpha.1', -1],
    ['1.0.1-alpha.1', '1.0.0', 1],
    // etapa más madura gana con misma base
    ['1.0.0-beta.2', '1.0.0-alpha.9', 1],
    ['1.0.0-alpha.9', '1.0.0-beta.2', -1],
    ['1.0.0-rc.1', '1.0.0-beta.9', 1],
    ['1.0.0', '1.0.0-rc.1', 1],
    // base distinta en cualquier etapa
    ['1.1.0-alpha.1', '1.0.9', 1],
    ['1.0.9', '1.1.0-alpha.1', -1],
    // misma base + misma etapa → gana el número N
    ['1.0.0-alpha.5', '1.0.0-alpha.4', 1],
    ['1.0.0-alpha.4', '1.0.0-alpha.5', -1],
    // iguales
    ['1.0.0', '1.0.0', 0],
    ['1.0.0-alpha.4', '1.0.0-alpha.4', 0],
    // prefijos normalizados
    ['v1.0.0', '1.0.0', 0],
    ['dev-v0.0.0-alpha.5', '0.0.0-alpha.5', 0],
    ['0.0.0-alpha.5', 'dev-v0.0.0-alpha.6', -1],
    ['dev-v0.0.0-alpha.6', '0.0.0-alpha.5', 1],
  ];

  it.each(cases)('%s vs %s → %s', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });

  it('lanza si alguna versión es inválida', () => {
    expect(() => compareVersions('1.0.0', 'nope')).toThrow();
    expect(() => compareVersions('nope', '1.0.0')).toThrow();
  });
});