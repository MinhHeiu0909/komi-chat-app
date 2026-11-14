import { test, before, after, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startDatabase, stopDatabase, auth, createUser } from "./helpers.js";
import { makePdf, makeDocx } from "./documentFixtures.js";

/**
 * Kho tài liệu chung (Giai đoạn 4, bước 4). Thay fileStorage bằng bản giả (không gọi Cloudinary),
 * embedding giả + tìm kiếm giả (không gọi mạng).
 */

process.env.EMBEDDING_PROVIDER = "fake";
process.env.VECTOR_STORE = "memory";
process.env.SHARED_DOC_DAILY_LIMIT = "3";

let app, models, SharedDocument, KnowledgeChunk, DocumentUploadUsage, fileStorage;
let runIndexerOnce, searchKnowledge, MAX_SHARED_INDEX_CHARS;
let A, B, C, groupBC;
let original;
const uploads = [];
const destroyed = [];

const upload = (user, buffer, filename = "tai-lieu.pdf") =>
  request(app).post("/api/documents").set(auth(user)).attach("file", buffer, { filename });
const list = (user) => request(app).get("/api/documents").set(auth(user));
const remove = (user, id) => request(app).delete(`/api/documents/${id}`).set(auth(user));

const PDF = makePdf(["Quy dinh nghi phep: moi nhan vien co 12 ngay phep mot nam", "Nghi om can giay xac nhan"]);

before(async () => {
  models = await startDatabase();
  ({ default: app } = await import("../src/app.js"));
  ({ default: SharedDocument } = await import("../src/models/SharedDocument.js"));
  ({ default: KnowledgeChunk } = await import("../src/models/KnowledgeChunk.js"));
  ({ default: DocumentUploadUsage } = await import("../src/models/DocumentUploadUsage.js"));
  ({ fileStorage } = await import("../src/utils/messageFile.js"));
  ({ runIndexerOnce } = await import("../src/ai/rag/indexer.js"));
  ({ searchKnowledge } = await import("../src/ai/rag/search.js"));
  ({ MAX_SHARED_INDEX_CHARS } = await import("../src/ai/rag/chunking.js"));
  await Promise.all([KnowledgeChunk.init(), DocumentUploadUsage.init()]);

  original = { ...fileStorage };
  fileStorage.isReady = () => true;
  fileStorage.uploadShared = async (_buffer, userId, kind) => {
    const publicId = `komi_chat/shared/${userId}/d${uploads.length}.${kind}`;
    uploads.push(publicId);
    return { secure_url: `https://res.cloudinary.com/demo/raw/upload/v1/${publicId}`, public_id: publicId };
  };
  fileStorage.destroy = async (publicId) => {
    destroyed.push(publicId);
    return { result: "ok" };
  };
});

after(async () => {
  Object.assign(fileStorage, original);
  await stopDatabase();
});

beforeEach(async () => {
  await Promise.all(
    [models.User, models.Conversation, SharedDocument, KnowledgeChunk, DocumentUploadUsage].map((M) => M.deleteMany({})),
  );
  uploads.length = 0;
  destroyed.length = 0;
  fileStorage.isReady = () => true;
  [A, B, C] = await Promise.all(["an", "binh", "chi"].map((n) => createUser(models.User, n)));
  groupBC = await models.Conversation.create({
    type: "group",
    participants: [{ userId: B._id }, { userId: C._id }],
    group: { name: "Phòng Kế toán", createdBy: B._id },
  });
});

describe("tải tài liệu lên kho chung", () => {
  test("tải PDF: lưu vào thư mục kho chung, trích chữ, đang chờ xử lý", async () => {
    const res = await upload(A, PDF, "quy-dinh.pdf");
    assert.equal(res.status, 201);
    const doc = res.body.document;
    assert.equal(doc.name, "quy-dinh.pdf");
    assert.equal(doc.kind, "pdf");
    assert.equal(doc.textStatus, "ok");
    assert.equal(doc.status, "processing");
    assert.equal(doc.canDelete, true);
    assert.equal(doc.uploader.displayName, "an");
    assert.ok(uploads[0].startsWith(`komi_chat/shared/${A._id}/`));

    const saved = await SharedDocument.findById(doc._id).lean();
    assert.deepEqual(saved.pages.map((p) => p.number), [1, 2]);
    assert.equal(saved.chunkedAt, null);
  });

  test("người khác thấy trong danh sách nhưng không xoá được; danh sách không trả chữ của file", async () => {
    await upload(A, PDF);
    await upload(B, makeDocx(["Biên bản họp"]), "bien-ban.docx");

    const res = await list(C);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.documents.map((d) => d.name), ["bien-ban.docx", "tai-lieu.pdf"]); // mới nhất trước
    assert.ok(res.body.documents.every((d) => d.canDelete === false));
    assert.ok(res.body.documents.every((d) => d.pages === undefined && d.publicId === undefined));
    assert.deepEqual(res.body.limits, { dailyUploads: 3, maxIndexChars: MAX_SHARED_INDEX_CHARS });
  });

  test("chặn file không phải PDF/Word, thiếu file, chưa cấu hình Cloudinary; chưa đăng nhập thì 401", async () => {
    assert.equal((await upload(A, Buffer.from("day la file txt"), "a.txt")).status, 400);
    assert.equal((await request(app).post("/api/documents").set(auth(A))).status, 400);
    fileStorage.isReady = () => false;
    assert.equal((await upload(A, PDF)).status, 503);
    assert.equal((await request(app).get("/api/documents")).status, 401);
    // các lần bị chặn không tính vào hạn mức
    assert.equal(await DocumentUploadUsage.countDocuments({ count: { $gt: 0 } }), 0);
  });

  test("tối đa SHARED_DOC_DAILY_LIMIT tài liệu mỗi người mỗi ngày; lỗi giữa chừng thì hoàn lượt", async () => {
    const failing = fileStorage.uploadShared;
    fileStorage.uploadShared = async () => {
      throw new Error("Cloudinary lỗi");
    };
    assert.equal((await upload(A, PDF)).status, 500);
    fileStorage.uploadShared = failing;

    for (let i = 0; i < 3; i++) assert.equal((await upload(A, PDF)).status, 201);
    const blocked = await upload(A, PDF);
    assert.equal(blocked.status, 429);
    assert.match(blocked.body.message, /3 tài liệu/);
    assert.equal((await upload(B, PDF)).status, 201); // hạn mức tính riêng từng người
    assert.equal(await SharedDocument.countDocuments({ uploaderId: A._id }), 3);
  });
});

