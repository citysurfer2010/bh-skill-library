"""Finds faces in one picture and returns their fingerprints. Keeps nothing and has no network route to the outside."""
import base64
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

import cv2
import numpy as np

MAX_SIDE = 1280
MIN_FACE_PX = 48
SCORE_THRESHOLD = 0.8
MAX_BODY = 16 * 1024 * 1024
CROP_QUALITY = 80

detector = cv2.FaceDetectorYN.create("/models/yunet.onnx", "", (320, 320), SCORE_THRESHOLD, 0.3, 50)
recognizer = cv2.FaceRecognizerSF.create("/models/sface.onnx", "")


def b64(data):
    return base64.b64encode(data).decode("ascii")


def analyze(body):
    image = cv2.imdecode(np.frombuffer(body, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        return None
    height, width = image.shape[:2]
    scale = min(1.0, MAX_SIDE / max(width, height))
    if scale < 1.0:
        image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        height, width = image.shape[:2]
    detector.setInputSize((width, height))
    _, found = detector.detect(image)
    faces = []
    for face in [] if found is None else found:
        if min(face[2], face[3]) < MIN_FACE_PX:
            continue
        crop = recognizer.alignCrop(image, face)
        grey = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        ok, jpeg = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, CROP_QUALITY])
        faces.append({
            "box": [round(float(face[0]) / width, 4), round(float(face[1]) / height, 4), round(float(face[2]) / width, 4), round(float(face[3]) / height, 4)],
            "score": round(float(face[-1]), 3),
            "sharpness": round(float(cv2.Laplacian(grey, cv2.CV_64F).var()), 1),
            "fingerprint": b64(recognizer.feature(crop)[0].astype(np.float32).tobytes()),
            "crop": b64(jpeg.tobytes()) if ok else None,
        })
    return {"width": width, "height": height, "faces": faces}


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, payload):
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.reply(200 if self.path == "/health" else 404, {"ok": self.path == "/health"})

    def do_POST(self):
        size = int(self.headers.get("content-length") or 0)
        if self.path != "/analyze" or not 0 < size <= MAX_BODY:
            self.reply(400, {"error": "invalid request"})
            return
        result = analyze(self.rfile.read(size))
        self.reply(200, result) if result else self.reply(422, {"error": "not an image"})

    def log_message(self, *_args):
        pass  # File names and faces never reach a log.


if __name__ == "__main__":
    HTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
