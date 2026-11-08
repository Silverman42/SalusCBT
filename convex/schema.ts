// Salus data model — follows LLD §3.1 exactly.
// Better Auth tables live inside the betterAuth component; rate-limit state
// lives inside the rateLimiter component (see convex.config.ts).
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const domain = v.union(
  v.literal("1.0"),
  v.literal("2.0"),
  v.literal("3.0"),
  v.literal("4.0"),
  v.literal("5.0"),
);

export default defineSchema({
  profiles: defineTable({
    authUserId: v.string(), // Better Auth user id (component table)
    email: v.string(), // lower-cased
    name: v.optional(v.string()),
    role: v.union(v.literal("admin"), v.literal("tutor")),
    status: v.union(v.literal("active"), v.literal("removed")),
    createdAt: v.number(),
  })
    .index("by_authUserId", ["authUserId"])
    .index("by_email", ["email"]),

  invitations: defineTable({
    email: v.string(),
    tokenHash: v.string(), // sha256(token), hex
    invitedBy: v.id("profiles"),
    expiresAt: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("cancelled"),
      v.literal("expired"),
    ),
    createdAt: v.number(),
    acceptedAt: v.optional(v.number()),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_email_status", ["email", "status"]),

  exams: defineTable({
    slug: v.string(), // "sy0-701"
    title: v.string(),
    timeLimitMin: v.number(), // 90
    passScaled: v.number(), // 750
    comfortScaled: v.number(), // 800
    domainTarget: v.number(), // 0.81
    defaultVersionId: v.optional(v.id("examVersions")),
  }).index("by_slug", ["slug"]),

  // Copy-on-write versions (D8, ED-4): published versions are never changed.
  examVersions: defineTable({
    examId: v.id("exams"),
    ownerId: v.optional(v.id("profiles")), // undefined = default exam (admin-managed)
    parentVersionId: v.optional(v.id("examVersions")),
    label: v.string(),
    versionNo: v.number(),
    status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
    totalPoints: v.number(), // computed on publish (ED-10)
    publishedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_exam_owner", ["examId", "ownerId"])
    .index("by_owner_status", ["ownerId", "status"]),

  // Student-visible question content. Never holds correct answers (SE-1).
  questions: defineTable({
    versionId: v.id("examVersions"),
    order: v.number(), // sort key within a section
    section: v.union(v.literal("pbqA"), v.literal("pbqB"), v.literal("mcq")),
    displayNumber: v.string(), // "1", "B3", "47"
    kind: v.union(v.literal("mcq"), v.literal("pbq")),
    domain,
    points: v.number(), // mcq = 1; pbq = number of scored parts
    stem: v.string(), // plain text / limited Markdown, rendered escaped
    // mcq only
    options: v.optional(v.array(v.object({ id: v.string(), text: v.string() }))), // id "A".."F"
    chooseCount: v.optional(v.number()), // 1 or 2
    // pbq only
    template: v.optional(
      v.union(
        v.literal("sshLog"),
        v.literal("nmap"),
        v.literal("hashCheck"),
        v.literal("permissions"),
        v.literal("firewall"),
      ),
    ),
    // TODO(T-105): typed by PbqPayload in shared/content.ts; validated on write.
    payload: v.optional(v.any()),
  }).index("by_version_section_order", ["versionId", "section", "order"]),

  // SERVER-ONLY (SE-1): the only place correct answers live. Read by internal
  // functions only; never returned to students before submission.
  answerKeys: defineTable({
    questionId: v.id("questions"),
    versionId: v.id("examVersions"),
    correct: v.optional(v.array(v.string())), // mcq option ids, e.g. ["A","B"]
    // TODO(T-105): typed by PbqKey in shared/content.ts.
    parts: v.optional(v.any()),
    explanation: v.string(),
  })
    .index("by_question", ["questionId"])
    .index("by_version", ["versionId"]),

  oralQuestions: defineTable({
    versionId: v.id("examVersions"),
    order: v.number(),
    question: v.string(),
    modelAnswer: v.string(),
  }).index("by_version", ["versionId", "order"]),

  classes: defineTable({
    tutorId: v.id("profiles"),
    name: v.string(),
    code: v.string(), // "SEC-4K7Q", stored upper-case
    versionId: v.id("examVersions"), // must be published
    // EX-21: 1, 1.25, 1.5, 2. Convex has no column defaults, so every writer
    // sets 1 unless the tutor picks another multiplier.
    timeMultiplier: v.number(),
    status: v.union(v.literal("open"), v.literal("closed")),
    createdAt: v.number(),
  })
    .index("by_code", ["code"])
    .index("by_tutor", ["tutorId"]),

  attempts: defineTable({
    anonKey: v.string(), // sha256(anonToken), hex (D4)
    displayName: v.optional(v.string()),
    classId: v.optional(v.id("classes")),
    versionId: v.id("examVersions"),
    mode: v.union(v.literal("standard"), v.literal("retake")),
    status: v.union(v.literal("in_progress"), v.literal("submitted"), v.literal("expired")),
    startedAt: v.number(),
    deadline: v.number(), // startedAt + limit × multiplier
    submittedAt: v.optional(v.number()),
    submittedBy: v.optional(v.union(v.literal("student"), v.literal("timer"))),
    shuffleSeed: v.number(), // uint32
    autoSubmitJobId: v.optional(v.id("_scheduled_functions")),
    result: v.optional(
      v.object({
        points: v.number(),
        totalPoints: v.number(),
        scaled: v.number(),
        passed: v.boolean(),
        comfortable: v.boolean(),
        domains: v.array(v.object({ domain, points: v.number(), max: v.number() })),
        flaggedCount: v.number(),
        timeUsedSec: v.number(),
      }),
    ),
    ipHash: v.optional(v.string()), // cleared after 30 days (PR-3)
  })
    .index("by_anonKey", ["anonKey", "startedAt"])
    .index("by_class", ["classId", "startedAt"])
    .index("by_status_deadline", ["status", "deadline"]),

  // One row per answered or flagged question (D9).
  responses: defineTable({
    attemptId: v.id("attempts"),
    questionId: v.id("questions"),
    // TODO(T-105): typed by AnswerValue in shared/content.ts.
    value: v.optional(v.any()),
    flagged: v.boolean(),
    updatedAt: v.number(),
    // filled at marking time
    earned: v.optional(v.number()),
    partResults: v.optional(v.array(v.boolean())),
  }).index("by_attempt_question", ["attemptId", "questionId"]),

  shareLinks: defineTable({
    attemptId: v.id("attempts"),
    publicId: v.string(), // 22-char base64url, 128-bit random
    anonKey: v.string(),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_publicId", ["publicId"])
    .index("by_attempt", ["attemptId"]),

  auditLog: defineTable({
    actorId: v.optional(v.id("profiles")), // undefined = system / anonymous
    action: v.string(), // see LLD §12.2
    target: v.optional(v.string()),
    meta: v.optional(v.any()),
    ipHash: v.optional(v.string()),
    at: v.number(),
  }).index("by_at", ["at"]),
});
