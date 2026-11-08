import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { MongoMemoryServer } from "mongodb-memory-server";

// Biến môi trường phải có trước khi import app (app.js, socket/index.js đọc chúng khi nạp)
process.env.ACCESS_TOKEN_SECRET = "test-secret";
process.env.CLIENT_URL = "http://localhost:5173";
process.env.DISABLE_RATE_LIMIT = "true";

let mongod;

export const startDatabase = async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const [{ default: User }, { default: Conversation }, { default: Message }, { default: Friend }] =
    await Promise.all([
      import("../src/models/User.js"),
      import("../src/models/Conversation.js"),
      import("../src/models/Message.js"),
      import("../src/models/Friend.js"),
    ]);

  // build unique index trước khi test các request đồng thời
  await Promise.all([User.init(), Conversation.init(), Message.init(), Friend.init()]);

  return { User, Conversation, Message, Friend };
};

export const stopDatabase = async () => {
  await mongoose.disconnect();
  await mongod?.stop();
};

export const tokenFor = (user) =>
  jwt.sign({ userId: user._id }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "1h" });

export const auth = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });

export const createUser = (User, username) =>
  User.create({
    username,
    email: `${username}@example.com`,
    hashedPassword: "not-used-in-tests",
    displayName: username,
  });

export const makeFriends = (Friend, a, b) => Friend.create({ userA: a._id, userB: b._id });
