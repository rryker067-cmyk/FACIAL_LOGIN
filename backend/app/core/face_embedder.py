import os

import cv2
import numpy as np
import onnxruntime as ort
from fastapi import HTTPException, status


class FaceEmbedder:
    def __init__(self, model_path: str = "app/models/face_recognition.onnx"):
        self.model_path = model_path
        self.session = None
        self.input_name = None

        if os.path.exists(model_path):
            opts = ort.SessionOptions()
            opts.intra_op_num_threads = 1
            opts.inter_op_num_threads = 1
            opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
            opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

            self.session = ort.InferenceSession(
                model_path,
                sess_options=opts,
                providers=['CPUExecutionProvider']
            )
            self.input_name = self.session.get_inputs()[0].name

    def extract_embedding(self, cv2_image: np.ndarray) -> list[float]:
        try:
            resized = cv2.resize(cv2_image, (112, 112))
            rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)

            if self.session is not None and self.input_name is not None:
                normalized = (rgb.astype(np.float32) - 127.5) / 128.0
                transposed = np.transpose(normalized, (2, 0, 1))
                input_tensor = np.expand_dims(transposed, axis=0)
                outputs = self.session.run(None, {self.input_name: input_tensor})
                raw_embedding = outputs[0][0]
            else:
                flat = rgb.astype(np.float32).reshape(-1)
                raw_embedding = flat[:128]
                if raw_embedding.size < 128:
                    raw_embedding = np.pad(raw_embedding, (0, 128 - raw_embedding.size), mode='constant')

            norm = np.linalg.norm(raw_embedding)
            if norm == 0:
                raise ValueError("Vector nulo generado.")

            normalized_embedding = (raw_embedding / norm).tolist()
            return normalized_embedding

        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Fallo en la extracción del vector biométrico: {str(err)}"
            )


face_embedder = FaceEmbedder()