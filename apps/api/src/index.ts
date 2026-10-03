import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient, Visibility } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();
const app = express();
const PORT = Number(process.env.PORT || 4000);
const SECRET = process.env.JWT_SECRET || "dev-only-secret";
const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",").map((s) => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || configuredOrigins.includes("*") || configuredOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed"));
  },
  credentials: true,
}));
app.use(express.json({ limit: "3mb" }));
app.use(cookieParser());

const userSelect = {
  id: true, email: true, username: true, name: true, avatarUrl: true, bio: true,
  university: true, campus: true, faculty: true, department: true, program: true, level: true,
} as const;
type Req = express.Request & { userId?: string };

const token = (id: string) => jwt.sign({ sub: id }, SECRET, { expiresIn: "7d" });
const cookieOptions = {
  httpOnly: true, secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" as const : "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function auth(req: Req, res: express.Response, next: express.NextFunction) {
  const t = req.cookies.cc_token || (req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7) : undefined);
  if (!t) return res.status(401).json({ error: "Authentication required" });
  try { req.userId = (jwt.verify(t, SECRET) as { sub: string }).sub; next(); }
  catch { return res.status(401).json({ error: "Invalid session" }); }
}

const safe = async (fn: () => Promise<void>, res: express.Response) => {
  try { await fn(); } catch (error) { console.error(error); res.status(500).json({ error: "Internal server error" }); }
};

app.get("/api/health", async (_, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", database: "connected", service: "campusconnect-api" });
  } catch { res.status(503).json({ status: "degraded", database: "unavailable" }); }
});

