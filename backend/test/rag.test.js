import { test, before, after, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import { startDatabase, stopDatabase, createUser } from "./helpers.js";

/**
 * RAG bước 3: chia đoạn, worker chạy nền, tìm kiếm lọc theo quyền.
 * Embedding giả (EMBEDDING_PROVIDER=fake) + tìm kiếm giả (VECTOR_STORE=memory), không gọi mạng.
 */

process.env.EMBEDDING_PROVIDER = "fake";
process.env.VECTOR_STORE = "memory";
delete process.env.EMBEDDING_DIMENSIONS;

const chunking = await import("../src/ai/rag/chunking.js");
const { buildMessageWindows, splitText, chunkFilePages, formatMessageLine, MAX_GAP_MS, IDLE_CLOSE_MS } = chunking;
const { runIndexerOnce, embedPending, countPending, createRateBudget, createIndexerTick, EMBEDDINGS_PER_MINUTE } =
  await import("../src/ai/rag/indexer.js");
const { searchKnowledge, allowedConversationIds } = await import("../src/ai/rag/search.js");
const { vectorSearch } = await import("../src/ai/rag/vectorStore.js");
const { embeddings } = await import("../src/ai/embeddings.js");
const { LLMError, LLM_ERROR } = await import("../src/ai/errors.js");
const { findOrCreateDirectConversation } = await import("../src/utils/directConversation.js");

const MINUTE = 60_000;
const T0 = new Date("2026-11-10T02:00:00Z"); // 9h sáng giờ Việt Nam
const at = (minutes) => new Date(T0.getTime() + minutes * MINUTE);
const LATER = at(24 * 60); // đủ lâu để mọi đoạn đã "im lặng"

// ---- Chia đoạn (hàm thuần) ----

describe("gom tin nhắn thành đoạn", () => {
  const item = (minute, line = `tin ${minute}`) => ({ _id: `m${minute}`, createdAt: at(minute), line });

  test("đủ 10 tin thì đóng đoạn ngay, phần còn lại chờ im lặng", () => {
    const items = Array.from({ length: 13 }, (_, i) => item(i));
    const { windows, consumed } = buildMessageWindows(items, at(15));
    assert.deepEqual(windows.map((w) => w.length), [10]);
    assert.equal(consumed, 9); // 3 tin sau thuộc đoạn còn mở

    const idle = buildMessageWindows(items, at(12 + IDLE_CLOSE_MS / MINUTE));
    assert.deepEqual(idle.windows.map((w) => w.length), [10, 3]);
    assert.equal(idle.consumed, 12);
  });

  test("hai tin cách nhau hơn 1 giờ thì sang đoạn mới", () => {
    const gap = MAX_GAP_MS / MINUTE;
    const items = [item(0), item(5), item(5 + gap + 1), item(5 + gap + 2)];
    const { windows } = buildMessageWindows(items, LATER);
    assert.deepEqual(windows.map((w) => w.map((x) => x._id)), [["m0", "m5"], [`m${5 + gap + 1}`, `m${5 + gap + 2}`]]);
  });

  test("quá khoảng 1.000 ký tự thì sang đoạn mới", () => {
    const long = "x".repeat(600);
    const { windows } = buildMessageWindows([item(0, long), item(1, long), item(2, "ngắn")], LATER);
    assert.deepEqual(windows.map((w) => w.length), [1, 2]);
  });

  test("tin bị bỏ qua không vào đoạn; chỉ tính là đã xử lý khi không nằm trong đoạn còn mở", () => {
    const items = [item(0, null), item(1), item(2, null)];
    const open = buildMessageWindows(items, at(3));
    assert.equal(open.windows.length, 0);
    assert.equal(open.consumed, 0); // tin bot ở cuối nằm sau đoạn còn mở: lần sau đọc lại

    const closed = buildMessageWindows(items, LATER);
    assert.deepEqual(closed.windows.map((w) => w.map((x) => x._id)), [["m1"]]);
    assert.equal(closed.consumed, 2);
  });

  test("dòng tin có giờ Việt Nam, tên người gửi, tên file; tin không có chữ thì bỏ", () => {
    assert.equal(
      formatMessageLine({ createdAt: T0, senderName: "Bình", content: "Họp lúc 9h", fileName: "lich.pdf" }),
      "[10/11/2026 09:00] Bình: Họp lúc 9h (gửi file: lich.pdf)",
    );
    assert.equal(formatMessageLine({ createdAt: T0, senderName: "Bình", content: "  " }), null);
  });
});

describe("chia file thành đoạn", () => {
  test("trang ngắn giữ nguyên một đoạn; trang dài chia ~1.000 ký tự, chồng nhau, không cắt giữa chữ", () => {
    assert.deepEqual(splitText("  Một   trang\nngắn "), ["Một trang ngắn"]);

    const words = Array.from({ length: 400 }, (_, i) => `chữ${i}`);
    const pieces = splitText(words.join(" "));
    assert.ok(pieces.length >= 3);
    for (const piece of pieces) {
      assert.ok(piece.length <= 1000);
      for (const w of piece.split(" ")) assert.ok(words.includes(w), `bị cắt giữa chữ: ${w}`);
    }
    // đoạn sau bắt đầu bằng phần cuối của đoạn trước (chồng nhau)
    const lastWord = pieces[0].split(" ").at(-1);
    assert.ok(pieces[1].split(" ").includes(lastWord));
    // ghép lại đủ mọi chữ
    assert.deepEqual(new Set(pieces.flatMap((p) => p.split(" "))), new Set(words));
  });

  test("giữ số trang, không vắt qua hai trang; .docx không có trang", () => {
    const pieces = chunkFilePages([
      { number: 1, text: "Trang một" },
      { number: 2, text: "" },
      { number: 3, text: "Trang ba" },
    ]);
    assert.deepEqual(pieces, [
      { page: 1, text: "Trang một" },
      { page: 3, text: "Trang ba" },
    ]);
    assert.deepEqual(chunkFilePages([{ text: "Word" }]), [{ page: null, text: "Word" }]);
  });
});

// ---- Worker và tìm kiếm (MongoDB trong bộ nhớ) ----

let models, ChatFile, KnowledgeChunk, RagCursor;
let A, B, C, bot;

const send = async (conversation, sender, minute, content, extra = {}) => {
  const createdAt = at(minute);
  const message = await models.Message.create({
    conversationId: conversation._id,
    senderId: sender._id,
    content,
    createdAt,
    updatedAt: createdAt,
    ...extra,
  });
  await models.Conversation.updateOne({ _id: conversation._id }, { $max: { lastMessageAt: createdAt } });
  return message;
};

const makeGroup = (name, members) =>
  models.Conversation.create({
    type: "group",
    group: { name, createdBy: members[0]._id },
    participants: members.map((m) => ({ userId: m._id })),
  });

const direct = async (x, y) => (await findOrCreateDirectConversation(x._id, y._id)).conversation;

const makeFile = (owner, name, pages, textStatus = "ok") =>
  ChatFile.create({
    uploaderId: owner._id,
    url: `https://example.com/${name}`,
    publicId: name,
    name,
    size: 100,
    kind: "pdf",
    textStatus,
    pages,
    charCount: pages.reduce((n, p) => n + p.text.length, 0),
  });

const fileRef = (file) => ({ fileId: file._id, url: file.url, name: file.name, size: file.size, kind: file.kind });

const chunksOf = (conversation) =>
  KnowledgeChunk.find({ conversationId: conversation._id }).sort({ startAt: 1, seq: 1 }).lean();

before(async () => {
  models = await startDatabase();
  ({ default: ChatFile } = await import("../src/models/ChatFile.js"));
  ({ default: KnowledgeChunk } = await import("../src/models/KnowledgeChunk.js"));
  ({ default: RagCursor } = await import("../src/models/RagCursor.js"));
  await Promise.all([KnowledgeChunk.init(), RagCursor.init()]);
});

after(stopDatabase);

beforeEach(async () => {
  await Promise.all(
    [models.User, models.Conversation, models.Message, ChatFile, KnowledgeChunk, RagCursor].map((M) => M.deleteMany({})),
  );
  [A, B, C] = await Promise.all([createUser(models.User, "an"), createUser(models.User, "binh"), createUser(models.User, "chi")]);
  bot = await models.User.create({
    username: "komi.ai",
    email: "komi@example.com",
    hashedPassword: "x",
    displayName: "Komi AI",
    isBot: true,
  });
});

describe("worker tạo index", () => {
  test("gom tin của nhóm thành đoạn có tên nhóm và người gửi; chạy lại không tạo trùng", async () => {
    const group = await makeGroup("Dự án Alpha", [A, B]);
    await send(group, A, 0, "Mấy giờ họp giao ban?");
    await send(group, B, 1, "9h sáng thứ Ba nhé");

    const first = await runIndexerOnce({ now: LATER });
    assert.equal(first.chunksCreated, 1);
    assert.equal(first.embedded, 1);

    const [chunk] = await chunksOf(group);
    assert.equal(chunk.header, 'Nhóm "Dự án Alpha"');
    assert.equal(chunk.text, "[10/11/2026 09:00] an: Mấy giờ họp giao ban?\n[10/11/2026 09:01] binh: 9h sáng thứ Ba nhé");
    assert.equal(chunk.scope, "conversation");
    assert.equal(chunk.embedding.length, 768);
    assert.ok(chunk.embeddedAt);

    const again = await runIndexerOnce({ now: LATER });
    assert.deepEqual(again, { chunksCreated: 0, embedded: 0 });
    assert.equal(await KnowledgeChunk.countDocuments(), 1);
  });

  test("đoạn còn mở chỉ được tạo khi cuộc trò chuyện im lặng 10 phút; tin mới sau đó vào đoạn mới", async () => {
    const group = await makeGroup("Nhóm", [A, B]);
    await send(group, A, 0, "tin một");
    await send(group, B, 2, "tin hai");

    assert.equal((await runIndexerOnce({ now: at(5) })).chunksCreated, 0);
    assert.equal((await runIndexerOnce({ now: at(12) })).chunksCreated, 1);

    await send(group, A, 20, "tin ba");
    assert.equal((await runIndexerOnce({ now: at(31) })).chunksCreated, 1);
    assert.deepEqual(
      (await chunksOf(group)).map((c) => c.text.split("\n").length),
      [2, 1],
    );
  });

  test("bỏ tin của Komi AI; bỏ chữ trong chat riêng với Komi nhưng vẫn lấy file", async () => {
    const group = await makeGroup("Nhóm", [A, B, bot]);
    await send(group, A, 0, "@komi tóm tắt giúp");
    await send(group, bot, 1, "Câu trả lời của bot");

    const komiChat = await direct(A, bot);
    const file = await makeFile(A, "hop-dong.pdf", [{ number: 1, text: "Điều khoản thanh toán" }]);
    await send(komiChat, A, 0, "câu hỏi riêng với bot", { file: fileRef(file) });
    await send(komiChat, bot, 1, "bot trả lời");

    await runIndexerOnce({ now: LATER });

    const groupChunks = await chunksOf(group);
    assert.equal(groupChunks.length, 1);
    assert.ok(!groupChunks[0].text.includes("Câu trả lời của bot"));

    const komiChunks = await chunksOf(komiChat);
    assert.deepEqual(komiChunks.map((c) => c.sourceType), ["chatFile"]);
    assert.equal(komiChunks[0].text, "Điều khoản thanh toán");
  });

  test("file gửi vào hai cuộc trò chuyện có hai bộ đoạn; ghi trang; file không có chữ thì bỏ", async () => {
    const g1 = await makeGroup("Một", [A, B]);
    const g2 = await makeGroup("Hai", [A, C]);
    const file = await makeFile(A, "bao-gia.pdf", [
      { number: 1, text: "Báo giá" },
      { number: 2, text: "Tổng 50 triệu" },
    ]);
    const scan = await makeFile(A, "scan.pdf", [], "empty");
    await send(g1, A, 0, "", { file: fileRef(file) });
    await send(g2, A, 0, "gửi lại", { file: fileRef(file) });
    await send(g2, A, 1, "", { file: fileRef(scan) });

    await runIndexerOnce({ now: LATER });

    const fileChunks = await KnowledgeChunk.find({ sourceType: "chatFile" }).sort({ seq: 1 }).lean();
    assert.equal(fileChunks.length, 4);
    for (const g of [g1, g2]) {
      const mine = fileChunks.filter((c) => c.conversationId.equals(g._id));
      assert.deepEqual(mine.map((c) => c.page), [1, 2]);
      assert.ok(mine.every((c) => c.fileName === "bao-gia.pdf"));
    }
    assert.match(fileChunks.find((c) => c.conversationId.equals(g1._id)).header, /^File "bao-gia.pdf", trang 1 — gửi trong Nhóm "Một"$/);
    // tin chỉ có file vẫn vào đoạn tin nhắn (dòng "gửi file")
    assert.match((await KnowledgeChunk.findOne({ conversationId: g1._id, sourceType: "message" })).text, /gửi file: bao-gia.pdf/);
  });

  test("embedding theo hạn mức: mỗi lượt tối đa maxEmbeddings, phần còn lại chờ lượt sau", async () => {
    const group = await makeGroup("Nhóm", [A, B]);
    for (let i = 0; i < 5; i++) await send(group, A, i * 90, `tin ${i}`); // cách nhau 90 phút: 5 đoạn

    const first = await runIndexerOnce({ now: LATER, maxEmbeddings: 2 });
    assert.deepEqual(first, { chunksCreated: 5, embedded: 2 });
    assert.equal(await countPending(), 3);

    assert.equal(await embedPending({ limit: 0 }), 0);
    assert.equal((await runIndexerOnce({ now: LATER, maxEmbeddings: 10 })).embedded, 3);
    assert.equal(await countPending(), 0);
  });

  test("hơn 500 tin vẫn đọc hết qua nhiều lô", async () => {
    const group = await makeGroup("Nhóm", [A, B]);
    const docs = Array.from({ length: 1205 }, (_, i) => ({
      conversationId: group._id,
      senderId: A._id,
      content: `tin ${i}`,
      createdAt: at(i),
      updatedAt: at(i),
    }));
    await models.Message.insertMany(docs);
    await models.Conversation.updateOne({ _id: group._id }, { lastMessageAt: at(1204) });

    const { chunksCreated } = await runIndexerOnce({ now: LATER, maxEmbeddings: 0 });
    assert.equal(chunksCreated, 121); // 120 đoạn 10 tin + 1 đoạn 5 tin
    const chunks = await chunksOf(group);
    assert.equal(chunks.reduce((n, c) => n + c.text.split("\n").length, 0), 1205);
  });

  test("embedding tắt thì worker không làm gì", async () => {
    const group = await makeGroup("Nhóm", [A, B]);
    await send(group, A, 0, "tin");
    process.env.EMBEDDING_PROVIDER = "";
    try {
      assert.deepEqual(await runIndexerOnce({ now: LATER }), { chunksCreated: 0, embedded: 0 });
    } finally {
      process.env.EMBEDDING_PROVIDER = "fake";
    }
    assert.equal(await KnowledgeChunk.countDocuments(), 0);
  });
});

describe("hạn mức của worker", () => {
  test("mỗi phút tối đa 60 đoạn, sang phút mới thì tính lại", () => {
    let t = 0;
    const budget = createRateBudget({ now: () => t });
    assert.equal(budget.available(), EMBEDDINGS_PER_MINUTE);
    budget.use(50);
    assert.equal(budget.available(), 10);
    t = 59_000;
    assert.equal(budget.available(), 10);
    t = 60_000;
    assert.equal(budget.available(), EMBEDDINGS_PER_MINUTE);
  });

  test("lỗi 429 thì nghỉ tới phút sau, không gọi lại ngay; sai key thì nghỉ 10 phút", async () => {
    const group = await makeGroup("Nhóm", [A, B]);
    await send(group, A, 0, "tin");

    let t = LATER.getTime();
    let calls = 0;
    let failWith = LLM_ERROR.RATE_LIMIT;
    const original = embeddings.embed;
    embeddings.embed = async () => {
      calls += 1;
      throw new LLMError(failWith);
    };
    const silent = { log() {}, error() {} };
    try {
      const budget = createRateBudget({ now: () => t });
      const tick = createIndexerTick({ budget, now: () => t, log: silent });
      assert.equal(await tick(), null);
      assert.equal(calls, 1);

      t += 30_000;
      await tick(); // vẫn đang nghỉ: không gọi
      assert.equal(calls, 1);

      t += 31_000;
      failWith = LLM_ERROR.AUTH;
      await tick();
      assert.equal(calls, 2);

      t += 9 * MINUTE;
      await tick();
      assert.equal(calls, 2);

      embeddings.embed = original;
      t += 2 * MINUTE;
      assert.deepEqual(await tick(), { chunksCreated: 0, embedded: 1 });
    } finally {
      embeddings.embed = original;
    }
  });
});

describe("tìm kiếm lọc theo quyền", () => {
  let group, dmAB, komiChat, other;

  beforeEach(async () => {
    group = await makeGroup("Dự án", [A, B, bot]);
    dmAB = await direct(A, B);
    komiChat = await direct(A, bot);
    other = await makeGroup("Nhóm khác", [B, C]);

    await send(group, B, 0, "Ngân sách quý này là 200 triệu");
    await send(dmAB, B, 0, "Lịch họp giao ban: 9h sáng thứ Ba, phòng 301");
    await send(other, C, 0, "Lịch họp giao ban nhóm khác: 14h thứ Năm");
    await runIndexerOnce({ now: LATER });
  });

  const texts = (results) => results.map((r) => r.text);

  test("hỏi trong nhóm: chỉ tìm trong nhóm đó, không lấy chat riêng của người hỏi", async () => {
    const results = await searchKnowledge({ userId: A._id, conversationId: group._id, query: "lịch họp giao ban" });
    assert.ok(results.length > 0);
    assert.ok(results.every((r) => r.conversationId.equals(group._id)));
    assert.ok(results.every((r) => r.embedding === undefined)); // không trả vector ra ngoài
  });

  test("chat riêng với Komi: tìm trên mọi cuộc trò chuyện người hỏi là thành viên, đúng đoạn lên đầu", async () => {
    const results = await searchKnowledge({ userId: A._id, conversationId: komiChat._id, query: "lịch họp giao ban" });
    assert.match(results[0].text, /9h sáng thứ Ba/);
    assert.ok(!texts(results).some((t) => t.includes("nhóm khác"))); // A không ở nhóm khác
    assert.ok(results.every((r) => r.score > 0 && r.score <= 1));
  });

  test("người ngoài nhận danh sách rỗng", async () => {
    assert.deepEqual(await searchKnowledge({ userId: C._id, conversationId: group._id, query: "ngân sách" }), []);
    assert.equal(await allowedConversationIds({ userId: C._id, conversationId: group._id }), null);
  });

  test("kho chung: ai cũng tìm được; đoạn chưa có embedding thì chưa tìm được", async () => {
    await KnowledgeChunk.create([
      {
        key: "shared:1",
        scope: "shared",
        sourceType: "sharedDoc",
        text: "Quy định nghỉ phép: 12 ngày mỗi năm",
        embedding: (await embeddings.embed({ texts: ["Quy định nghỉ phép: 12 ngày mỗi năm"] }))[0],
        embeddedAt: new Date(),
      },
      { key: "shared:2", scope: "shared", sourceType: "sharedDoc", text: "Quy định nghỉ phép bản nháp" },
    ]);
    const results = await searchKnowledge({ userId: C._id, conversationId: other._id, query: "nghỉ phép", k: 10 });
    assert.ok(texts(results).includes("Quy định nghỉ phép: 12 ngày mỗi năm"));
    assert.ok(!texts(results).includes("Quy định nghỉ phép bản nháp"));
  });

  test("không có conversation nào và không tìm kho chung thì không trả gì", async () => {
    const [vector] = await embeddings.embed({ texts: ["ngân sách"] });
    assert.deepEqual(await vectorSearch({ vector, conversationIds: [] }), []);
    assert.equal((await vectorSearch({ vector, conversationIds: [group._id], k: 1 })).length, 1);
  });
});
