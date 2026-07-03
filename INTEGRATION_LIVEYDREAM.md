# 📘 Intégration API Carrières — liveydream.com

Documentation à destination du développeur du site **liveydream.com** pour intégrer le flux d'offres d'emploi.

Quand un client de l'ERP LYDG publie une offre depuis son back-office, elle devient automatiquement consommable par les 3 endpoints décrits ci-dessous. Aucune authentification n'est requise.

---

## 1. Informations de connexion

| | Dev (test) | Prod (à confirmer) |
|--|--|--|
| **Base URL** | `http://localhost:3000` | `https://api.liveydream.com` |
| **Auth** | Aucune | Aucune |
| **CORS** | Doit être ajouté à la whitelist côté backend | idem |

> ⚠️ Avant de pousser en prod, communique le domaine public de production (`https://liveydream.com`) pour qu'on l'ajoute dans `PUBLIC_CAREERS_ORIGINS` côté backend.

---

## 2. Vue d'ensemble des routes

| Méthode | URL | Description |
|---|---|---|
| `GET` | `/public/careers/jobs` | Liste paginée des offres publiées |
| `GET` | `/public/careers/jobs/:slug` | Détail d'une offre par slug SEO |
| `POST` | `/public/careers/jobs/:slug/apply` | Soumettre une candidature |

**Convention URL côté site public** : utiliser le path `/emploi/:slug` (et non `/careers/:slug`).
Exemple : `https://liveydream.com/emploi/developpeur-fullstack-senior`

---

## 3. `GET /public/careers/jobs` — Liste

### Paramètres (query)
| | Type | Défaut | Description |
|--|--|--|--|
| `page` | int | `1` | Pagination |
| `limit` | int | `20` | Max `100` |
| `search` | string | — | Recherche full-text (titre + description) |
| `employmentType` | string | — | `FULL_TIME` \| `PART_TIME` \| `CONTRACT` \| `INTERNSHIP` |
| `experienceLevel` | string | — | `ENTRY_LEVEL` \| `MID_LEVEL` \| `SENIOR` \| `EXPERT` |
| `organizationCode` | string | — | Filtrer par entreprise (ex: `LYDG`) |
| `sort` | string | `publishedAt:DESC` | Format `field:DIRECTION`. Champs : `publishedAt`, `openingDate`, `jobTitle`, `salaryRangeMin` |

### Réponse (200)
```json
{
  "data": [
    {
      "slug": "developpeur-fullstack-senior",
      "jobTitle": "Développeur Fullstack Senior",
      "jobDescription": "Description complète…",
      "employmentType": "FULL_TIME",
      "experienceLevel": "SENIOR",
      "salaryRangeMin": 250000,
      "salaryRangeMax": 1000000,
      "currency": "XOF",
      "openingDate": "2026-05-28",
      "closingDate": "2026-07-28",
      "publishedAt": "2026-05-28T12:34:56.000Z",
      "organization": { "name": "LYDG", "code": "LYDG" },
      "department": { "name": "Engineering" },
      "position": { "title": "Senior Engineer" }
    }
  ],
  "meta": { "total": 42, "page": 1, "limit": 20, "pageCount": 3 }
}
```

> 🔒 Aucun UUID exposé. Seul le `slug` identifie une offre publiquement.

### Exemple
```js
const res = await fetch('https://api.liveydream.com/public/careers/jobs?limit=20&search=react')
const { data, meta } = await res.json()
```

---

## 4. `GET /public/careers/jobs/:slug` — Détail

### Réponse (200)
Même structure que la liste, avec en plus un objet `meta` pour le SEO :
```json
{
  "slug": "developpeur-fullstack-senior",
  "jobTitle": "Développeur Fullstack Senior",
  "jobDescription": "…",
  "employmentType": "FULL_TIME",
  "experienceLevel": "SENIOR",
  "salaryRangeMin": 250000,
  "salaryRangeMax": 1000000,
  "currency": "XOF",
  "closingDate": "2026-07-28",
  "publishedAt": "2026-05-28T12:34:56.000Z",
  "organization": { "name": "LYDG", "code": "LYDG" },
  "department": { "name": "Engineering" },
  "meta": {
    "canonicalUrl": "https://liveydream.com/emploi/developpeur-fullstack-senior",
    "metaDescription": "Développeur Fullstack Senior - LYDG | Rejoignez l'équipe",
    "keywords": ["Développeur Fullstack Senior", "Engineering", "carrière", "emploi"]
  }
}
```

