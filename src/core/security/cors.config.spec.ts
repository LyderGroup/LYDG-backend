import {
  corsOriginCallback,
  getAllowedOrigins,
  isOriginAllowed,
  resetOriginsCache,
} from './cors.config';

describe('cors.config', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    delete process.env.CORS_ALLOW_VERCEL_PREVIEWS;
    delete process.env.CORS_VERCEL_PROJECT;
    process.env.NODE_ENV = 'test';
    resetOriginsCache();
  });

  afterAll(() => {
    process.env = savedEnv;
  });

  it('autorise les origines par défaut', () => {
    expect(isOriginAllowed('http://localhost:5173')).toBe(true);
    expect(isOriginAllowed('https://lydg-sooty.vercel.app')).toBe(true);
  });

  it('refuse une origine inconnue', () => {
    expect(isOriginAllowed('https://evil.example.com')).toBe(false);
  });

  it('refuse une origine absente', () => {
    expect(isOriginAllowed(undefined)).toBe(false);
    expect(isOriginAllowed(null)).toBe(false);
  });

  // RÉGRESSION — la liste était figée au chargement du module, donc AVANT que
  // ConfigModule n'ait chargé le .env : CORS_ALLOWED_ORIGINS était ignorée
  // sans le moindre message. L'évaluation doit être paresseuse.
  it('prend en compte CORS_ALLOWED_ORIGINS définie après l\'import du module', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://liveydream.com';
    resetOriginsCache();

    expect(isOriginAllowed('https://liveydream.com')).toBe(true);
    expect(getAllowedOrigins()).toContain('https://liveydream.com');
  });

  it('accepte plusieurs origines et ignore les espaces et slashs finaux', () => {
    process.env.CORS_ALLOWED_ORIGINS =
      ' https://a.example.com/ , https://b.example.com ,, ';
    resetOriginsCache();

    expect(isOriginAllowed('https://a.example.com')).toBe(true);
    expect(isOriginAllowed('https://b.example.com')).toBe(true);
    expect(getAllowedOrigins()).not.toContain('');
  });

  describe('previews Vercel', () => {
    it('sont refusées tant que le flag est absent', () => {
      expect(isOriginAllowed('https://lydg-sooty-git-main-x.vercel.app')).toBe(false);
    });

    it('sont acceptées pour le projet configuré une fois le flag actif', () => {
      process.env.CORS_ALLOW_VERCEL_PREVIEWS = 'true';
      process.env.CORS_VERCEL_PROJECT = 'lydg-sooty';
      resetOriginsCache();

      expect(isOriginAllowed('https://lydg-sooty-git-main-equipe.vercel.app')).toBe(true);
    });

    it('n\'ouvrent pas la porte aux autres projets vercel.app', () => {
      process.env.CORS_ALLOW_VERCEL_PREVIEWS = 'true';
      process.env.CORS_VERCEL_PROJECT = 'lydg-sooty';
      resetOriginsCache();

      expect(isOriginAllowed('https://attaquant.vercel.app')).toBe(false);
      expect(isOriginAllowed('https://autre-projet-git-main-x.vercel.app')).toBe(false);
    });
  });

  describe('corsOriginCallback', () => {
    it('autorise une origine connue', () => {
      const cb = jest.fn();
      corsOriginCallback('http://localhost:5173', cb);
      expect(cb).toHaveBeenCalledWith(null, true);
    });

    it('rejette une origine inconnue', () => {
      const cb = jest.fn();
      corsOriginCallback('https://evil.example.com', cb);
      expect(cb).toHaveBeenCalledWith(expect.any(Error), false);
    });

    it('autorise les requêtes sans origin hors production (curl, Postman)', () => {
      const cb = jest.fn();
      corsOriginCallback(undefined, cb);
      expect(cb).toHaveBeenCalledWith(null, true);
    });

    it('refuse les requêtes sans origin en production', () => {
      process.env.NODE_ENV = 'production';
      const cb = jest.fn();
      corsOriginCallback(undefined, cb);
      expect(cb).toHaveBeenCalledWith(null, false);
    });
  });
});
