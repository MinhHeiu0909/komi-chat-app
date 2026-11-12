import { test, before, after, beforeEach, describe } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { llm, LLMError, LLM_ERROR } from "../src/ai/llm.js";
import { FAKE_REPLY } from "../src/ai/providers/fake.js";
import { createOpenAICompatibleProvider } from "../src/ai/providers/openaiCompatible.js";

/**
 * Lớp LLMProvider. Bản OpenAI-compatible được test bằng một server HTTP giả
 * dựng ngay trong test (localhost), không gọi mạng ra ngoài.
 */

const LLM_ENV = ["LLM_PROVIDER", "LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL"];
const savedEnv = Object.fromEntries(LLM_ENV.map((k) => [k, process.env[k]]));
const setEnv = (values) => {
  for (const key of LLM_ENV) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
};

const collect = async (iterable) => {
  const chunks = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return chunks;
};

const MESSAGES = [{ role: "user", content: "Chào Komi" }];

// Một sự kiện SSE kiểu OpenAI chứa đoạn chữ
const sse = (content) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content } }] })}\n\n`;

// ---- server giả: mỗi test gán `handler` để quyết định server trả gì ----
let server, baseUrl, handler, requests;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null });
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
  handler = (_req, res) => res.end();
});

const provider = (options = {}) =>
  createOpenAICompatibleProvider({ baseUrl, apiKey: "test-key", model: "test-model", ...options });

const assertLLMError = (code) => (err) => {
  assert.ok(err instanceof LLMError, `mong đợi LLMError, nhận ${err?.name}: ${err?.message}`);
  assert.equal(err.code, code);
  return true;
};

describe("chọn provider theo LLM_PROVIDER", () => {
  test("để trống thì AI tắt, gọi thì báo lỗi", async () => {
    setEnv({});
    assert.equal(llm.isReady(), false);
    await assert.rejects(llm.chat({ messages: MESSAGES }), assertLLMError(LLM_ERROR.OTHER));
  });

  test("giá trị lạ cũng coi là tắt", () => {
    setEnv({ LLM_PROVIDER: "khong-co" });
    assert.equal(llm.isReady(), false);
  });

  test("openai-compatible thiếu LLM_BASE_URL hoặc LLM_MODEL thì tắt", () => {
    setEnv({ LLM_PROVIDER: "openai-compatible", LLM_MODEL: "m" });
    assert.equal(llm.isReady(), false);
    setEnv({ LLM_PROVIDER: "openai-compatible", LLM_BASE_URL: baseUrl });
    assert.equal(llm.isReady(), false);
  });

  test("openai-compatible đủ cấu hình thì gọi tới LLM_BASE_URL", async () => {
    setEnv({ LLM_PROVIDER: "openai-compatible", LLM_BASE_URL: baseUrl, LLM_API_KEY: "k", LLM_MODEL: "m" });
    handler = (_req, res) => res.end(sse("Ok") + "data: [DONE]\n\n");

    assert.equal(llm.isReady(), true);
    assert.equal(await llm.chat({ messages: MESSAGES }), "Ok");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].body.model, "m");
  });
});

describe("provider giả", () => {
  beforeEach(() => setEnv({ LLM_PROVIDER: "fake" }));

  test("trả lời cố định, chia nhiều đoạn", async () => {
    assert.equal(llm.isReady(), true);
    const chunks = await collect(llm.streamChat({ messages: MESSAGES }));
    assert.ok(chunks.length > 1);
    assert.equal(chunks.join(""), FAKE_REPLY);
    assert.equal(await llm.chat({ messages: MESSAGES }), FAKE_REPLY);
  });

  test("dừng được giữa chừng qua AbortSignal", async () => {
    const controller = new AbortController();
    const chunks = [];
    await assert.rejects(
      (async () => {
        for await (const chunk of llm.streamChat({ messages: MESSAGES, signal: controller.signal })) {
          chunks.push(chunk);
          controller.abort();
        }
      })(),
      { name: "AbortError" },
    );
    assert.equal(chunks.length, 1);
  });
});

describe("provider OpenAI-compatible", () => {
  test("gửi đúng request và ghép các đoạn streaming", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(": keep-alive\n\n");
      res.write(sse("Xin "));
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { role: "assistant" } }] })}\n\n`); // không có chữ
      res.write(sse("chào\nbạn"));
      res.end("data: [DONE]\n\n");
    };

    const chunks = await collect(provider().streamChat({ messages: MESSAGES }));
    assert.deepEqual(chunks, ["Xin ", "chào\nbạn"]);

    const [req] = requests;
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/v1/chat/completions"); // bỏ dấu / thừa ở cuối base URL
    assert.equal(req.headers.authorization, "Bearer test-key");
    assert.deepEqual(req.body, { model: "test-model", messages: MESSAGES, stream: true });
  });

  test("sự kiện bị cắt ngang giữa hai gói vẫn ghép đúng (cả ký tự tiếng Việt nhiều byte)", async () => {
    handler = async (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const bytes = Buffer.from(sse("Tiếng Việt") + sse(" có dấu") + "data: [DONE]\r\n\r\n");
      // cắt giữa ký tự "ế" (3 byte UTF-8) và giữa một dòng data
      const cut = bytes.indexOf(Buffer.from("ế")) + 1;
      res.write(bytes.subarray(0, cut));
      await new Promise((r) => setTimeout(r, 20));
      res.end(bytes.subarray(cut));
    };

    assert.equal(await collect(provider().streamChat({ messages: MESSAGES })).then((c) => c.join("")), "Tiếng Việt có dấu");
  });

  test("chat() trả cả câu", async () => {
    handler = (_req, res) => res.end(sse("Một ") + sse("hai") + "data: [DONE]\n\n");
    setEnv({ LLM_PROVIDER: "openai-compatible", LLM_BASE_URL: baseUrl, LLM_MODEL: "m" });
    assert.equal(await llm.chat({ messages: MESSAGES }), "Một hai");
    assert.equal(requests[0].headers.authorization, undefined); // không có key thì không gửi header
  });

  const statusCases = [
    { status: 429, body: '{"error":{"message":"quota"}}', code: LLM_ERROR.RATE_LIMIT },
    { status: 401, body: '{"error":{"message":"bad key"}}', code: LLM_ERROR.AUTH },
    { status: 403, body: "forbidden", code: LLM_ERROR.AUTH },
    { status: 400, body: '[{"error":{"code":400,"message":"API key not valid."}}]', code: LLM_ERROR.AUTH },
    { status: 400, body: '{"error":{"message":"bad request"}}', code: LLM_ERROR.OTHER },
    { status: 500, body: "boom", code: LLM_ERROR.OTHER },
  ];

  for (const { status, body, code } of statusCases) {
    test(`HTTP ${status} → ${code}, không tự gọi lại`, async () => {
      handler = (_req, res) => res.writeHead(status).end(body);
      await assert.rejects(collect(provider().streamChat({ messages: MESSAGES })), (err) => {
        assertLLMError(code)(err);
        assert.equal(err.status, status);
        return true;
      });
      assert.equal(requests.length, 1);
    });
  }

  test("lỗi báo giữa luồng streaming", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end(sse("Đang ") + `data: ${JSON.stringify({ error: { code: 429, message: "quota" } })}\n\n`);
    };
    const chunks = [];
    await assert.rejects(
      (async () => {
        for await (const c of provider().streamChat({ messages: MESSAGES })) chunks.push(c);
      })(),
      assertLLMError(LLM_ERROR.RATE_LIMIT),
    );
    assert.deepEqual(chunks, ["Đang "]);
  });

  test("dữ liệu streaming hỏng → lỗi khác", async () => {
    handler = (_req, res) => res.end("data: {khong-phai-json\n\n");
    await assert.rejects(collect(provider().streamChat({ messages: MESSAGES })), assertLLMError(LLM_ERROR.OTHER));
  });

  test("không kết nối được → lỗi khác", async () => {
    const dead = createOpenAICompatibleProvider({ baseUrl: "http://127.0.0.1:1/v1", model: "m" });
    await assert.rejects(collect(dead.streamChat({ messages: MESSAGES })), assertLLMError(LLM_ERROR.OTHER));
  });

  test("server không trả lời → timeout", async () => {
    handler = () => {}; // treo, không bao giờ trả lời
    const started = Date.now();
    await assert.rejects(
      collect(provider({ timeoutMs: 100 }).streamChat({ messages: MESSAGES })),
      assertLLMError(LLM_ERROR.OTHER),
    );
    assert.ok(Date.now() - started < 2000);
  });

  test("đang streaming thì im lặng quá lâu → timeout", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(sse("Bắt đầu")); // rồi treo
    };
    const chunks = [];
    await assert.rejects(
      (async () => {
        for await (const c of provider({ timeoutMs: 100 }).streamChat({ messages: MESSAGES })) chunks.push(c);
      })(),
      assertLLMError(LLM_ERROR.OTHER),
    );
    assert.deepEqual(chunks, ["Bắt đầu"]);
  });

  test("người hỏi bấm dừng → AbortError, không phải LLMError", async () => {
    let closed;
    const connectionClosed = new Promise((r) => (closed = r));
    handler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(sse("Một"));
      res.on("close", closed); // biết được kết nối tới nhà cung cấp đã bị huỷ
    };

    const controller = new AbortController();
    const chunks = [];
    await assert.rejects(
      (async () => {
        for await (const c of provider().streamChat({ messages: MESSAGES, signal: controller.signal })) {
          chunks.push(c);
          controller.abort();
        }
      })(),
      (err) => {
        assert.equal(err.name, "AbortError");
        assert.ok(!(err instanceof LLMError));
        return true;
      },
    );
    assert.deepEqual(chunks, ["Một"]);
    await connectionClosed;
  });

  test("signal đã huỷ từ trước thì không gửi request", async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(collect(provider().streamChat({ messages: MESSAGES, signal: controller.signal })), {
      name: "AbortError",
    });
    assert.equal(requests.length, 0);
  });

  test("bên gọi ngừng đọc sớm (break) thì huỷ kết nối", async () => {
    let closed;
    const connectionClosed = new Promise((r) => (closed = r));
    handler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(sse("Một"));
      res.on("close", closed);
    };
    for await (const _ of provider().streamChat({ messages: MESSAGES })) break;
    await connectionClosed;
  });
});
