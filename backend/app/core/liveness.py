import base64
import cv2
import numpy as np
from fastapi import HTTPException, status

class LightweightLiveness:
    @staticmethod
    def verify_quality_and_liveness(base64_image: str, blur_threshold: float = 60.0) -> np.ndarray:
        """
        Ejecuta filtros inmediatos en OpenCV (Ultra-rápido, ~2-5ms en CPU).
        Descarta imágenes defectuosas sin tocar el modelo de IA.
        """
        try:
            # 1. Decodificar Base64 a Matriz NumPy
            if "," in base64_image:
                encoded_data = base64_image.split(',')[1]
            else:
                encoded_data = base64_image
                
            file_bytes = np.frombuffer(base64.b64decode(encoded_data), dtype=np.uint8)
            image = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

            if image is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No se pudo decodificar el buffer Base64 enviado."
                )

            # 2. Verificación de Resolución Mínima
            h, w, _ = image.shape
            if h < 160 or w < 160:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Resolución insuficiente. Acerque el rostro a la cámara."
                )

            # 3. Detección de Desenfoque (Laplacian Variance)
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            blur_score = cv2.Laplacian(gray, cv2.CV_64F).var()

            if blur_score < blur_threshold:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Foto borrosa (Score: {round(blur_score, 1)}). Por favor mantenga firme la cámara."
                )

            # 4. Verificación Básica de Exposición/Iluminación
            mean_brightness = np.mean(gray)
            if mean_brightness < 40 or mean_brightness > 220:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Condiciones de luz deficientes (Entorno muy oscuro o con sobreexposición)."
                )

            return image

        except Exception as err:
            if isinstance(err, HTTPException):
                raise err
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Error en validación biológica de imagen: {str(err)}"
            )