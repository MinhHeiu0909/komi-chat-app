/**
 * Thử tìm kiếm RAG trên dữ liệu thật (sau khi chạy npm run rag:index).
 *
 *   npm run rag:search -- "Link staging ở đâu?" --user an.nguyen
 *       tìm như khi hỏi trong chat riêng với Komi: mọi cuộc trò chuyện của user + kho chung
 *   npm run rag:search -- "Mấy giờ họp?" --user an.nguyen --group "Đồ án Komi" -k 3
 *       tìm như khi @komi trong nhóm: chỉ nhóm đó + kho chung
 */
import "dotenv/config";
import mongoose from "mongoose";
import Conversation from "../src/models/Conversation.js";
import User from "../src/models/User.js";
import { DEFAULT_K, searchKnowledge, searchWithin } from "../src/ai/rag/search.js";

// tham số: --user, --group, -k có giá trị đi sau; phần còn lại là câu hỏi
const options = {};
const words = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (["--user", "--group", "-k"].includes(args[i])) options[args[i]] = args[++i];
  else words.push(args[i]);
}
const query = words.join(" ").trim();
const username = options["--user"];
const groupName = options["--group"];
const k = Number(options["-k"] ?? DEFAULT_K);

const shorten = (text, max = 300) => (text.length > max ? `${text.slice(0, max)}…` : text);

const run = async () => {
  if (!query || !username || !(k > 0)) {
    throw new Error('Cách dùng: npm run rag:search -- "câu hỏi" --user <username> [--group "<tên nhóm>"] [-k 5]');
  }
  await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);

  const user = await User.findOne({ username }, { _id: 1 }).lean();
  if (!user) throw new Error(`Không có user ${username}`);

  let results;
  if (groupName) {
    const group = await Conversation.findOne(
      { type: "group", "group.name": groupName, "participants.userId": user._id },
      { _id: 1 },
    ).lean();
    if (!group) throw new Error(`${username} không ở nhóm "${groupName}"`);
    results = await searchKnowledge({ userId: user._id, conversationId: group._id, query, k });
  } else {
    const conversationIds = await Conversation.find({ "participants.userId": user._id }).distinct("_id");
    results = await searchWithin({ conversationIds, includeShared: true, query, k });
  }

  console.log(`"${query}" — ${results.length} kết quả\n`);
  results.forEach((r, i) => {
    const source = r.sourceType === "message" ? "tin nhắn" : `file ${r.fileName}${r.page ? `, trang ${r.page}` : ""}`;
    console.log(`${i + 1}. điểm ${r.score.toFixed(3)} · ${source} · ${r.header}`);
    console.log(`   ${shorten(r.text).replace(/\n/g, "\n   ")}\n`);
  });
};

run()
  .catch((error) => {
    console.error(error?.detail ?? error?.message ?? error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
