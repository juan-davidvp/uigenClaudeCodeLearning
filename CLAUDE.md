# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# First-time setup (install deps, generate Prisma client, run migrations)
npm run setup

# Development (Turbopack)
npm run dev

# Build
npm run build

# Lint
npm run lint

# Run all tests
npm test

# Run a single test file
npx vitest run src/components/chat/__tests__/ChatInterface.test.tsx

# Reset database
npm run db:reset

# Regenerate Prisma client after schema changes
npx prisma generate

# Run migrations
npx prisma migrate dev
```

## Architecture

### Overview

UIGen is an AI-powered React component generator. Users describe components in a chat interface; the AI generates code using tool calls; the code is previewed live in a sandboxed iframe — all without writing files to disk.

### Request Flow

1. User submits a chat message
2. `ChatContext` (`src/lib/contexts/chat-context.tsx`) sends it to `POST /api/chat` along with the serialized virtual file system
3. The API route (`src/app/api/chat/route.ts`) streams a response from Claude (or `MockLanguageModel` when no API key is set) using Vercel AI SDK's `streamText`
4. Claude calls `str_replace_editor` or `file_manager` tools to create/edit files
5. Tool calls stream back to the client; `FileSystemContext.handleToolCall` applies them to the in-memory VFS
6. `PreviewFrame` reacts to the `refreshTrigger` counter and re-renders the iframe

### Virtual File System

`VirtualFileSystem` (`src/lib/file-system.ts`) is an in-memory tree of `FileNode` objects. Nothing is written to disk. It is serialized to a plain object (`serialize()`) when sent to the API and deserialized on the server (`deserializeFromNodes()`). The Prisma `Project.data` column stores this serialized snapshot as a JSON string.

### Client-Side Preview

`PreviewFrame` (`src/components/preview/PreviewFrame.tsx`) generates a full HTML document for the iframe:
- `createImportMap()` in `src/lib/transform/jsx-transformer.ts` transpiles each JSX/TSX file using `@babel/standalone` and creates blob URLs
- Third-party imports (e.g. `import { motion } from 'framer-motion'`) are automatically redirected to `https://esm.sh/<package>`
- Missing local imports get placeholder stub modules
- The entry point defaults to `/App.jsx`, with fallbacks to `/App.tsx`, `/index.jsx`, etc.
- The iframe has `sandbox="allow-scripts allow-same-origin allow-forms"` to support blob-URL import maps

### AI Provider

`getLanguageModel()` in `src/lib/provider.ts` returns:
- Real `gemini-2.5-flash` via `@ai-sdk/google` when `GOOGLE_GENERATIVE_AI_API_KEY` is set
- `MockLanguageModel` (same file) when the key is absent — generates static Counter/Card/Form components for development without an API key

### Authentication

Custom JWT auth using `jose` (`src/lib/auth.ts`). Sessions stored in an HTTP-only cookie (`auth-token`, 7-day expiry). No third-party auth library. Anonymous users can generate components; only authenticated users get persistent projects saved to the DB.

### Data Persistence

Prisma with SQLite (`prisma/dev.db`). The Prisma client is generated to `src/generated/prisma` (non-standard location).

#### Schema

```
User
  id        String   @id @default(cuid())
  email     String   @unique
  password  String                         -- bcrypt-hashed
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  projects  Project[]

Project
  id        String   @id @default(cuid())
  name      String
  userId    String?                        -- nullable: anonymous projects have no owner
  messages  String   @default("[]")       -- JSON array of AI SDK Message objects
  data      String   @default("{}")       -- JSON-serialized VirtualFileSystem snapshot
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user      User?    @relation(...)       -- CASCADE delete when user is deleted
```

Key design decisions visible from the migration history:
- `userId` was made **optional** (migration `20250619174023`) to support anonymous users generating components without signing up
- The VFS was originally stored in a separate `FileSystem` table (one-to-one with `Project`), then collapsed into `Project.data` (migration `20250619174322`) to simplify queries
- `Project.messages` and `Project.data` are raw `TEXT` columns holding JSON — Prisma does not parse them; the app calls `JSON.parse`/`JSON.stringify` manually
- Deleting a `User` cascades to all their `Project` rows

### Routing

- `/` — anonymous workspace or redirect to most recent project for authenticated users
- `/[projectId]` — authenticated project workspace; redirects to `/` if unauthenticated or project not found

### Key Contexts

- `FileSystemContext` (`src/lib/contexts/file-system-context.tsx`) — owns the `VirtualFileSystem` instance, exposes file operations, and handles AI tool calls (`str_replace_editor`, `file_manager`) via `handleToolCall`
- `ChatContext` (`src/lib/contexts/chat-context.tsx`) — wraps Vercel AI SDK's `useChat`, passes serialized VFS in every request body, routes incoming tool calls to `FileSystemContext`

### Tests

Vitest with jsdom + `@testing-library/react`. Test files live in `__tests__` directories adjacent to the code they test.
