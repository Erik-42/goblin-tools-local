"""Minimal OpenAI-compatible mock for end-to-end testing without a real key."""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        user = body["messages"][-1]["content"]
        reply = json.dumps({
            "steps": [
                {"text": f"Étape de test 1 (reçu : {user[:20]})", "substeps": ["Sous-étape A"]},
                {"text": "Étape de test 2", "substeps": []},
            ],
            "text": "Texte réécrit de test", "summary": "Jugement général", "tone": "neutre",
            "emotions": [{"name": "anxiété", "evidence": "exemple"}],
            "points": [{"title": "Point clé", "body": "Explication"}],
            "options": [{"name": "Option A", "pros": ["avantage"], "cons": ["inconvénient"]}],
            "recommendation": "Je recommande A",
            "items": [{"text": "prendre une douche", "minutes": 20}, {"text": "ranger", "minutes": 15}],
            "total_minutes": 35,
            "actions": [{"text": "appeler maman", "category": "famille"}],
            "recipes": [{"name": "œufs brouillés aux tomates", "description": "classique", "ingredients": ["tomate"], "steps": ["couper", "cuire"]}],
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
