import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      trim: true,
    },
    imgUrl: {
      type: String,
    },
    // id tạm do client sinh ra, dùng để thay tin nhắn "đang gửi" bằng tin thật
    clientId: {
      type: String,
      maxlength: 64,
    },
    // Tin đang được trả lời. Lưu bản trích (snapshot) để hiển thị không cần
    // truy vấn thêm; tin gốc luôn thuộc cùng conversation (controller kiểm tra).
    replyTo: {
      type: new mongoose.Schema(
        {
          messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message", required: true },
          senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
          content: { type: String, default: "" },
        },
        { _id: false },
      ),
      default: undefined,
    },
    // Cảm xúc: mỗi user tối đa một emoji cho mỗi tin (controller đảm bảo)
    reactions: {
      type: [
        new mongoose.Schema(
          {
            userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
            emoji: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ conversationId: 1, createdAt: -1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;
