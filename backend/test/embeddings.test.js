import { test, before, after, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { embeddings, DEFAULT_EMBEDDING_DIMENSIONS } from "../src/ai/embeddings.js";
import { LLMError, LLM_ERROR } from "../src/ai/errors.js";
import { fakeEmbed } from "../src/ai/providers/fakeEmbedding.js";
import {
  createOpenAICompatibleEmbeddingProvider,
  MAX_BATCH_SIZE,
} from "../src/ai/providers/openaiCompatibleEmbedding.js";

/**
 * Lớp EmbeddingProvider. Bản OpenAI-compatible được test bằng một server HTTP giả
 * dựng ngay trong test (localhost), không gọi mạng ra ngoài.
 */

const ENV = [
  "EMBEDDING_PROVIDER",
  "EMBEDDING_BASE_URL",
  "EMBEDDING_API_KEY",
  "EMBEDDING_MODEL",
  "EMBEDDING_DIMENSIONS",
  "LLM_BASE_URL",
  "LLM_API_KEY",
];
const savedEnv = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
const setEnv = (values) => {
  for (const key of ENV) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
};

const cosine = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0) / Math.hypot(...a) / Math.hypot(...b);

// ---- server giả: mỗi test gán `handler` để quyết định server trả gì ----
let server, baseUrl, handler, requests;

