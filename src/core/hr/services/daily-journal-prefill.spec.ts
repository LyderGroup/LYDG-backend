import { DailyJournalService, type JournalTaskLine } from './daily-journal.service';

/**
 * Pré-remplissage du rapport journalier depuis les tâches cochées au pointage
 * de départ.
 *
 * Ce qu'on verrouille ici, ce sont les trois promesses faites à l'utilisateur :
 * son texte n'est jamais écrasé, un rapport déjà soumis n'est plus touché, et
 * un échec ne remonte jamais (le pointage de départ doit aboutir).
 */
describe('DailyJournalService — pré-remplissage depuis les tâches', () => {
  const HEADER = '— Tâches déclarées terminées —';

  const makeService = (existing: any | null) => {
    const saved: any[] = [];
    const repo = {
      findOne: jest.fn().mockResolvedValue(existing),
      create: jest.fn((v: any) => ({ ...v })),
      save: jest.fn((v: any) => {
        saved.push(v);
        return Promise.resolve(v);
      }),
    };
    const svc = new DailyJournalService(
      repo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    return { svc, repo, saved };
  };

  const tasks: JournalTaskLine[] = [
    { title: 'Maquette du tunnel', projectName: 'Refonte site', isFinal: true, stepName: 'Terminé' },
    { title: 'Correctif panier', projectName: 'Refonte site', isFinal: false, stepName: 'Revue' },
    { title: 'Note de cadrage', projectName: null, isFinal: true, stepName: 'Terminé' },
  ];

  it('ne fait rien quand aucune tâche n’est cochée', async () => {
    const { svc, repo } = makeService(null);
    await expect(
      svc.prefillFromCompletedTasks({ employeeId: 'e1', date: '2026-08-03', tasks: [] }),
    ).resolves.toBeNull();
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it('crée un brouillon groupé par projet, non soumis', async () => {
    const { svc, saved } = makeService(null);
    await svc.prefillFromCompletedTasks({ employeeId: 'e1', date: '2026-08-03', tasks });

    const j = saved[0];
    expect(j.isSubmitted).toBe(false);
    expect(j.accomplishments).toContain(HEADER);
    expect(j.accomplishments).toContain('Refonte site :');
    expect(j.accomplishments).toContain('Sans projet :');
    expect(j.accomplishments).toContain('Maquette du tunnel');
  });

  it('signale les tâches en attente de validation', async () => {
    const { svc, saved } = makeService(null);
    await svc.prefillFromCompletedTasks({ employeeId: 'e1', date: '2026-08-03', tasks });

    // Une tâche non finale doit être annoncée comme telle, sinon le manager
    // croirait qu'elle est close.
    expect(saved[0].accomplishments).toContain('Correctif panier (en attente de validation — Revue)');
    expect(saved[0].accomplishments).toMatch(/- Maquette du tunnel\n/);
  });

  it('ajoute à la suite du texte saisi sans l’écraser', async () => {
    const { svc, saved } = makeService({
      isSubmitted: false,
      accomplishments: 'Réunion client le matin.',
    });
    await svc.prefillFromCompletedTasks({ employeeId: 'e1', date: '2026-08-03', tasks });

    expect(saved[0].accomplishments).toContain('Réunion client le matin.');
    expect(saved[0].accomplishments).toContain(HEADER);
    expect(saved[0].accomplishments.indexOf('Réunion client'))
      .toBeLessThan(saved[0].accomplishments.indexOf(HEADER));
  });

  it('remplace le bloc généré précédent au lieu de l’empiler', async () => {
    const { svc, saved } = makeService({
      isSubmitted: false,
      accomplishments: `Note manuelle.\n\n${HEADER}\nRefonte site :\n  - Ancienne tâche`,
    });
    await svc.prefillFromCompletedTasks({ employeeId: 'e1', date: '2026-08-03', tasks });

    const text: string = saved[0].accomplishments;
    expect(text).toContain('Note manuelle.');
    expect(text).not.toContain('Ancienne tâche');
    // Un seul bloc généré, pas deux.
    expect(text.split(HEADER).length - 1).toBe(1);
  });

  it('ne touche pas à un rapport déjà soumis', async () => {
    const existing = { isSubmitted: true, accomplishments: 'Rapport validé.' };
    const { svc, repo } = makeService(existing);
    const out = await svc.prefillFromCompletedTasks({ employeeId: 'e1', date: '2026-08-03', tasks });

    expect(out).toBe(existing);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('n’échoue jamais : une erreur de base rend null', async () => {
    const { svc, repo } = makeService(null);
    repo.save.mockRejectedValueOnce(new Error('DB indisponible'));

    // Le pointage de départ appelle cette méthode : elle ne doit pas lever.
    await expect(
      svc.prefillFromCompletedTasks({ employeeId: 'e1', date: '2026-08-03', tasks }),
    ).resolves.toBeNull();
  });
});
