import { AttendanceService } from './attendance.service';

/**
 * Règle métier : un pointage effectué un jour NON travaillé ne doit jamais
 * compter comme un retard. On enregistre la présence et les heures, sans
 * heure d'arrivée attendue, donc sans sanction disciplinaire.
 *
 * `isWorkDay` est privée : on y accède via un cast, le but étant de figer la
 * règle elle-même plutôt que sa mise en forme.
 */
describe('AttendanceService — jours travaillés', () => {
  const isWorkDay = (workDays: string[] | null | undefined, date: Date): boolean =>
    (AttendanceService.prototype as any).isWorkDay.call(null, workDays, date);

  // 2026-08-03 est un lundi, 2026-08-08 un samedi, 2026-08-09 un dimanche.
  const lundi = new Date(2026, 7, 3);
  const samedi = new Date(2026, 7, 8);
  const dimanche = new Date(2026, 7, 9);

  describe('planning classique lun-ven', () => {
    const semaine = ['mon', 'tue', 'wed', 'thu', 'fri'];

    it('reconnaît un jour travaillé', () => {
      expect(isWorkDay(semaine, lundi)).toBe(true);
    });

    it('exclut le samedi et le dimanche', () => {
      expect(isWorkDay(semaine, samedi)).toBe(false);
      expect(isWorkDay(semaine, dimanche)).toBe(false);
    });
  });

  describe('planning partiel', () => {
    it('exclut un jour de semaine non planifié', () => {
      // mardi 2026-08-04, alors que l'employé ne travaille que lun/mer/ven
      const mardi = new Date(2026, 7, 4);
      expect(isWorkDay(['mon', 'wed', 'fri'], mardi)).toBe(false);
      expect(isWorkDay(['mon', 'wed', 'fri'], lundi)).toBe(true);
    });
  });

  describe('absence de planning', () => {
    // Rétrocompatibilité : sans horaire défini, tous les jours restent
    // travaillés — sinon on cesserait de compter les retards des employés
    // dont la colonne n'a jamais été renseignée.
    it('traite tous les jours comme travaillés si null', () => {
      expect(isWorkDay(null, samedi)).toBe(true);
      expect(isWorkDay(undefined, dimanche)).toBe(true);
    });

    it('traite tous les jours comme travaillés si tableau vide', () => {
      expect(isWorkDay([], samedi)).toBe(true);
    });

    it('ignore les entrées vides', () => {
      expect(isWorkDay(['', '  '], samedi)).toBe(true);
    });
  });

  describe('tolérance de notation', () => {
    it('accepte la forme longue et la casse', () => {
      expect(isWorkDay(['Monday'], lundi)).toBe(true);
      expect(isWorkDay(['MON'], lundi)).toBe(true);
      expect(isWorkDay([' mon '], lundi)).toBe(true);
    });

    it('ne confond pas deux jours distincts', () => {
      expect(isWorkDay(['sun'], samedi)).toBe(false);
      expect(isWorkDay(['sat'], dimanche)).toBe(false);
    });
  });
});
