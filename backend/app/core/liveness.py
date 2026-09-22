import base64
import binascii
import cv2
import numpy as np
from fastapi import HTTPException, status

class LightweightLiveness:
    MAX_DECODED_BYTES = 5 * 1024 * 1024
    MAX_DIMENSION = 4096
    MAX_PIXELS = 16_000_000
    MIN_MOTION_SCORE = 0.015
    # Canny edge density varies significantly with skin tone, lighting and
    # JPEG compression. Keep this as a weak replay signal, not a hard quality
    # requirement for normal camera frames.
    MIN_TEXTURE_SCORE = 0.02

    @staticmethod
    def verify_quality_and_liveness(base64_image: str, blur_threshold: float = 60.0) -> np.ndarray:
        """
        Ejecuta filtros inmediatos en OpenCV (Ultra-rápido, ~2-5ms en CPU).
        Descarta imágenes defectuosas sin tocar el modelo de IA.
        """
        try:
            # 1. Decodificar Base64 a Matriz NumPy
            if not isinstance(base64_image, str) or not base64_image:
                raise HTTPException(status_code=400, detail={"error": "IMAGE_REQUIRED"})

            if "," in base64_image:
                header, encoded_data = base64_image.split(",", 1)
                if not header.lower().startswith("data:image/"):
                    raise HTTPException(status_code=415, detail={"error": "UNSUPPORTED_IMAGE_TYPE"})
            else:
                encoded_data = base64_image

            if len(encoded_data) > ((LightweightLiveness.MAX_DECODED_BYTES * 4 // 3) + 4):
                raise HTTPException(status_code=413, detail={"error": "IMAGE_TOO_LARGE"})
            try:
                decoded = base64.b64decode(encoded_data, validate=True)
            except (ValueError, binascii.Error) as err:
                raise HTTPException(status_code=400, detail={"error": "INVALID_IMAGE_ENCODING"}) from err
            if len(decoded) > LightweightLiveness.MAX_DECODED_BYTES:
                raise HTTPException(status_code=413, detail={"error": "IMAGE_TOO_LARGE"})

            file_bytes = np.frombuffer(decoded, dtype=np.uint8)
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
            if h > LightweightLiveness.MAX_DIMENSION or w > LightweightLiveness.MAX_DIMENSION or h * w > LightweightLiveness.MAX_PIXELS:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail={"error": "IMAGE_DIMENSIONS_TOO_LARGE", "message": "La resolución máxima permitida es 4096x4096."},
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

    @staticmethod
    def verify_sequence(images: list[str]) -> tuple[list[np.ndarray], dict[str, float]]:
        """Validate a short camera sequence, including motion and texture checks.

        This is a defense-in-depth heuristic. A trained anti-spoofing model is
        still required for high-assurance biometric authentication.
        """
        if len(images) != 3:
            raise HTTPException(
                status_code=422,
                detail={"error": "LIVENESS_SEQUENCE_REQUIRED", "message": "Se requieren tres capturas consecutivas."},
            )

        frames = []
        for index, image in enumerate(images):
            try:
                frames.append(LightweightLiveness.verify_quality_and_liveness(image))
            except HTTPException as err:
                detail = err.detail if isinstance(err.detail, dict) else {
                    "error": "IMAGE_VALIDATION_FAILED",
                    "message": str(err.detail),
                }
                raise HTTPException(
                    status_code=err.status_code,
                    detail={
                        **detail,
                        "image_index": index,
                        "message": f"La captura {index + 1} no es válida: {detail.get('message', 'verifique la imagen.')}",
                    },
                ) from err
            except Exception as err:
                raise HTTPException(
                    status_code=422,
                    detail={
                        "error": "IMAGE_VALIDATION_FAILED",
                        "image_index": index,
                        "message": f"No se pudo validar la captura {index + 1}.",
                    },
                ) from err
        gray_frames = [cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) for frame in frames]
        motion_scores = []
        for previous, current in zip(gray_frames, gray_frames[1:]):
            previous_small = cv2.resize(previous, (160, 120))
            current_small = cv2.resize(current, (160, 120))
            difference = cv2.absdiff(previous_small, current_small)
            motion_scores.append(float(np.mean(difference) / 255.0))

        if max(motion_scores) < LightweightLiveness.MIN_MOTION_SCORE:
            raise HTTPException(
                status_code=422,
                detail={"error": "LIVENESS_MOTION_REQUIRED", "message": "Mueva ligeramente la cabeza durante la captura."},
            )

        texture_scores = []
        for gray in gray_frames:
            edges = cv2.Canny(gray, 80, 160)
            texture_scores.append(float(np.count_nonzero(edges) / edges.size))
        if min(texture_scores) < LightweightLiveness.MIN_TEXTURE_SCORE and max(motion_scores) < 0.08:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "POSSIBLE_REPLAY",
                    "message": "La captura tiene poca textura y movimiento insuficiente. Mantenga el rostro visible y mueva ligeramente la cabeza.",
                },
            )

        return frames, {
            "motion_score": round(max(motion_scores), 5),
            "texture_score": round(min(texture_scores), 5),
            "frame_count": float(len(frames)),
        }