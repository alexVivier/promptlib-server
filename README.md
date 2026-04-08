# PromptLib Server

Backend API for PromptLib, a collaborative AI prompt management application.

## Tech Stack

- **Framework**: Fastify 5
- **Database**: PostgreSQL + Prisma ORM
- **Authentication**: JWT (access + refresh token rotation)
- **Real-time Collaboration**: Yjs (CRDT) over WebSocket
- **Language**: TypeScript (ESM)

## Prerequisites

- Node.js 20+
- PostgreSQL

## Installation

```bash
npm install
```

Create a `.env` file at the server root:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/promptlib"
JWT_SECRET="a-random-32-character-string"
JWT_ACCESS_EXPIRES="15m"
JWT_REFRESH_EXPIRES="7d"
PORT=3001
CORS_ORIGIN="*"
```

Initialize the database:

```bash
npm run db:migrate
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (hot reload) |
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled server |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema to database |

## Architecture

```
src/
├── index.ts              # Entry point
├── app.ts                # Fastify app initialization & plugins
├── config.ts             # Configuration (environment variables)
├── lib/
│   ├── prisma.ts         # Prisma client (singleton)
│   ├── password.ts       # bcrypt hashing
│   └── token.ts          # Refresh token generation
├── middleware/
│   └── auth.ts           # JWT authentication middleware
├── routes/
│   ├── auth.ts           # Signup, login, refresh, logout
│   ├── prompts.ts        # Prompt CRUD + search
│   ├── folders.ts        # Folder management + context
│   ├── images.ts         # Image upload & serving
│   ├── settings.ts       # User settings
│   └── admin.ts          # User administration
└── ws/
    └── yjs-handler.ts    # CRDT sync over WebSocket
```

## API

### Health Check

| Method | Route | Description |
|---|---|---|
| `GET` | `/health` | Server status |

### Authentication `/api/auth`

| Method | Route | Description |
|---|---|---|
| `POST` | `/auth/signup` | Register (first user becomes admin) |
| `POST` | `/auth/login` | Login (returns access + refresh token) |
| `POST` | `/auth/refresh` | Refresh token |
| `POST` | `/auth/logout` | Logout (invalidates session) |
| `GET` | `/auth/me` | Current user |

### Prompts `/api/prompts` (authenticated)

| Method | Route | Description |
|---|---|---|
| `GET` | `/prompts` | List prompts (metadata only) |
| `GET` | `/prompts/:id` | Get prompt details |
| `POST` | `/prompts` | Create a prompt |
| `PATCH` | `/prompts/:id` | Update a prompt |
| `DELETE` | `/prompts/:id` | Delete a prompt |
| `GET` | `/prompts/search?q=` | Search (title, content, tags) |
| `GET` | `/prompts/tags` | List user's tags |

### Folders `/api/folders` (authenticated)

| Method | Route | Description |
|---|---|---|
| `GET` | `/folders` | List folders |
| `POST` | `/folders` | Create a folder |
| `PATCH` | `/folders/:id` | Rename/update a folder |
| `DELETE` | `/folders/:id` | Delete a folder (prompts moved to root) |
| `GET` | `/folders/:id/context` | Get folder context |
| `PUT` | `/folders/:id/context` | Set folder context |

### Images `/api/images`

| Method | Route | Description |
|---|---|---|
| `POST` | `/images?promptId=` | Upload image (authenticated, max 10 MB) |
| `GET` | `/images/:id` | Serve image (public) |

### Settings `/api/settings` (authenticated)

| Method | Route | Description |
|---|---|---|
| `GET` | `/settings` | Get user settings |
| `PUT` | `/settings` | Update user settings |

### Admin `/api/admin` (admin only)

| Method | Route | Description |
|---|---|---|
| `GET` | `/admin/users` | List all users |
| `POST` | `/admin/users/:id/activate` | Activate a user |
| `POST` | `/admin/users/:id/deactivate` | Deactivate a user |
| `POST` | `/admin/users/:id/role` | Change user role |

### WebSocket

| Route | Description |
|---|---|
| `GET /yjs/:promptId?token=` | Real-time Yjs sync |

## Data Model

- **User**: user accounts with roles (admin/user)
- **Session**: refresh token management (rotation)
- **Prompt**: prompts with content, tags, Yjs state (CRDT)
- **Folder**: hierarchical folders with custom context
- **Image**: images attached to prompts (PNG, JPEG, GIF, WebP, SVG)

## Security

- Passwords hashed with bcrypt (12 rounds)
- Refresh token rotation (invalidated after use)
- WebSocket authentication via JWT
- MIME type validation for images
- File size limit (10 MB)
- Role-based access control for admin routes
- Cascade deletion (user -> prompts, folders, sessions)
