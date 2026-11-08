/**
 * Tạo dữ liệu demo: 5 người dùng, bạn bè, 2 chat 1-1, 2 nhóm và tin nhắn tiếng Việt.
 *
 *   npm run seed            # chỉ chạy khi database chưa có user demo
 *   npm run seed -- --reset # XOÁ toàn bộ dữ liệu rồi tạo lại
 *
 * Mọi tài khoản demo dùng mật khẩu: komi123
 * Nội dung tin nhắn được viết sẵn để sau này làm bộ câu hỏi đánh giá cho RAG
 * (ví dụ: "Link deploy bản staging ở đâu?", "Ai phụ trách phần socket?").
 */
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../src/models/User.js";
import Friend from "../src/models/Friend.js";
import FriendRequest from "../src/models/FriendRequest.js";
import Conversation, { makeDirectKey } from "../src/models/Conversation.js";
import Message from "../src/models/Message.js";
import Session from "../src/models/Session.js";

const DEMO_PASSWORD = "komi123";
const reset = process.argv.includes("--reset");

if (process.env.NODE_ENV === "production") {
  console.error("Không chạy seed trên môi trường production.");
  process.exit(1);
}

const USERS = [
  { username: "an", displayName: "Nguyễn Văn An", bio: "Backend dev, thích Node.js" },
  { username: "binh", displayName: "Trần Thị Bình", bio: "Frontend, mê Tailwind" },
  { username: "chi", displayName: "Lê Minh Chi", bio: "Đang học AI Engineering" },
  { username: "dung", displayName: "Phạm Quốc Dũng", bio: "DevOps nghiệp dư" },
  { username: "hoa", displayName: "Võ Thanh Hoa", bio: "Designer" },
];

// [người gửi, nội dung, số phút sau tin trước]
const CONVERSATIONS = [
  {
    type: "group",
    name: "Đồ án Komi",
    members: ["an", "binh", "chi", "dung"],
    startDaysAgo: 12,
    messages: [
      ["an", "Chào cả nhóm, mình lập group này để bàn đồ án chat realtime nhé", 0],
      ["binh", "Ok An. Mình nhận phần giao diện với React và shadcn nha", 3],
      ["dung", "Mình lo Docker với deploy", 2],
      ["chi", "Còn mình làm phần AI: tóm tắt hội thoại và tìm kiếm tin nhắn", 5],
      ["an", "Vậy mình làm backend Express và Socket.IO", 1],
      ["an", "Deadline nộp bản demo là thứ Sáu tuần sau, 17h", 2],
      ["binh", "Mọi người họp online tối thứ Ba lúc 20h30 được không?", 60],
      ["dung", "Được, mình gửi link Google Meet sau", 4],
      ["chi", "Ok mình rảnh", 1],
      ["dung", "Link họp: meet.google.com/komi-doan-demo", 300],
      ["an", "Nhắc lại: database dùng MongoDB, mọi người cài bản 7 trở lên nha", 1440],
      ["binh", "Mình push giao diện màn hình đăng nhập lên nhánh feature/auth-ui rồi", 120],
      ["an", "Đẹp đó Bình. Nhớ thêm validate username không dấu", 15],
      ["dung", "Bản staging đã deploy lên Render: https://komi-staging.onrender.com", 1500],
      ["dung", "Tài khoản test là an / komi123", 1],
      ["chi", "Server staging bị chậm lần đầu mở vì gói free ngủ sau 15 phút không dùng", 20],
      ["an", "Phát hiện bug: mở 2 tab thì trạng thái online bị sai", 900],
      ["an", "Nguyên nhân là map onlineUsers chỉ lưu 1 socket cho mỗi user", 5],
      ["binh", "Ai fix bug online đó vậy?", 10],
      ["an", "Để mình fix, đổi sang Set các socketId", 2],
      ["chi", "Mình đọc thử thì thấy API lấy tin nhắn không kiểm tra người gọi có trong nhóm không", 600],
      ["an", "Chết thật, lỗ hổng lớn. Mình thêm middleware kiểm tra thành viên ngay", 8],
      ["dung", "Viết test cho phần này luôn nhé, mình gắn vào GitHub Actions", 6],
      ["chi", "Mình đang so sánh 3 model embedding cho tiếng Việt trên bộ 40 câu hỏi tự soạn", 2000],
      ["binh", "Có kết quả thì chốt model tốt nhất cho tính năng tìm kiếm nha", 30],
      ["an", "Chi viết lại kết quả so sánh vào file docs/DECISIONS.md giúp mình", 4],
      ["chi", "Ok, mình ghi recall@5 của từng model vào đó", 3],
      ["dung", "Chi phí gọi API LLM tháng này khoảng 3 đô, vẫn trong ngân sách 10 đô", 1800],
      ["binh", "Thứ Năm này mình demo thử cho thầy lúc 14h ở phòng B2.04 nhé", 240],
      ["an", "Ok, mỗi người chuẩn bị 3 phút trình bày phần của mình", 5],
    ],
  },
  {
    type: "group",
    name: "Hội đi Đà Lạt",
    members: ["an", "binh", "hoa"],
    startDaysAgo: 20,
    messages: [
      ["hoa", "Tháng sau đi Đà Lạt không mọi người?", 0],
      ["binh", "Đi! Mình rảnh cuối tuần 13–15", 10],
      ["an", "Mình cũng được, đi xe khách giường nằm cho tiết kiệm", 25],
      ["hoa", "Ngân sách mỗi người khoảng 2 triệu nhé", 5],
      ["binh", "Mình đặt homestay gần hồ Xuân Hương, 3 người 900 nghìn một đêm", 180],
      ["an", "Xe khởi hành 22h tối thứ Sáu ở bến xe Miền Đông mới", 120],
      ["hoa", "Nhớ mang áo khoác, Đà Lạt tối xuống 14 độ", 30],
      ["binh", "Ai giữ tiền quỹ chung?", 400],
      ["hoa", "Để mình giữ, mọi người chuyển khoản cho mình trước thứ Tư", 3],
      ["an", "Mình chuyển rồi nha Hoa", 600],
      ["binh", "Mình cũng chuyển rồi", 30],
      ["hoa", "Đã nhận đủ 6 triệu, cảm ơn cả nhà", 15],
    ],
  },
  {
    type: "direct",
    members: ["an", "binh"],
    startDaysAgo: 6,
    messages: [
      ["binh", "An ơi, màn hình chat trên điện thoại bị tràn chữ khi tin nhắn dài", 0],
      ["an", "Bạn thử thêm break-words cho bong bóng tin nhắn xem", 7],
      ["binh", "Được rồi, cảm ơn nha", 12],
      ["an", "Cuối tuần đi cà phê code chung không?", 1440],
      ["binh", "Chủ nhật 9h sáng ở quán quen đường Pasteur nhé", 20],
      ["an", "Chốt", 2],
    ],
  },
  {
    type: "direct",
    members: ["an", "chi"],
    startDaysAgo: 3,
    messages: [
      ["chi", "Tuần sau mình phỏng vấn vị trí AI Engineer, hồi hộp quá", 0],
      ["an", "Bạn ôn RAG với cách đánh giá chưa? Họ hay hỏi phần đó", 6],
      ["chi", "Rồi, mình chuẩn bị ví dụ RAG trên dữ liệu chat có phân quyền", 4],
      ["an", "Hay đó. Nhớ nói cả chuyện chọn model bằng số liệu", 3],
      ["chi", "Phỏng vấn vòng 2 vào thứ Ba lúc 10h, online qua Zoom", 300],
      ["an", "Chúc may mắn nhé Chi!", 2],
    ],
  },
];