app.post("/api/v1/auth/register", async (req, res) => {
  const p = z.object({
    email: z.string().email(), password: z.string().min(8),
    username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
    name: z.string().min(2), university: z.string().min(2), campus: z.string().min(2),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid registration data" });
  await safe(async () => {
    const exists = await prisma.user.findFirst({ where: { OR: [{ email: p.data.email }, { username: p.data.username }] } });
    if (exists) return res.status(409).json({ error: "Email or username already exists" });
    const { password, ...profile } = p.data;
    const u = await prisma.user.create({ data: { ...profile, passwordHash: await bcrypt.hash(password, 12) }, select: userSelect });
    res.cookie("cc_token", token(u.id), cookieOptions).status(201).json({ user: u });
  }, res);
});

app.post("/api/v1/auth/login", async (req, res) => {
  const p = z.object({ email: z.string().email(), password: z.string() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid login data" });
  await safe(async () => {
    const u = await prisma.user.findUnique({ where: { email: p.data.email } });
    if (!u || !(await bcrypt.compare(p.data.password, u.passwordHash))) return res.status(401).json({ error: "Invalid email or password" });
    res.cookie("cc_token", token(u.id), cookieOptions).json({ user: u });
  }, res);
});

app.post("/api/v1/auth/logout", (_, res) => { res.clearCookie("cc_token", cookieOptions).status(204).end(); });
app.get("/api/v1/auth/me", auth, async (req: Req, res) => {
  const u = await prisma.user.findUnique({ where: { id: req.userId! }, select: userSelect });
  u ? res.json({ user: u }) : res.status(401).json({ error: "User not found" });
});

app.get("/api/v1/feed", auth, async (req: Req, res) => {
  const me = await prisma.user.findUnique({ where: { id: req.userId! }, select: { university: true } });
  const posts = await prisma.post.findMany({
    where: { OR: [
      { visibility: "PUBLIC" }, { visibility: "UNIVERSITY", author: { university: me?.university } },
      { authorId: req.userId! }, { visibility: "GROUP", group: { members: { some: { userId: req.userId! } } } },
    ]},
    orderBy: { createdAt: "desc" }, take: 30,
    include: { author: { select: { id: true, username: true, name: true, avatarUrl: true, program: true } },
      _count: { select: { comments: true, reactions: true, shares: true } }, group: { select: { id: true, name: true, slug: true } } },
  });
  res.json({ posts });
});

app.post("/api/v1/posts", auth, async (req: Req, res) => {
  const p = z.object({
    body: z.string().min(1).max(5000), visibility: z.nativeEnum(Visibility).default("UNIVERSITY"),
    groupId: z.string().optional(), courseCode: z.string().max(40).optional(),
  }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid post" });
  const post = await prisma.post.create({
    data: { ...p.data, authorId: req.userId! },
    include: { author: { select: { id: true, username: true, name: true, avatarUrl: true, program: true } },
      _count: { select: { comments: true, reactions: true, shares: true } }, group: { select: { id: true, name: true, slug: true } } },
  });
  res.status(201).json({ post });
});
app.post("/api/v1/posts/:id/reaction", auth, async (req: Req, res) => {
  const old = await prisma.reaction.findUnique({ where: { postId_userId: { postId: req.params.id, userId: req.userId! } } });
  if (old) { await prisma.reaction.delete({ where: { id: old.id } }); return res.json({ reacted: false }); }
  await prisma.reaction.create({ data: { postId: req.params.id, userId: req.userId!, type: "LIKE" } });
  res.json({ reacted: true });
});
app.post("/api/v1/posts/:id/comments", auth, async (req: Req, res) => {
  const p = z.object({ body: z.string().min(1).max(2000), parentId: z.string().optional() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid comment" });
  const comment = await prisma.comment.create({ data: { postId: req.params.id, authorId: req.userId!, ...p.data },
    include: { author: { select: { id: true, username: true, name: true, avatarUrl: true } } } });
  res.status(201).json({ comment });
});

app.get("/api/v1/people", auth, async (req: Req, res) => {
  const q = String(req.query.q || "").trim();
  const me = await prisma.user.findUnique({ where: { id: req.userId! }, select: { university: true } });
  const people = await prisma.user.findMany({
    where: { id: { not: req.userId! }, university: me?.university,
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { username: { contains: q, mode: "insensitive" } }, { program: { contains: q, mode: "insensitive" } }] } : {}) },
    take: 30, select: userSelect,
  });
  res.json({ people });
});
app.post("/api/v1/people/:id/follow", auth, async (req: Req, res) => {
  if (req.params.id === req.userId) return res.status(400).json({ error: "Cannot follow yourself" });
  const old = await prisma.follow.findUnique({ where: { followerId_followingId: { followerId: req.userId!, followingId: req.params.id } } });
  if (old) { await prisma.follow.delete({ where: { id: old.id } }); return res.json({ following: false }); }
  await prisma.follow.create({ data: { followerId: req.userId!, followingId: req.params.id } });
  res.json({ following: true });
});
app.get("/api/v1/users/:username", auth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { username: req.params.username }, select: userSelect });
  if (!user) return res.status(404).json({ error: "User not found" });
  const posts = await prisma.post.findMany({ where: { authorId: user.id }, orderBy: { createdAt: "desc" }, take: 20,
    include: { author: { select: { id: true, username: true, name: true, avatarUrl: true, program: true } }, _count: { select: { comments: true, reactions: true, shares: true } } } });
  res.json({ user, posts });
});

app.get("/api/v1/groups", auth, async (req, res) => {
  const q = String(req.query.q || "").trim();
  const groups = await prisma.group.findMany({ where: q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { campus: { contains: q, mode: "insensitive" } }] } : {},
    take: 30, orderBy: { createdAt: "desc" }, include: { _count: { select: { members: true, posts: true } } } });
  res.json({ groups });
});
app.post("/api/v1/groups", auth, async (req: Req, res) => {
  const p = z.object({ name: z.string().min(3), description: z.string().min(10), campus: z.string().min(2) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid group" });
  const slug = p.data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Math.random().toString(36).slice(2, 6);
  const group = await prisma.group.create({ data: { ...p.data, slug, members: { create: { userId: req.userId!, role: "OWNER" } } } });
  res.status(201).json({ group });
});
app.post("/api/v1/groups/:id/join", auth, async (req: Req, res) => {
  const old = await prisma.groupMember.findUnique({ where: { groupId_userId: { groupId: req.params.id, userId: req.userId! } } });
  if (old) { await prisma.groupMember.delete({ where: { id: old.id } }); return res.json({ joined: false }); }
  await prisma.groupMember.create({ data: { groupId: req.params.id, userId: req.userId! } });
  res.json({ joined: true });
});

app.get("/api/v1/events", auth, async (_, res) => {
  const events = await prisma.event.findMany({ where: { status: "PUBLISHED" }, orderBy: { startsAt: "asc" }, take: 30,
    include: { organizer: { select: { id: true, name: true, username: true, avatarUrl: true } }, _count: { select: { attendees: true } } } });
  res.json({ events });
});
app.post("/api/v1/events/:id/rsvp", auth, async (req: Req, res) => {
  const old = await prisma.eventAttendee.findUnique({ where: { eventId_userId: { eventId: req.params.id, userId: req.userId! } } });
  if (old) { await prisma.eventAttendee.delete({ where: { id: old.id } }); return res.json({ going: false }); }
  await prisma.eventAttendee.create({ data: { eventId: req.params.id, userId: req.userId! } }); res.json({ going: true });
});

app.get("/api/v1/notifications", auth, async (req: Req, res) => {
  res.json({ notifications: await prisma.notification.findMany({ where: { userId: req.userId! }, orderBy: { createdAt: "desc" }, take: 40 }) });
});
app.post("/api/v1/notifications/read-all", auth, async (req: Req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.userId!, readAt: null }, data: { readAt: new Date() } }); res.status(204).end();
});
app.get("/api/v1/marketplace", auth, async (_, res) => res.json({ items: await prisma.marketplaceListing.findMany({ where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" }, take: 30, include: { seller: { select: { id: true, username: true, name: true, avatarUrl: true } } } }) }));
app.get("/api/v1/questions", auth, async (_, res) => res.json({ questions: await prisma.question.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { author: { select: { id: true, username: true, name: true, avatarUrl: true } }, _count: { select: { answers: true } } } }) }));
app.get("/api/v1/resources", auth, async (_, res) => res.json({ resources: await prisma.resource.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { uploader: { select: { id: true, username: true, name: true, avatarUrl: true } } } }) }));

app.get("/api/v1/conversations", auth, async (req: Req, res) => {
  const conversations = await prisma.conversation.findMany({
    where: { members: { some: { userId: req.userId! } } }, orderBy: { createdAt: "desc" }, take: 30,
    include: { members: { include: { user: { select: { id: true, username: true, name: true, avatarUrl: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  res.json({ conversations });
});
app.post("/api/v1/conversations", auth, async (req: Req, res) => {
  const p = z.object({ userId: z.string() }).safeParse(req.body);
  if (!p.success || p.data.userId === req.userId) return res.status(400).json({ error: "Invalid recipient" });
  const candidates = await prisma.conversation.findMany({ where: { members: { some: { userId: req.userId! } } }, include: { members: true }, take: 50 });
  const existing = candidates.find((c) => c.members.length === 2 && c.members.some((m) => m.userId === p.data.userId));
  if (existing) return res.json({ conversation: existing });
  const conversation = await prisma.conversation.create({ data: { members: { create: [{ userId: req.userId! }, { userId: p.data.userId }] } } });
  res.status(201).json({ conversation });
});
app.get("/api/v1/conversations/:id/messages", auth, async (req: Req, res) => {
  const member = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId: req.params.id, userId: req.userId! } } });
  if (!member) return res.status(403).json({ error: "Not a member" });
  res.json({ messages: await prisma.message.findMany({ where: { conversationId: req.params.id }, orderBy: { createdAt: "asc" }, take: 100, include: { sender: { select: { id: true, name: true, username: true, avatarUrl: true } } } }) });
});
app.post("/api/v1/conversations/:id/messages", auth, async (req: Req, res) => {
  const member = await prisma.conversationMember.findUnique({ where: { conversationId_userId: { conversationId: req.params.id, userId: req.userId! } } });
  if (!member) return res.status(403).json({ error: "Not a member" });
  const p = z.object({ body: z.string().min(1).max(4000) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Invalid message" });
  const message = await prisma.message.create({ data: { conversationId: req.params.id, senderId: req.userId!, body: p.data.body },
    include: { sender: { select: { id: true, name: true, username: true, avatarUrl: true } } } });
  res.status(201).json({ message });
});

app.get("/api/v1/search", auth, async (req, res) => {
  const q = String(req.query.q || "").trim(); if (q.length < 2) return res.json({ people: [], groups: [], events: [] });
  const [people, groups, events] = await Promise.all([
    prisma.user.findMany({ where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { username: { contains: q, mode: "insensitive" } }, { program: { contains: q, mode: "insensitive" } }] }, take: 8, select: userSelect }),
    prisma.group.findMany({ where: { OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] }, take: 8 }),
    prisma.event.findMany({ where: { title: { contains: q, mode: "insensitive" } }, take: 8, orderBy: { startsAt: "asc" } }),
  ]);
  res.json({ people, groups, events });
});

app.use((_, res) => res.status(404).json({ error: "Not found" }));
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { console.error(err); res.status(500).json({ error: "Internal server error" }); });

app.listen(PORT, "0.0.0.0", () => console.log(`CampusConnect API listening on ${PORT}`));
