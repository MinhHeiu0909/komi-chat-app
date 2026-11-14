/**
 * Phần dùng chung của script eval RAG (evalLoad.js, evalRun.js).
 * Bộ eval chạy trên DB riêng có tên bắt đầu bằng "komi_eval" (cùng MongoDB Atlas Local với app),
 * không bao giờ đụng dữ liệu demo.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const EVAL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../eval");
export const EVAL_DB_PREFIX = "komi_eval";

export const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(EVAL_DIR, relative), "utf8"));

/** Đọc "--ten giá-trị" và cờ "--ten" từ dòng lệnh. */
export const parseArgs = (argv = process.argv.slice(2)) => {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = true;
    else args[key] = argv[++i];
  }
  return args;
};

/** Chuỗi kết nối tới DB eval: lấy MONGODB_CONNECTIONSTRING, thay tên DB. Tên phải bắt đầu bằng komi_eval. */
export const evalConnectionString = (dbName) => {
  if (!dbName?.startsWith(EVAL_DB_PREFIX)) {
    throw new Error(`Tên DB eval phải bắt đầu bằng "${EVAL_DB_PREFIX}" (nhận: ${dbName})`);
  }
  if (!process.env.MONGODB_CONNECTIONSTRING) throw new Error("Thiếu MONGODB_CONNECTIONSTRING (xem backend/.env.example)");
  const url = new URL(process.env.MONGODB_CONNECTIONSTRING);
  url.pathname = `/${dbName}`;
  return url.toString();
};

// "2026-10-05 08:45" giờ Việt Nam → Date
export const vnDate = (text) => new Date(`${text.replace(" ", "T")}:00+07:00`);

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
