# PromptLib Server

Backend API pour PromptLib, une application collaborative de gestion de prompts IA.

## Stack technique

- **Framework** : Fastify 5
- **Base de données** : PostgreSQL + Prisma ORM
- **Authentification** : JWT (access + refresh token rotation)
- **Collaboration temps réel** : Yjs (CRDT) via WebSocket
- **Langage** : TypeScript (ESM)

## Prérequis

- Node.js 20+
- PostgreSQL

## Installation

```bash
npm install
```

Créer un fichier `.env` à la racine du serveur :

```env
DATABASE_URL="postgresql://user:password@localhost:5432/promptlib"
JWT_SECRET="une-chaine-aleatoire-de-32-caracteres"
JWT_ACCESS_EXPIRES="15m"
JWT_REFRESH_EXPIRES="7d"
PORT=3001
CORS_ORIGIN="*"
```

Initialiser la base de données :

```bash
npm run db:migrate
```

## Scripts

| Commande | Description |
|---|---|
| `npm run dev` | Serveur en mode développement (hot reload) |
| `npm run build` | Compilation TypeScript |
| `npm start` | Lancement du serveur compilé |
| `npm run db:migrate` | Exécuter les migrations Prisma |
| `npm run db:generate` | Générer le client Prisma |
| `npm run db:push` | Pousser le schéma vers la BDD |

## Architecture

```
src/
├── index.ts              # Point d'entrée
├── app.ts                # Initialisation Fastify et plugins
├── config.ts             # Configuration (variables d'environnement)
├── lib/
│   ├── prisma.ts         # Client Prisma (singleton)
│   ├── password.ts       # Hachage bcrypt
│   └── token.ts          # Génération de refresh tokens
├── middleware/
│   └── auth.ts           # Middleware d'authentification JWT
├── routes/
│   ├── auth.ts           # Inscription, connexion, refresh, déconnexion
│   ├── prompts.ts        # CRUD prompts + recherche
│   ├── folders.ts        # Gestion des dossiers + contexte
│   ├── images.ts         # Upload et service d'images
│   ├── settings.ts       # Paramètres utilisateur
│   └── admin.ts          # Administration des utilisateurs
└── ws/
    └── yjs-handler.ts    # Synchronisation CRDT via WebSocket
```

## API

### Health check

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/health` | Status du serveur |

### Authentification `/api/auth`

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/auth/signup` | Inscription (le 1er utilisateur devient admin) |
| `POST` | `/auth/login` | Connexion (retourne access + refresh token) |
| `POST` | `/auth/refresh` | Renouvellement du token |
| `POST` | `/auth/logout` | Déconnexion (invalide la session) |
| `GET` | `/auth/me` | Utilisateur courant |

### Prompts `/api/prompts` (authentifié)

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/prompts` | Liste des prompts (métadonnées) |
| `GET` | `/prompts/:id` | Détail d'un prompt |
| `POST` | `/prompts` | Créer un prompt |
| `PATCH` | `/prompts/:id` | Modifier un prompt |
| `DELETE` | `/prompts/:id` | Supprimer un prompt |
| `GET` | `/prompts/search?q=` | Recherche (titre, contenu, tags) |
| `GET` | `/prompts/tags` | Liste des tags de l'utilisateur |

### Dossiers `/api/folders` (authentifié)

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/folders` | Liste des dossiers |
| `POST` | `/folders` | Créer un dossier |
| `PATCH` | `/folders/:id` | Renommer/modifier un dossier |
| `DELETE` | `/folders/:id` | Supprimer un dossier (prompts déplacés à la racine) |
| `GET` | `/folders/:id/context` | Récupérer le contexte d'un dossier |
| `PUT` | `/folders/:id/context` | Définir le contexte d'un dossier |

### Images `/api/images`

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/images?promptId=` | Upload d'image (authentifié, max 10 Mo) |
| `GET` | `/images/:id` | Servir une image (public) |

### Paramètres `/api/settings` (authentifié)

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/settings` | Récupérer les paramètres |
| `PUT` | `/settings` | Modifier les paramètres |

### Administration `/api/admin` (admin uniquement)

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/admin/users` | Liste des utilisateurs |
| `POST` | `/admin/users/:id/activate` | Activer un utilisateur |
| `POST` | `/admin/users/:id/deactivate` | Désactiver un utilisateur |
| `POST` | `/admin/users/:id/role` | Changer le rôle d'un utilisateur |

### WebSocket

| Route | Description |
|---|---|
| `GET /yjs/:promptId?token=` | Synchronisation Yjs temps réel |

## Modèle de données

- **User** : comptes utilisateurs avec rôles (admin/user)
- **Session** : gestion des refresh tokens (rotation)
- **Prompt** : prompts avec contenu, tags, état Yjs (CRDT)
- **Folder** : dossiers hiérarchiques avec contexte personnalisé
- **Image** : images attachées aux prompts (PNG, JPEG, GIF, WebP, SVG)

## Sécurité

- Mots de passe hachés avec bcrypt (12 rounds)
- Rotation des refresh tokens (invalidation après usage)
- Authentification WebSocket par token JWT
- Validation des types MIME pour les images
- Limite de taille des fichiers (10 Mo)
- Contrôle d'accès par rôle pour les routes admin
- Suppression en cascade (user -> prompts, folders, sessions)
