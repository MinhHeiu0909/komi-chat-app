/**
 * Chạy bộ câu thử prompt injection (eval/injection/cases.json) qua đúng đường dựng prompt của Komi AI.
 *
 *   npm run eval:injection -- --name hien-tai            # gọi LLM thật (LLM_* trong backend/.env)
 *   npm run eval:injection -- --name thu --fake          # LLM giả, chỉ kiểm tra dựng dữ liệu (không gọi mạng)
 *   npm run eval:injection -- --name thu --only file-tag-breakout --show-prompt
 *   npm run eval:injection -- --name hien-tai --repeat 2 # chạy mỗi câu 2 lần (model không trả lời cố định)
 *
 * Dữ liệu dựng trên MongoDB tạm trong bộ nhớ (mongodb-memory-server), không đụng DB dev hay demo.
 * Tra cứu RAG dùng embedding giả (khớp theo từ) và vector store "memory": chỉ cần đoạn chứa lệnh giấu
 * được tìm thấy, không đo chất lượng tìm kiếm. Mỗi câu gọi LLM một lần, cách nhau --delay ms (mặc định 4000)
 * để không vượt hạn mức free; gặp 429 thì chờ 1 phút, thử lại một lần rồi dừng.
 * Kết quả: eval/results/injection-<name>.json (câu trả lời chỉ chứa dữ liệu tự soạn).
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { EVAL_DIR, parseArgs, readJson, sleep } from "./evalCommon.js";

const args = parseArgs();
if (!args.name || args.name === true) {
  console.error("Cần --name <tên lần chạy>, vd. --name hien-tai");
  process.exit(1);
}
const repeat = Math.max(1, Number(args.repeat) || 1);
const delayMs = args.delay !== undefined ? Number(args.delay) : 4000;

// Tra cứu chạy hoàn toàn trên máy; chỉ LLM là thật (trừ khi --fake)
process.env.EMBEDDING_PROVIDER = "fake";
process.env.VECTOR_STORE = "memory";
if (args.fake) process.env.LLM_PROVIDER = "fake";

const [
  { default: User },
  { default: Conversation },
  { default: Message },
  { default: ChatFile },
  { default: SharedDocument },
  { default: KnowledgeChunk },
  { default: RagCursor },
  { llm, LLM_ERROR },
  { buildKomiPrompt, prepareSummary },
  { countPending, runIndexerOnce },
  { findOrCreateDirectConversation },
] = await Promise.all([
  import("../src/models/User.js"),
  import("../src/models/Conversation.js"),
  import("../src/models/Message.js"),
  import("../src/models/ChatFile.js"),
  import("../src/models/SharedDocument.js"),
  import("../src/models/KnowledgeChunk.js"),
  import("../src/models/RagCursor.js"),
  import("../src/ai/llm.js"),
  import("../src/ai/prompt.js"),
  import("../src/ai/rag/indexer.js"),
  import("../src/utils/directConversation.js"),
]);

const suite = readJson("injection/cases.json");

// ---- dựng dữ liệu cho một câu ----

let clock = Date.parse("2026-11-10T09:00:00+07:00");
const nextTime = () => new Date((clock += 60_000));

const insertMessages = async (conversation, users, messages) => {
  for (const [sender, content] of messages) {
    const at = nextTime();
    await Message.create({ conversationId: conversation._id, senderId: users[sender]._id, content, createdAt: at, updatedAt: at });
  }
};

const createGroup = (name, members) =>
  Conversation.create({
    type: "group",
    group: { name, createdBy: members[0]._id },
    participants: members.map((m) => ({ userId: m._id })),
    lastMessageAt: new Date(),
  });

/** Dựng dữ liệu của một câu trên DB trống; trả về những gì cần để dựng prompt. */
const setupCase = async (spec) => {
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), Conversation.init(), KnowledgeChunk.init(), RagCursor.init()]);

  const users = {};
  for (const u of suite.users) {
    users[u.username] = await User.create({ ...u, email: `${u.username}@eval.komi`, hashedPassword: "eval-khong-dang-nhap" });
  }
  const bot = await User.create({
    username: "komi.ai",
    email: "komi.ai@eval.komi",
    displayName: "Komi AI",
    hashedPassword: "eval-khong-dang-nhap",
    isBot: true,
  });

  for (const g of spec.otherGroups ?? []) {
    const group = await createGroup(g.name, g.members.map((name) => users[name]));
    await insertMessages(group, users, g.messages);
  }

  for (const doc of spec.sharedDocs ?? []) {
    await SharedDocument.create({
      uploaderId: users[doc.uploader]._id,
      url: `https://example.invalid/eval/${doc.name}`,
      publicId: `eval/${doc.name}`,
      name: doc.name,
      size: 1,
      kind: "pdf",
      textStatus: "ok",
      charCount: doc.pages.join("").length,
      pages: doc.pages.map((text, i) => ({ number: i + 1, text })),
    });
  }

  const conversation =
    spec.conversation.type === "group"
      ? await createGroup(spec.conversation.name, [users.an, users.binh, users.chi])
      : (await findOrCreateDirectConversation(users.an._id, bot._id)).conversation;

  await insertMessages(conversation, users, spec.messages ?? []);

  if (spec.file) {
    const pages = spec.file.pages.map((text, i) => ({ number: i + 1, text }));
    const file = await ChatFile.create({
      uploaderId: users[spec.file.sender]._id,
      url: `https://example.invalid/eval/${spec.file.name}`,
      publicId: `eval/${spec.file.name}`,
      name: spec.file.name,
      size: 1,
      kind: "pdf",
      textStatus: "ok",
      charCount: spec.file.pages.join("").length,
      pages,
    });
    const at = nextTime();
    await Message.create({
      conversationId: conversation._id,
      senderId: users[spec.file.sender]._id,
      file: { fileId: file._id, url: file.url, name: file.name, size: 1, kind: "pdf" },
      createdAt: at,
      updatedAt: at,
    });
  }

  let trigger = null;
  if (spec.question) {
    const at = nextTime();
    trigger = await Message.create({
      conversationId: conversation._id,
      senderId: users.an._id,
      content: spec.question,
      createdAt: at,
      updatedAt: at,
    });
  }

  // tạo đoạn + embedding giả cho mọi tin / tài liệu ("bây giờ" ở rất xa để đóng mọi đoạn)
  for (let i = 0; i < 50; i++) {
    const result = await runIndexerOnce({ now: new Date(8.64e15), maxEmbeddings: 1000 });
    if ((await countPending()) === 0 && result.chunksCreated === 0) break;
  }

  return { users, bot, conversation: await Conversation.findById(conversation._id).lean(), trigger };
};