describe("worker và tìm kiếm", () => {
  test("worker chia thành đoạn kho chung, xong thì trạng thái sẵn sàng", async () => {
    const { body } = await upload(A, PDF, "quy-dinh.pdf");
    await runIndexerOnce();

    const chunks = await KnowledgeChunk.find({ fileId: body.document._id }).sort({ seq: 1 }).lean();
    assert.deepEqual(chunks.map((c) => c.page), [1, 2]);
    assert.ok(chunks.every((c) => c.scope === "shared" && c.conversationId === null && c.sourceType === "sharedDoc"));
    assert.equal(chunks[0].header, 'Tài liệu chung "quy-dinh.pdf", trang 1');

    const [doc] = (await list(B)).body.documents;
    assert.equal(doc.status, "ready");
    assert.deepEqual(doc.chunks, { total: 2, embedded: 2 });
    assert.equal(doc.indexTruncated, false);

    // chạy lại không chia lần nữa
    assert.equal((await runIndexerOnce()).chunksCreated, 0);
  });

  test("ai cũng tìm được tài liệu chung, kể cả khi hỏi trong một nhóm không liên quan", async () => {
    await upload(A, PDF);
    await runIndexerOnce();
    const results = await searchKnowledge({ userId: C._id, conversationId: groupBC._id, query: "nghi phep may ngay" });
    assert.match(results[0].text, /12 ngay phep/);
    assert.equal(results[0].scope, "shared");
  });

  test("chỉ index 50.000 ký tự đầu; ghi trang cuối được index", async () => {
    assert.equal(MAX_SHARED_INDEX_CHARS, 50_000);
    // ~1.000 ký tự mỗi trang (nhiều dòng ngắn: PDF mẫu cắt dòng quá dài), 60 trang
    const line = "noi dung so tay nhan vien ve quy trinh lam viec hang ngay";
    const page = (n) => [`Trang ${n}`, ...Array(17).fill(line)].join("\n");
    const long = makePdf(Array.from({ length: 60 }, (_, i) => page(i + 1)));
    const { body } = await upload(A, long, "so-tay.pdf");
    assert.equal(body.document.indexTruncated, true);
    assert.equal(body.document.indexedUntilPage, 51); // trang 51 bị cắt dở

    await runIndexerOnce({ maxEmbeddings: 0 });
    const chunks = await KnowledgeChunk.find({ fileId: body.document._id }).lean();
    assert.ok(chunks.length > 0);
    assert.ok(chunks.every((c) => c.page <= 51));
    assert.ok(chunks.some((c) => c.page === 51));
    assert.ok(chunks.reduce((n, c) => n + c.text.length, 0) <= MAX_SHARED_INDEX_CHARS);

    const [doc] = (await list(A)).body.documents;
    assert.equal(doc.status, "processing"); // chưa embedding
  });

  test("PDF scan (không có chữ) thì không đọc được, không tạo đoạn", async () => {
    const { body } = await upload(A, makePdf(["", ""]), "scan.pdf");
    assert.equal(body.document.status, "unreadable");
    await runIndexerOnce();
    assert.equal(await KnowledgeChunk.countDocuments({ fileId: body.document._id }), 0);
    assert.equal((await list(A)).body.documents[0].status, "unreadable");
  });
});

describe("xoá tài liệu", () => {
  test("chỉ người tải lên xoá được (người khác 403); xoá cả đoạn RAG và file trên Cloudinary", async () => {
    const { body } = await upload(A, PDF);
    const id = body.document._id;
    await runIndexerOnce();
    assert.ok((await KnowledgeChunk.countDocuments({ fileId: id })) > 0);

    assert.equal((await remove(B, id)).status, 403);
    assert.ok(await SharedDocument.exists({ _id: id }));

    assert.equal((await remove(A, id)).status, 204);
    assert.equal(await SharedDocument.exists({ _id: id }), null);
    assert.equal(await KnowledgeChunk.countDocuments({ fileId: id }), 0);
    assert.deepEqual(destroyed, [uploads[0]]);
    assert.deepEqual((await list(A)).body.documents, []);
  });

  test("id sai hoặc không có thì 404; xoá Cloudinary lỗi vẫn xoá được trong app", async () => {
    assert.equal((await remove(A, "khong-hop-le")).status, 404);
    assert.equal((await remove(A, "64b000000000000000000000")).status, 404);

    const { body } = await upload(A, PDF);
    const failing = fileStorage.destroy;
    fileStorage.destroy = async () => {
      throw new Error("Cloudinary lỗi");
    };
    const originalError = console.error;
    console.error = () => {};
    try {
      assert.equal((await remove(A, body.document._id)).status, 204);
    } finally {
      fileStorage.destroy = failing;
      console.error = originalError;
    }
    assert.equal(await SharedDocument.countDocuments(), 0);
  });
});
