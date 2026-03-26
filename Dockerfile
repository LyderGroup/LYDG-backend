# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances
RUN npm ci

# Copier le code source
COPY . .

# Builder l'application NestJS
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Copier les dépendances de production uniquement
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copier le build depuis le stage précédent
COPY --from=builder /app/dist ./dist

# Variables d'environnement par défaut
ENV NODE_ENV=production
ENV PORT=3000

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
  adduser -S nestjs -u 1001 -G nodejs

# Changer la propriété des fichiers
RUN chown -R nestjs:nodejs /app

# Passer à l'utilisateur non-root
USER nestjs

# Exposer le port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/db || exit 1

# Commande de démarrage
CMD ["node", "dist/main.js"]
