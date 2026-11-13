import { test, before, after, afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { startDatabase, stopDatabase, auth, createUser } from "./helpers.js";
import { makePdf, makeDocx } from "./documentFixtures.js";

const PDF = makePdf(["Tai lieu mau"]);
const DOCX = makeDocx(["Biên bản họp"]);

/**
 * Gửi file tài liệu (PDF / Word .docx) trong chat. Thay fileStorage bằng bản giả,
 * không gọi Cloudinary thật.
 */

let app, models, ChatFile, fileStorage, messageFile;
let A, B, C, group;
let original;


const uploads = [];

const upload = (user, buffer, filename) =>
  request(app).post("/api/messages/files").set(auth(user)).attach("file", buffer, { filename });

const sendGroup = (user, body) =>
  request(app)
    .post("/api/messages/group")
    .set(auth(user))
    .send({ conversationId: group._id.toString(), ...body });

before(async () => {
  models = await startDatabase();
  ({ default: app } = await import("../src/app.js"));
  ({ default: ChatFile } = await import("../src/models/ChatFile.js"));
  messageFile = await import("../src/utils/messageFile.js");
  ({ fileStorage } = messageFile);

  original = { ...fileStorage };
  fileStorage.isReady = () => true;
  fileStorage.upload = async (_buffer, userId, kind) => {
    const publicId = `komi_chat/files/${userId}/f${uploads.length}.${kind}`;
    uploads.push(publicId);
    return { secure_url: `https://res.cloudinary.com/demo/raw/upload/v1/${publicId}`, public_id: publicId };
  };

  [A, B, C] = await Promise.all(["an", "binh", "chi"].map((n) => createUser(models.User, n)));
  group = await models.Conversation.create({
    type: "group",
    participants: [{ userId: A._id }, { userId: B._id }],
    group: { name: "Phòng Kế toán", createdBy: A._id },
    lastMessageAt: new Date(),
  });
});

afterEach(() => {
  fileStorage.isReady = () => true;
});

after(async () => {
  Object.assign(fileStorage, original);
  await stopDatabase();
});

describe("nhận dạng file", () => {
  test("PDF và DOCX theo nội dung; file khác, zip không phải Word, rỗng thì không nhận", () => {
    assert.equal(messageFile.detectDocumentKind(PDF), "pdf");
    assert.equal(messageFile.detectDocumentKind(DOCX), "docx");
    assert.equal(messageFile.detectDocumentKind(Buffer.from("xin chào, đây là file txt")), null);
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("xl/workbook.xml.....")]);
    assert.equal(messageFile.detectDocumentKind(zip), null);
    assert.equal(messageFile.detectDocumentKind(Buffer.alloc(0)), null);
  });

  test("tên file: bỏ đường dẫn, ký tự điều khiển, cắt ngắn, đúng đuôi", () => {
    assert.equal(messageFile.cleanFileName("../../etc/Báo cáo.pdf", "pdf"), "Báo cáo.pdf");
    assert.equal(messageFile.cleanFileName("hop\u0000dong", "docx"), "hopdong.docx");
    assert.equal(messageFile.cleanFileName("", "pdf"), "tai-lieu.pdf");
    const long = messageFile.cleanFileName(`${"a".repeat(300)}.pdf`, "pdf");
    assert.equal(long.length, messageFile.MAX_FILE_NAME_LENGTH);
    assert.ok(long.endsWith(".pdf"));
  });
});

describe("tải file lên", () => {
  test("PDF: lưu ChatFile của người tải, giữ tên tiếng Việt", async () => {
    const res = await upload(A, PDF, "Báo cáo quý 3.pdf").expect(201);
    assert.equal(res.body.file.name, "Báo cáo quý 3.pdf");
    assert.equal(res.body.file.kind, "pdf");
    assert.equal(res.body.file.size, PDF.length);
    assert.match(res.body.file.url, new RegExp(`/komi_chat/files/${A._id}/`));

    const saved = await ChatFile.findById(res.body.file._id).lean();
    assert.equal(saved.uploaderId.toString(), A._id.toString());
    assert.ok(saved.publicId);
  });

  test("DOCX được nhận; đuôi file sai theo nội dung thì sửa lại", async () => {
    const res = await upload(A, DOCX, "hop-dong.pdf").expect(201);
    assert.equal(res.body.file.kind, "docx");
    assert.equal(res.body.file.name, "hop-dong.pdf.docx");
  });

  test("file không phải PDF/Word (dù đặt tên .pdf) → 400; quá 10MB → 413; thiếu file → 400", async () => {
    const before = uploads.length;
    await upload(A, Buffer.from("<html>giả làm pdf</html>"), "bao-cao.pdf").expect(400);
    const big = Buffer.concat([PDF, Buffer.alloc(messageFile.MAX_MESSAGE_FILE_BYTES)]);
    await upload(A, big, "lon.pdf").expect(413);
    await request(app).post("/api/messages/files").set(auth(A)).expect(400);
    assert.equal(uploads.length, before); // không tải gì lên Cloudinary
  });

  test("chưa cấu hình Cloudinary → 503", async () => {
    fileStorage.isReady = () => false;
    await upload(A, PDF, "a.pdf").expect(503);
  });
});

