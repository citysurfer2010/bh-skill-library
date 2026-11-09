FROM python:3.12-slim
RUN pip install --no-cache-dir "opencv-python-headless==4.10.0.84" "numpy<2"
ADD --checksum=sha256:8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4 https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx /models/yunet.onnx
ADD https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx /models/sface.onnx
RUN chmod 644 /models/*.onnx
COPY analyze.py /app/analyze.py
USER 1000
CMD ["python", "-u", "/app/analyze.py"]