// Trả về đúng số vector theo request (giống API thật), vector i có giá trị i+1 ở chiều đầu
const echoVectors =
  ({ dims = 4, dropFirstIndex = false } = {}) =>
  (req, res) => {
    const { input } = req.body;
    const data = input.map((_, i) => ({
      object: "embedding",
      ...(dropFirstIndex && i === 0 ? {} : { index: i }),
      embedding: [i + 1, ...new Array(dims - 1).fill(0)],
    }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ object: "list", data, model: "test-model" }));
  };

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      req.body = body ? JSON.parse(body) : null;
      requests.push({ method: req.method, url: req.url, headers: req.headers, body: req.body });
      handler(req, res);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/v1/`;
});

after(async () => {
  setEnv(savedEnv);
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  requests = [];
  handler = echoVectors();
});

const provider = (options = {}) =>
  createOpenAICompatibleEmbeddingProvider({ baseUrl, apiKey: "test-key", model: "test-model", dimensions: 4, ...options });

const assertLLMError = (code) => (err) => {
  assert.ok(err instanceof LLMError, `mong đợi LLMError, nhận ${err?.name}: ${err?.message}`);
  assert.equal(err.code, code);
  return true;
};

describe("chọn provider theo EMBEDDING_PROVIDER", () => {
  test("để trống hoặc giá trị lạ thì tắt, gọi thì báo lỗi", async () => {
    setEnv({});
    assert.equal(embeddings.isReady(), false);
    await assert.rejects(embeddings.embed({ texts: ["a"] }), assertLLMError(LLM_ERROR.OTHER));
    setEnv({ EMBEDDING_PROVIDER: "khong-co" });
    assert.equal(embeddings.isReady(), false);
  });

  test("số chiều mặc định 768; giá trị sai thì tắt", () => {
    setEnv({ EMBEDDING_PROVIDER: "fake" });
    assert.equal(embeddings.dimensions(), DEFAULT_EMBEDDING_DIMENSIONS);
    assert.equal(DEFAULT_EMBEDDING_DIMENSIONS, 768);
    for (const bad of ["0", "-5", "1.5", "abc", "5000"]) {
      setEnv({ EMBEDDING_PROVIDER: "fake", EMBEDDING_DIMENSIONS: bad });
      assert.equal(embeddings.isReady(), false, `EMBEDDING_DIMENSIONS=${bad}`);
    }
  });

  test("openai-compatible thiếu EMBEDDING_MODEL hoặc base URL thì tắt", () => {
    setEnv({ EMBEDDING_PROVIDER: "openai-compatible", EMBEDDING_BASE_URL: baseUrl });
    assert.equal(embeddings.isReady(), false);
    setEnv({ EMBEDDING_PROVIDER: "openai-compatible", EMBEDDING_MODEL: "m" });
    assert.equal(embeddings.isReady(), false);
  });

  test("không đặt EMBEDDING_BASE_URL thì dùng chung LLM_BASE_URL và LLM_API_KEY", async () => {
    setEnv({
      EMBEDDING_PROVIDER: "openai-compatible",
      EMBEDDING_MODEL: "m",
      EMBEDDING_DIMENSIONS: "4",
      LLM_BASE_URL: baseUrl,
      LLM_API_KEY: "khoa-chat",
      EMBEDDING_API_KEY: "khong-dung",
    });
    assert.equal(embeddings.isReady(), true);
    await embeddings.embed({ texts: ["a"] });
    assert.equal(requests[0].headers.authorization, "Bearer khoa-chat");
    assert.equal(requests[0].body.model, "m");
    assert.equal(requests[0].body.dimensions, 4);
  });

  test("đặt EMBEDDING_BASE_URL riêng thì chỉ dùng EMBEDDING_API_KEY, không gửi key của chat", async () => {
    setEnv({
      EMBEDDING_PROVIDER: "openai-compatible",
      EMBEDDING_BASE_URL: baseUrl,
      EMBEDDING_MODEL: "m",
      EMBEDDING_DIMENSIONS: "4",
      LLM_API_KEY: "khoa-chat",
    });
    await embeddings.embed({ texts: ["a"] });
    assert.equal(requests[0].headers.authorization, undefined);

    setEnv({
      EMBEDDING_PROVIDER: "openai-compatible",
      EMBEDDING_BASE_URL: baseUrl,
      EMBEDDING_API_KEY: "khoa-embedding",
      EMBEDDING_MODEL: "m",
      EMBEDDING_DIMENSIONS: "4",
      LLM_API_KEY: "khoa-chat",
    });
    await embeddings.embed({ texts: ["a"] });
    assert.equal(requests[1].headers.authorization, "Bearer khoa-embedding");
  });

  test("danh sách rỗng thì không gọi nhà cung cấp", async () => {
    setEnv({ EMBEDDING_PROVIDER: "openai-compatible", EMBEDDING_BASE_URL: baseUrl, EMBEDDING_MODEL: "m" });
    assert.deepEqual(await embeddings.embed({ texts: [] }), []);
    assert.equal(requests.length, 0);
  });
});

describe("embedding giả", () => {
  beforeEach(() => setEnv({ EMBEDDING_PROVIDER: "fake" }));

  test("đúng số chiều, độ dài 1, cùng chữ thì cùng vector", async () => {
    const [a, b, empty] = await embeddings.embed({ texts: ["Họp giao ban 9h", "Họp giao ban 9h", ""] });
    assert.equal(a.length, 768);
    assert.ok(Math.abs(Math.hypot(...a) - 1) < 1e-9);
    assert.deepEqual(a, b);
    assert.ok(Math.abs(Math.hypot(...empty) - 1) < 1e-9); // đoạn rỗng vẫn hợp lệ
  });

  test("đoạn chung nhiều từ thì gần nhau hơn; không phân biệt dấu và hoa thường", () => {
    const query = fakeEmbed("mấy giờ họp giao ban", 768);
    const meeting = fakeEmbed("Họp giao ban lúc 9 giờ sáng thứ Ba", 768);
    const budget = fakeEmbed("Ngân sách chuyến đi Đà Lạt", 768);
    assert.ok(cosine(query, meeting) > cosine(query, budget));
    assert.deepEqual(fakeEmbed("ĐÀ LẠT", 64), fakeEmbed("da lat", 64));
  });

  test("signal đã huỷ thì ném AbortError", async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(embeddings.embed({ texts: ["a"], signal: controller.signal }), { name: "AbortError" });
  });
});

describe("provider OpenAI-compatible", () => {
  test("gửi đúng request và trả vector theo thứ tự", async () => {
    const vectors = await provider().embed({ texts: ["một", "hai"] });
    assert.deepEqual(vectors, [
      [1, 0, 0, 0],
      [2, 0, 0, 0],
    ]);

    const [req] = requests;
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/v1/embeddings"); // bỏ dấu / thừa ở cuối base URL
    assert.equal(req.headers.authorization, "Bearer test-key");
    assert.deepEqual(req.body, { model: "test-model", input: ["một", "hai"], dimensions: 4 });
  });

  test("phần tử thiếu index (Gemini bỏ index = 0) hoặc trả lộn thứ tự vẫn ghép đúng", async () => {
    handler = echoVectors({ dropFirstIndex: true });
    assert.deepEqual(await provider().embed({ texts: ["a", "b", "c"] }), [
      [1, 0, 0, 0],
      [2, 0, 0, 0],
      [3, 0, 0, 0],
    ]);

    handler = (_req, res) =>
      res.end(
        JSON.stringify({
          data: [
            { index: 1, embedding: [2, 0, 0, 0] },
            { index: 0, embedding: [1, 0, 0, 0] },
          ],
        }),
      );
    assert.deepEqual(await provider().embed({ texts: ["a", "b"] }), [
      [1, 0, 0, 0],
      [2, 0, 0, 0],
    ]);
  });

  test(`nhiều hơn ${MAX_BATCH_SIZE} đoạn thì chia lô, gửi lần lượt`, async () => {
    const texts = Array.from({ length: MAX_BATCH_SIZE * 2 + 5 }, (_, i) => `đoạn ${i}`);
    const vectors = await provider().embed({ texts });
    assert.equal(vectors.length, texts.length);
    assert.deepEqual(
      requests.map((r) => r.body.input.length),
      [MAX_BATCH_SIZE, MAX_BATCH_SIZE, 5],
    );
    assert.deepEqual(requests[2].body.input[0], `đoạn ${MAX_BATCH_SIZE * 2}`);
  });

  test("sai số vector hoặc sai số chiều → lỗi khác", async () => {
    handler = (_req, res) => res.end(JSON.stringify({ data: [{ index: 0, embedding: [1, 0, 0, 0] }] }));
    await assert.rejects(provider().embed({ texts: ["a", "b"] }), assertLLMError(LLM_ERROR.OTHER));

    handler = echoVectors({ dims: 3 });
    await assert.rejects(provider().embed({ texts: ["a"] }), assertLLMError(LLM_ERROR.OTHER));

    handler = (_req, res) => res.end("{khong-phai-json");
    await assert.rejects(provider().embed({ texts: ["a"] }), assertLLMError(LLM_ERROR.OTHER));
  });

  const statusCases = [
    {
      status: 429,
      body: '{"error":{"code":429,"message":"Embed content requests per minute limit exceeded on Free Tier"}}',
      code: LLM_ERROR.RATE_LIMIT,
    },
    { status: 401, body: '{"error":{"message":"bad key"}}', code: LLM_ERROR.AUTH },
    { status: 400, body: '{"error":{"code":400,"message":"API key not valid."}}', code: LLM_ERROR.AUTH },
    { status: 400, body: '{"error":{"message":"at most 100 requests can be in one batch"}}', code: LLM_ERROR.OTHER },
    { status: 500, body: "boom", code: LLM_ERROR.OTHER },
  ];

  for (const { status, body, code } of statusCases) {
    test(`HTTP ${status} → ${code}, không tự gọi lại`, async () => {
      handler = (_req, res) => res.writeHead(status).end(body);
      await assert.rejects(provider().embed({ texts: ["a"] }), (err) => {
        assertLLMError(code)(err);
        assert.equal(err.status, status);
        return true;
      });
      assert.equal(requests.length, 1);
    });
  }

  test("lô đầu hết hạn mức thì dừng, không gửi lô sau", async () => {
    handler = (_req, res) => res.writeHead(429).end('{"error":{"code":429}}');
    const texts = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, i) => `đoạn ${i}`);
    await assert.rejects(provider().embed({ texts }), assertLLMError(LLM_ERROR.RATE_LIMIT));
    assert.equal(requests.length, 1);
  });

  test("không kết nối được → lỗi khác", async () => {
    const dead = createOpenAICompatibleEmbeddingProvider({ baseUrl: "http://127.0.0.1:1/v1", model: "m", dimensions: 4 });
    await assert.rejects(dead.embed({ texts: ["a"] }), assertLLMError(LLM_ERROR.OTHER));
  });

  test("server không trả lời → timeout", async () => {
    handler = () => {}; // treo
    const started = Date.now();
    await assert.rejects(provider({ timeoutMs: 100 }).embed({ texts: ["a"] }), assertLLMError(LLM_ERROR.OTHER));
    assert.ok(Date.now() - started < 2000);
  });

  test("bên gọi huỷ giữa chừng → AbortError, không phải LLMError", async () => {
    handler = () => {}; // treo cho tới khi bị huỷ
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    await assert.rejects(provider().embed({ texts: ["a"], signal: controller.signal }), (err) => {
      assert.equal(err.name, "AbortError");
      assert.ok(!(err instanceof LLMError));
      return true;
    });
  });

  test("signal đã huỷ từ trước thì không gửi request", async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(provider().embed({ texts: ["a"], signal: controller.signal }), { name: "AbortError" });
    assert.equal(requests.length, 0);
  });
});
