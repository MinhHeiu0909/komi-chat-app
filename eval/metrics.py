"""Tính số liệu tìm kiếm (RAG) của Komi AI từ kết quả do `npm run eval:run` ghi ra.

Chỉ dùng thư viện chuẩn, không gọi mạng:

    python3 eval/metrics.py                       # mọi file trong eval/results/*.json
    python3 eval/metrics.py eval/results/hien-tai.json --out eval/results/summary.md

Một câu hỏi "tìm đúng" ở hạng r nếu đoạn thứ r chứa một chuỗi bằng chứng của câu đó.
  - recall@k: tỉ lệ câu có đoạn đúng trong k đoạn đầu (không tính câu kiểm tra rò rỉ).
  - MRR: trung bình 1/hạng của đoạn đúng đầu tiên (0 nếu không có trong 10 đoạn đầu).
  - Rò rỉ: số câu "leak" có đoạn chứa bằng chứng trong k_prompt đoạn đầu; phải bằng 0
    (người hỏi không được thấy nguồn đó).
"""

import argparse
import json
import sys
from collections import OrderedDict
from pathlib import Path

KS = (1, 3, 5, 6)
TYPE_LABELS = OrderedDict(
    [
        ("message", "tin nhắn cùng nơi hỏi"),
        ("paraphrase", "viết khác chữ với nguồn"),
        ("followup", "câu nối tiếp"),
        ("cross", "tìm chéo cuộc trò chuyện"),
        ("shared", "tài liệu chung"),
    ]
)


def first_hit_rank(question):
    """Hạng (1-based) của đoạn đúng đầu tiên, hoặc None."""
    for item in question["retrieved"]:
        if item["hit"]:
            return item["rank"]
    return None


def recall_at(questions, k):
    if not questions:
        return None
    found = sum(1 for q in questions if (r := first_hit_rank(q)) is not None and r <= k)
    return found / len(questions)


def mrr(questions):
    if not questions:
        return None
    return sum(1 / r if (r := first_hit_rank(q)) else 0 for q in questions) / len(questions)


def leaks(questions, k):
    """Các câu kiểm tra rò rỉ mà đoạn chứa bằng chứng lọt vào k đoạn đầu."""
    return [q["id"] for q in questions if (r := first_hit_rank(q)) is not None and r <= k]


def summarize(run):
    questions = run["results"]
    normal = [q for q in questions if q["type"] != "leak"]
    leak = [q for q in questions if q["type"] == "leak"]
    k_prompt = run.get("promptK", 6)

    by_type = OrderedDict()
    for key in TYPE_LABELS:
        group = [q for q in normal if q["type"] == key]
        if group:
            by_type[key] = {"n": len(group), "recall": recall_at(group, k_prompt), "mrr": mrr(group)}

    return {
        "name": run["name"],
        "n": len(normal),
        "recall": {k: recall_at(normal, k) for k in KS},
        "mrr": mrr(normal),
        "by_type": by_type,
        "leak_n": len(leak),
        "leaked": leaks(leak, k_prompt),
        "k_prompt": k_prompt,
        "misses": [
            {"id": q["id"], "question": q["question"], "rank": first_hit_rank(q)}
            for q in normal
            if (r := first_hit_rank(q)) is None or r > k_prompt
        ],
        "meta": {key: run.get(key) for key in ("db", "concatPrevious", "embeddingModel", "dimensions", "runAt")},
    }


def pct(value):
    return "–" if value is None else f"{value * 100:.0f}%"


def render(summaries):
    lines = ["## Kết quả tìm kiếm (RAG)", ""]

    head = ["Cấu hình", "Số câu"] + [f"recall@{k}" for k in KS] + ["MRR", "Rò rỉ"]
    lines += ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    for s in summaries:
        leak_cell = f"{len(s['leaked'])}/{s['leak_n']}" if s["leak_n"] else "–"
        row = [s["name"], str(s["n"])] + [pct(s["recall"][k]) for k in KS] + [f"{s['mrr']:.2f}", leak_cell]
        lines.append("| " + " | ".join(row) + " |")

    k_prompt = summaries[0]["k_prompt"] if summaries else 6
    lines += ["", f"### recall@{k_prompt} theo loại câu hỏi", ""]
    head = ["Loại câu hỏi"] + [s["name"] for s in summaries]
    lines += ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    for key, label in TYPE_LABELS.items():
        cells = []
        for s in summaries:
            t = s["by_type"].get(key)
            cells.append(f"{pct(t['recall'])} ({t['n']} câu)" if t else "–")
        lines.append("| " + " | ".join([label] + cells) + " |")

    lines += ["", f"### Câu không tìm được đoạn đúng trong {k_prompt} đoạn đầu", ""]
    for s in summaries:
        misses = ", ".join(f"{m['id']} ({'hạng ' + str(m['rank']) if m['rank'] else 'không có trong 10'})" for m in s["misses"])
        lines.append(f"- **{s['name']}**: {misses or 'không có'}")

    lines += ["", "### Cấu hình đã chạy", ""]
    for s in summaries:
        meta = s["meta"]
        lines.append(
            f"- **{s['name']}**: DB `{meta['db']}`, ghép câu hỏi trước: {'có' if meta['concatPrevious'] else 'không'}, "
            f"model `{meta['embeddingModel']}` {meta['dimensions']} chiều, chạy lúc {meta['runAt']}"
        )
    return "\n".join(lines) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("files", nargs="*", help="file kết quả (mặc định: eval/results/*.json)")
    parser.add_argument("--out", help="ghi bảng Markdown ra file này")
    args = parser.parse_args(argv)

    files = [Path(f) for f in args.files] or sorted((Path(__file__).parent / "results").glob("*.json"))
    if not files:
        print("Chưa có kết quả: chạy npm run eval:run trước (xem eval/README.md)", file=sys.stderr)
        return 1

    summaries = [summarize(json.loads(f.read_text(encoding="utf-8"))) for f in files]
    report = render(summaries)
    print(report)
    if args.out:
        Path(args.out).write_text(report, encoding="utf-8")
    # rò rỉ là lỗi phân quyền: trả mã lỗi để không bỏ sót
    return 2 if any(s["leaked"] for s in summaries) else 0


if __name__ == "__main__":
    sys.exit(main())