### Erreurs
| Code | Cas |
|--|--|
| `404` | Slug inexistant ou offre non publiée |
| `410` | Offre publiée mais date de clôture dépassée |

### Utilisation SEO recommandée (Next.js / Nuxt / autre SSR)
```html
<link rel="canonical" href="{job.meta.canonicalUrl}">
<meta name="description" content="{job.meta.metaDescription}">

<script type="application/ld+json">
{
  "@context": "https://schema.org/",
  "@type": "JobPosting",
  "title": "{{ jobTitle }}",
  "description": "{{ jobDescription }}",
  "datePosted": "{{ publishedAt }}",
  "validThrough": "{{ closingDate }}",
  "employmentType": "{{ employmentType }}",
  "hiringOrganization": {
    "@type": "Organization",
    "name": "{{ organization.name }}"
  },
  "baseSalary": {
    "@type": "MonetaryAmount",
    "currency": "{{ currency }}",
    "value": { "@type": "QuantitativeValue",
               "minValue": {{ salaryRangeMin }},
               "maxValue": {{ salaryRangeMax }},
               "unitText": "MONTH" }
  }
}
</script>
```

---

## 5. `POST /public/careers/jobs/:slug/apply` — Postuler

### Headers
| | Obligatoire | Description |
|--|--|--|
| `Content-Type: application/json` | ✅ | |
| `X-Device-Fingerprint` | ⚠️ Recommandé | Hash stable côté client (ex: librairie [fingerprintjs](https://github.com/fingerprintjs/fingerprintjs)). Renforce l'anti-spam. |

### Body
```json
{
  "fullName": "Marie Dupont",
  "email": "marie.dupont@example.com",
  "phone": "+228 90 00 00 00",
  "coverLetter": "Lettre de motivation (min 10 caractères)…",
  "cvUrl": "https://storage.example.com/cv/marie.pdf",
  "cvMimeType": "application/pdf",
  "cvSizeBytes": 524288,
  "websiteField": ""
}
```

### Règles de validation
| Champ | Règle |
|--|--|
| `fullName` | string, min 3, max 255 — **requis** |
| `email` | email valide — **requis** |
| `phone` | string max 20 |
| `coverLetter` | string min 10, max 5000 |
| `cvUrl` | URL HTTPS, max 500, extension `.pdf`/`.doc`/`.docx` — **requis** |
| `cvMimeType` | `application/pdf` \| `application/msword` \| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `cvSizeBytes` | int, max **5 242 880** (5 Mo) |
| `websiteField` | **Honeypot anti-bot — DOIT être vide** (`""` ou absent). Cacher ce champ visuellement dans le formulaire mais le mettre dans le DOM. |

### Réponse (201)
```json
{
  "success": true,
  "applicationId": "550e8400-e29b-41d4-a716-446655440000",
  "candidateId": "660e8400-e29b-41d4-a716-446655440111",
  "message": "Candidature envoyée avec succès. Nous vous recontacterons bientôt.",
  "confirmationEmailSent": false,
  "trackingUrl": "https://liveydream.com/emploi/track/550e8400-..."
}
```

### Erreurs
| Code | Cas |
|--|--|
| `400` | Validation échouée (champ requis manquant, CV non-PDF, URL HTTP au lieu de HTTPS, honeypot rempli, etc.) |
| `404` | Offre inexistante ou non publiée |
| `409` | L'email a déjà postulé à cette offre |
| `410` | Offre fermée (date de clôture passée) |
| `429` | Rate limit dépassé (max **5 candidatures par minute par IP**) + cap quotidien 10/24h/IP |

### ⚠️ Important : upload du CV
**Le backend ne reçoit JAMAIS le fichier directement.** Côté liveydream.com il faut :
1. Uploader le CV sur ton propre storage (Supabase Storage, S3, Cloudinary, ou équivalent)
2. Récupérer l'URL HTTPS finale
3. La passer dans `cvUrl` du body

Si tu n'as pas encore de storage en place, on peut t'en provisionner un côté backend, mais ça allongera le délai. Le plus simple est un bucket Supabase public en lecture (1 minute à mettre en place).

### Exemple JS complet
```js
async function applyForJob(slug, formData, cvFile) {
  // 1. Upload du CV sur Supabase Storage
  const cvUrl = await uploadCV(cvFile)  // ta fonction

  // 2. Envoi de la candidature
  const res = await fetch(
    `https://api.liveydream.com/public/careers/jobs/${slug}/apply`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Fingerprint': await getFingerprint(),
      },
      body: JSON.stringify({
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        coverLetter: formData.coverLetter,
        cvUrl,
        cvMimeType: cvFile.type,
        cvSizeBytes: cvFile.size,
        websiteField: '',  // doit rester vide (honeypot)
      }),
    }
  )

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.message || 'Erreur de candidature')
  }
  return await res.json()
}
```

---

## 6. CORS

Avant le premier appel depuis `https://liveydream.com`, **dis-moi le domaine exact à autoriser**. On l'ajoutera côté backend dans la variable d'env :
```
PUBLIC_CAREERS_ORIGINS="https://liveydream.com,https://www.liveydream.com"
```

