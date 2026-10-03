# CampusConnect

CampusConnect is a student-first social network: profiles, feed, communities, messaging, events, resources, marketplace and campus discovery.

## Architecture
- apps/web — Next.js frontend
- apps/api — Express API
- PostgreSQL + Prisma
- Vercel — web
- Render — API + PostgreSQL
- Resend — transactional email

## Development
Web: `npm install && npm run dev`
API: `cd apps/api && npm install && npm run dev`
