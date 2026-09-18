import os
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from fastapi import HTTPException, status


class FaceEmbedder:
    EMBEDDING_DIMENSION = 512

    def __init__(self, model_path: str | None = None):
        if model_path is None:
            model_path = str(Path(__file__).resolve().parents[1] / "models" / "face_recognition.onnx")
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
                raise RuntimeError(
                    f"Modelo facial ONNX no disponible en {self.model_path}. "
                    "El servicio no puede realizar reconocimiento biométrico."
                )

            raw_embedding = np.asarray(raw_embedding, dtype=np.float32).reshape(-1)
            if raw_embedding.size != self.EMBEDDING_DIMENSION:
                raise ValueError(
                    f"El modelo facial generó {raw_embedding.size} dimensiones; "
                    f"Supabase requiere {self.EMBEDDING_DIMENSION}."
                )

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