describe("gửi tin kèm file", () => {
  test("gửi file không kèm chữ: tin có bản trích file, danh sách chat hiện 📎 tên file", async () => {
    const { body } = await upload(A, PDF, "Kế hoạch 2027.pdf").expect(201);
    const res = await sendGroup(A, { fileId: body.file._id }).expect(201);

    assert.deepEqual(res.body.message.file, {
      fileId: body.file._id,
      url: body.file.url,
      name: "Kế hoạch 2027.pdf",
      size: PDF.length,
      kind: "pdf",
    });
    const convo = await models.Conversation.findById(group._id).lean();
    assert.equal(convo.lastMessage.content, "📎 Kế hoạch 2027.pdf");
  });

  test("trả lời tin chỉ có file: đoạn trích là 📎 tên file", async () => {
    const { body } = await upload(B, DOCX, "Biên bản.docx").expect(201);
    const sent = await sendGroup(B, { fileId: body.file._id, content: "Biên bản họp đây" }).expect(201);
    const fileOnly = await sendGroup(B, { fileId: body.file._id }).expect(201);

    const reply = await sendGroup(A, { content: "Đã nhận", replyToId: fileOnly.body.message._id }).expect(201);
    assert.equal(reply.body.message.replyTo.content, "📎 Biên bản.docx");
    assert.equal(sent.body.message.content, "Biên bản họp đây");
  });

  test("không gửi được file của người khác, id bậy hay id không tồn tại", async () => {
    const { body } = await upload(A, PDF, "rieng-cua-an.pdf").expect(201);
    for (const fileId of [body.file._id, "khong-phai-id", "64b000000000000000000000"]) {
      const res = await sendGroup(B, { fileId }).expect(400);
      assert.equal(res.body.message, "Tệp không hợp lệ", String(fileId));
    }
  });

  test("người ngoài nhóm gửi file vào nhóm → 404", async () => {
    const { body } = await upload(C, PDF, "c.pdf").expect(201);
    await sendGroup(C, { fileId: body.file._id }).expect(404);
  });
});

describe("trích chữ lúc tải lên", () => {
  test("PDF: lưu chữ theo từng trang", async () => {
    const pdf = makePdf(["Ngan sach du an: 50 trieu\nHan chot 15/12", "Trang hai: hop luc 9h sang thu Hai"]);
    const res = await upload(A, pdf, "ke-hoach.pdf").expect(201);
    assert.equal(res.body.file.textStatus, "ok");

    const saved = await ChatFile.findById(res.body.file._id).lean();
    assert.equal(saved.textStatus, "ok");
    assert.deepEqual(saved.pages, [
      { number: 1, text: "Ngan sach du an: 50 trieu\nHan chot 15/12" },
      { number: 2, text: "Trang hai: hop luc 9h sang thu Hai" },
    ]);
    assert.equal(saved.charCount, saved.pages.reduce((n, p) => n + p.text.length, 0));
    assert.equal(saved.textTruncated, false);
  });

  test("Word .docx: giữ dấu tiếng Việt, không có số trang", async () => {
    const docx = makeDocx(["Biên bản họp quý 4", "Chị Hoa phụ trách báo giá cho khách Hoà Phát"]);
    const res = await upload(B, docx, "Biên bản.docx").expect(201);
    const saved = await ChatFile.findById(res.body.file._id).lean();
    assert.equal(saved.textStatus, "ok");
    assert.equal(saved.pages.length, 1);
    assert.equal(saved.pages[0].number, undefined);
    assert.match(saved.pages[0].text, /Chị Hoa phụ trách báo giá cho khách Hoà Phát/);
  });

  test("PDF không có chữ (giống bản scan) → empty; PDF hỏng → failed; vẫn tải lên được", async () => {
    const scan = await upload(A, makePdf(["", ""]), "scan.pdf").expect(201);
    assert.equal(scan.body.file.textStatus, "empty");
    assert.deepEqual((await ChatFile.findById(scan.body.file._id).lean()).pages, []);

    const broken = await upload(A, Buffer.from("%PDF-1.7 hong roi"), "hong.pdf").expect(201);
    assert.equal(broken.body.file.textStatus, "failed");
  });

  test("gửi tin kèm file không đưa phần chữ đã trích ra ngoài", async () => {
    const { body } = await upload(A, makePdf(["Bi mat noi bo"]), "noi-bo.pdf").expect(201);
    const res = await sendGroup(A, { fileId: body.file._id }).expect(201);
    assert.deepEqual(Object.keys(res.body.message.file).sort(), ["fileId", "kind", "name", "size", "url"]);
    const stored = await models.Message.findById(res.body.message._id).lean();
    assert.equal(stored.file.pages, undefined);
  });

  test("chữ quá dài bị cắt khi lưu, giữ phần đầu", async () => {
    const { extractDocumentText, MAX_STORED_CHARS } = await import("../src/utils/documentText.js");
    const long = "Mot dong chu dai. ".repeat(Math.ceil(MAX_STORED_CHARS / 18) + 100);
    const result = await extractDocumentText(makeDocx([long]), "docx");
    assert.equal(result.status, "ok");
    assert.equal(result.truncated, true);
    assert.equal(result.charCount, MAX_STORED_CHARS);
    assert.ok(result.pages[0].text.startsWith("Mot dong chu dai."));
  });
});
