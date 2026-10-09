"""Minimal OpenAI-compatible mock for end-to-end testing without a real key."""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        user = body["messages"][-1]["content"]
        reply = json.dumps({
            "steps": [
                {"text": f"测试步骤一（收到：{user[:20]}）", "substeps": ["子步骤 A"]},
                {"text": "测试步骤二", "substeps": []},
            ],
            "text": "测试改写结果", "summary": "总体判断", "tone": "中性",
            "emotions": [{"name": "焦虑", "evidence": "例子"}],
            "points": [{"title": "要点", "body": "解释"}],
            "options": [{"name": "选项甲", "pros": ["好"], "cons": ["坏"]}],
            "recommendation": "推荐甲",
            "items": [{"text": "洗澡", "minutes": 20}, {"text": "收拾", "minutes": 15}],
            "total_minutes": 35,
            "actions": [{"text": "给妈妈打电话", "category": "家庭"}],
            "recipes": [{"name": "番茄炒蛋", "description": "经典", "ingredients": ["番茄"], "steps": ["切", "炒"]}],
        }, ensure_ascii=False)
        out = {"choices": [{"message": {"content": reply}}]}
        data = json.dumps(out, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 9099), Handler).serve_forever()