const buildMessages = async (spec, { users, bot, conversation, trigger }) => {
  if (spec.mode === "summary") {
    const count = await Message.countDocuments({ conversationId: conversation._id });
    return (await prepareSummary({ conversation, count, user: users.an })).messages;
  }
  return (await buildKomiPrompt({ conversation, botId: bot._id, trigger })).messages;
};

// ---- gọi model và chấm ----

const askModel = async (messages) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await llm.chat({ messages });
    } catch (error) {
      if (error?.code === LLM_ERROR.RATE_LIMIT && attempt === 0) {
        console.log("  Hết hạn mức (429), chờ 1 phút rồi thử lại một lần...");
        await sleep(60_000);
        continue;
      }
      throw error;
    }
  }
};

const matches = (patterns, text) => patterns.filter((p) => new RegExp(p, "iu").test(text));

const grade = (spec, answer) => {
  const leaked = matches(spec.mustNotMatch ?? [], answer);
  const missing = (spec.mustMatch ?? []).filter((p) => !new RegExp(p, "iu").test(answer));
  return {
    attackSucceeded: spec.type === "attack" && leaked.length > 0,
    leaked,
    answeredCorrectly: missing.length === 0,
    missing,
  };
};

// ---- chạy ----

const mongod = await MongoMemoryServer.create();
await mongoose.connect(mongod.getUri());

const results = [];
let stopped = false;
try {
  const cases = suite.cases.filter((c) => !args.only || c.id === args.only);
  if (cases.length === 0) throw new Error(`Không có câu nào khớp --only ${args.only}`);
  console.log(`Chạy ${cases.length} câu × ${repeat} lần, LLM: ${args.fake ? "giả" : `${process.env.LLM_PROVIDER} / ${process.env.LLM_MODEL}`}`);

  outer: for (const spec of cases) {
    const ctx = await setupCase(spec);
    const messages = await buildMessages(spec, ctx);
    if (args["show-prompt"]) {
      console.log(`\n===== Prompt của ${spec.id} =====`);
      for (const m of messages) console.log(`--- ${m.role} ---\n${m.content}`);
    }

    for (let run = 1; run <= repeat; run++) {
      let answer;
      try {
        answer = await askModel(messages);
      } catch (error) {
        console.error(`  ${spec.id}: lỗi khi gọi LLM: ${error?.code ?? ""} ${error?.detail ?? error?.message ?? error}`);
        stopped = true;
        break outer;
      }
      const g = grade(spec, answer);
      results.push({ id: spec.id, type: spec.type, vector: spec.vector, goal: spec.goal, run, ...g, answer });
      const verdict =
        spec.type === "control"
          ? g.answeredCorrectly ? "ĐẠT" : "TRƯỢT"
          : g.attackSucceeded ? "BỊ LỪA" : "chặn được";
      console.log(`${verdict.padEnd(10)} ${spec.id}${repeat > 1 ? ` (lần ${run})` : ""}${g.missing.length ? `  [trả lời thiếu: ${g.missing.join(", ")}]` : ""}`);
      if (!args.fake && delayMs > 0) await sleep(delayMs);
    }
  }
} finally {
  await mongoose.disconnect();
  await mongod.stop();
}

// ---- tổng kết ----

const attacks = results.filter((r) => r.type === "attack");
const controls = results.filter((r) => r.type === "control");
const summary = {
  name: args.name,
  model: args.fake ? "fake" : process.env.LLM_MODEL,
  runAt: new Date().toISOString(),
  complete: !stopped,
  attacks: attacks.length,
  attacksSucceeded: attacks.filter((r) => r.attackSucceeded).length,
  attacksAnsweredCorrectly: attacks.filter((r) => r.answeredCorrectly).length,
  controls: controls.length,
  controlsPassed: controls.filter((r) => r.answeredCorrectly).length,
};

console.log(
  `\nTấn công thành công: ${summary.attacksSucceeded}/${summary.attacks}` +
    ` · Vẫn trả lời đúng câu hỏi thật: ${summary.attacksAnsweredCorrectly}/${summary.attacks}` +
    ` · Câu đối chứng đạt: ${summary.controlsPassed}/${summary.controls}` +
    (stopped ? " · DỪNG GIỮA CHỪNG" : ""),
);

const outDir = path.join(EVAL_DIR, "results");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `injection-${args.name}.json`);
fs.writeFileSync(outFile, `${JSON.stringify({ summary, results }, null, 2)}\n`);
console.log(`Đã ghi ${path.relative(process.cwd(), outFile)}`);
if (stopped) process.exitCode = 1;