En dev local (`http://localhost:5173`, `http://localhost:3000`, etc.) c'est déjà autorisé.

---

## 7. Tester sans coder

Tu peux tester immédiatement les endpoints :
- **Collection Postman** : `backend/postman-collection.json` (à importer)
- **Fichier `.http`** (extension REST Client VSCode) : `backend/public-careers.http`

Et tu peux voir une démo live de l'API à `http://localhost:3000/demo/` quand le backend tourne en dev.

---

## 8. Workflow complet

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   ERP LYDG      │         │   API publique   │         │ liveydream.com  │
│  (back-office)  │         │  (sans auth)     │         │   (site public) │
└─────────────────┘         └──────────────────┘         └─────────────────┘
        │                            │                            │
        │ POST /core/hr/job-openings │                            │
        │ + POST /:id/publish         │                            │
        │ → slug + visibility_state   │                            │
        │   = 'published'              │                            │
        │                              │                            │
        │                              │  GET /public/careers/jobs  │
        │                              │ ◄──────────────────────────│
        │                              │  → liste des offres        │
        │                              │ ──────────────────────────►│
        │                              │                            │
        │                              │  POST /public/careers/     │
        │                              │       jobs/:slug/apply     │
        │                              │ ◄──────────────────────────│
        │                              │  → candidature créée       │
        │                              │     liée à l'org émettrice │
        │                              │ ──────────────────────────►│
        │                              │                            │
        │ ← GET /core/hr/candidates    │                            │
        │   (filtré par tenant)        │                            │
```

**Point important** : chaque candidature est automatiquement rattachée à l'**organisation propriétaire de l'offre**. Si LYDG publie une offre, les candidatures qui en découlent sont visibles uniquement par les recruteurs LYDG dans leur back-office ERP — pas par les autres entreprises clientes.

---

## 9. Contact

| | |
|--|--|
| **Repo backend** | `LyderGroup/LYDG` |
| **Mainteneur** | Louis (`louisskwiz@gmail.com`) |
| **Branche docs** | `main` — fichier `backend/INTEGRATION_LIVEYDREAM.md` |

Pour toute question, bug ou besoin d'endpoint supplémentaire (ex: sitemap.xml, recherche avancée, tracking de candidature), ping sur le repo ou directement.

---

**Version doc** : 1.0 · **Dernière mise à jour** : 2026-05-29