const minutes = (n) => n * 60 * 1000;

const run = async () => {
  if (!process.env.MONGODB_CONNECTIONSTRING) {
    throw new Error("Thiếu MONGODB_CONNECTIONSTRING (xem backend/.env.example)");
  }

  await mongoose.connect(process.env.MONGODB_CONNECTIONSTRING);
  await Promise.all([Conversation.init(), User.init(), Friend.init()]);

  if (reset) {
    await Promise.all([
      User.deleteMany({}),
      Friend.deleteMany({}),
      FriendRequest.deleteMany({}),
      Conversation.deleteMany({}),
      Message.deleteMany({}),
      Session.deleteMany({}),
    ]);
    console.log("Đã xoá dữ liệu cũ.");
  } else if (await User.exists({ username: { $in: USERS.map((u) => u.username) } })) {
    console.log("Đã có dữ liệu demo. Chạy lại với --reset để tạo mới.");
    return;
  }

  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);
  const users = await User.insertMany(
    USERS.map((u) => ({ ...u, email: `${u.username}@komi.dev`, hashedPassword })),
  );
  const byName = Object.fromEntries(users.map((u) => [u.username, u]));

  // mọi người đều là bạn của nhau
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      await Friend.create({ userA: users[i]._id, userB: users[j]._id });
    }
  }

  let messageCount = 0;

  for (const spec of CONVERSATIONS) {
    const members = spec.members.map((name) => byName[name]);

    const conversation = await Conversation.create({
      type: spec.type,
      participants: members.map((u) => ({ userId: u._id })),
      ...(spec.type === "group"
        ? { group: { name: spec.name, createdBy: members[0]._id } }
        : { directKey: makeDirectKey(members[0]._id, members[1]._id) }),
      lastMessageAt: new Date(),
    });

    let time = Date.now() - spec.startDaysAgo * 24 * 60 * 60 * 1000;

    const docs = spec.messages.map(([sender, content, gap]) => {
      time += minutes(gap);
      const createdAt = new Date(time);
      return {
        conversationId: conversation._id,
        senderId: byName[sender]._id,
        content,
        createdAt,
        updatedAt: createdAt,
      };
    });

    const inserted = await Message.insertMany(docs);
    const last = inserted.at(-1);

    conversation.lastMessageAt = last.createdAt;
    conversation.lastMessage = {
      _id: last._id.toString(),
      content: last.content,
      senderId: last.senderId,
      createdAt: last.createdAt,
    };
    // người khác người gửi cuối có 1 tin chưa đọc, để thấy badge khi demo
    members.forEach((u) => {
      const unread = u._id.equals(last.senderId) ? 0 : 1;
      conversation.unreadCounts.set(u._id.toString(), unread);
    });
    await conversation.save();

    messageCount += inserted.length;
  }

  console.log(
    `Đã tạo ${users.length} người dùng, ${CONVERSATIONS.length} cuộc trò chuyện, ${messageCount} tin nhắn.`,
  );
  console.log(`Đăng nhập bằng: ${USERS.map((u) => u.username).join(", ")} / ${DEMO_PASSWORD}`);
};

run()
  .catch((error) => {
    console.error("Seed thất bại:", error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
