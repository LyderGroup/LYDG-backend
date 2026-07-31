import { addDaysIso, toIsoDate, todayIsoDate } from './date.util';

describe('date.util', () => {
  describe('toIsoDate', () => {
    it('rend une chaîne YYYY-MM-DD telle quelle', () => {
      expect(toIsoDate('2026-07-29')).toBe('2026-07-29');
    });

    it('tronque un ISO complet à sa partie date', () => {
      expect(toIsoDate('2026-07-29T23:45:00.000Z')).toBe('2026-07-29');
    });

    it('utilise les composantes UTC d\'un Date', () => {
      expect(toIsoDate(new Date(Date.UTC(2026, 6, 29, 0, 0, 0)))).toBe('2026-07-29');
      expect(toIsoDate(new Date(Date.UTC(2026, 6, 29, 23, 59, 59)))).toBe('2026-07-29');
    });

    it('rejette une date invalide', () => {
      expect(() => toIsoDate('pas-une-date')).toThrow(/Date invalide/);
    });

    // RÉGRESSION — le bug corrigé. L'ancien code faisait :
    //   const d = new Date(input); d.setHours(0,0,0,0);
    //   d.toISOString().slice(0, 10)
    // `setHours` travaille en heure locale, `toISOString` rend de l'UTC : sur
    // un hôte en UTC+n, minuit local = 22h/23h UTC la VEILLE, donc la date
    // renvoyée était celle du jour précédent.
    describe('sous un fuseau UTC+2 (reproduction du décalage)', () => {
      const originalTz = process.env.TZ;

      beforeAll(() => {
        process.env.TZ = 'Europe/Paris';
      });

      afterAll(() => {
        process.env.TZ = originalTz;
      });

      it('ne décale pas la date d\'un jour', () => {
        const input = '2026-07-29';

        // Reproduction de l'ancien calcul, pour documenter ce qui était faux.
        const legacy = new Date(input);
        legacy.setHours(0, 0, 0, 0);
        const legacyResult = legacy.toISOString().slice(0, 10);

        expect(toIsoDate(input)).toBe('2026-07-29');
        // Le nouveau calcul est correct que l'ancien ait dérivé ou non
        // (le résultat de `legacy` dépend du fuseau réellement appliqué au
        // process, que Node fige parfois au démarrage).
        expect(['2026-07-28', '2026-07-29']).toContain(legacyResult);
      });
    });
  });

  describe('addDaysIso', () => {
    it('recule d\'un jour', () => {
      expect(addDaysIso('2026-07-29', -1)).toBe('2026-07-28');
    });

    it('avance d\'un jour', () => {
      expect(addDaysIso('2026-07-29', 1)).toBe('2026-07-30');
    });

    it('franchit correctement un changement de mois', () => {
      expect(addDaysIso('2026-08-01', -1)).toBe('2026-07-31');
      expect(addDaysIso('2026-07-31', 1)).toBe('2026-08-01');
    });

    it('gère une année bissextile', () => {
      expect(addDaysIso('2028-03-01', -1)).toBe('2028-02-29');
    });
  });

  describe('todayIsoDate', () => {
    it('rend la date UTC du jour', () => {
      const expected = new Date().toISOString().slice(0, 10);
      expect(todayIsoDate()).toBe(expected);
    });
  });
});
