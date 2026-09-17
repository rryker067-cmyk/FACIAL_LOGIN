import unittest

from fastapi.testclient import TestClient

from backend.app.main import app


class ApiCompatibilityTests(unittest.TestCase):
    def test_face_recognition_endpoint_exists(self):
        client = TestClient(app)
        response = client.post(
            "/api/v1/face-recognition/recognize",
            json={"image": "data:image/jpeg;base64,AAAA"},
        )

        self.assertIn(response.status_code, (200, 400, 422))


if __name__ == "__main__":
    unittest.main()
