import mongoose from "mongoose";

const participantSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: false,
  }
);

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    _id: false,
  }
);

const lastMessageSchema = new mongoose.Schema(
  {
    _id: { type: String },
    content: {
      type: String,
      default: null,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: false,
  }
);

const conversationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["direct", "group"],
      required: true,
    },
    participants: {
      type: [participantSchema],
      required: true,
    },
    group: {
      type: groupSchema,
    },
    lastMessageAt: {
      type: Date,
    },
    seenBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    lastMessage: {
      type: lastMessageSchema,
      default: null,
    },
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },
    // Khoá duy nhất cho chat 1-1: "<idNhỏ>:<idLớn>".
    // Unique + sparse để hai request đồng thời không tạo ra 2 conversation trùng.
    directKey: {
      type: String,
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

conversationSchema.index({
  "participants.userId": 1,
  lastMessageAt: -1,
});

conversationSchema.index({ directKey: 1 }, { unique: true, sparse: true });

export const makeDirectKey = (a, b) => {
  const [x, y] = [a.toString(), b.toString()].sort();
  return `${x}:${y}`;
};

const Conversation = mongoose.model("Conversation", conversationSchema);
export default Conversation;
