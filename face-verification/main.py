import logging
import numpy as np
import cv2
import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from insightface.app import FaceAnalysis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("face-verification")

app = FastAPI(title="Face Verification Service")

# buffalo_s: ~100MB, bom para CPU. buffalo_l: ~280MB, mais preciso.
face_app = FaceAnalysis(
    name="buffalo_s",
    root="/models",
    providers=["CPUExecutionProvider"],
)
face_app.prepare(ctx_id=0, det_size=(640, 640))
logger.info("InsightFace pronto.")

SIMILARITY_THRESHOLD = 0.40


class VerifyRequest(BaseModel):
    selfie_url: str
    doc_url: str
    cnh_url: str


def download_image(url: str) -> np.ndarray:
    response = httpx.get(url, timeout=30.0, follow_redirects=True)
    response.raise_for_status()
    image_array = np.frombuffer(response.content, dtype=np.uint8)
    image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError(f"Imagem inválida ou corrompida: {url[:80]}")
    return image


def get_embedding(image: np.ndarray) -> np.ndarray | None:
    faces = face_app.get(image)
    if not faces:
        return None
    # Usa a face com maior área (mais proeminente)
    face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    return face.normed_embedding


def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b))  # já normalizados pelo insightface


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/verify")
def verify(req: VerifyRequest):
    try:
        selfie_img = download_image(req.selfie_url)
        doc_img = download_image(req.doc_url)
        cnh_img = download_image(req.cnh_url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro ao baixar imagens: {e}")

    selfie_emb = get_embedding(selfie_img)
    if selfie_emb is None:
        raise HTTPException(status_code=422, detail="Nenhum rosto detectado na selfie.")

    doc_emb = get_embedding(doc_img)
    cnh_emb = get_embedding(cnh_img)

    doc_sim = cosine_sim(selfie_emb, doc_emb) if doc_emb is not None else 0.0
    cnh_sim = cosine_sim(selfie_emb, cnh_emb) if cnh_emb is not None else 0.0

    logger.info(
        f"verify doc_sim={doc_sim:.4f} cnh_sim={cnh_sim:.4f} "
        f"doc_face={'ok' if doc_emb is not None else 'not_found'} "
        f"cnh_face={'ok' if cnh_emb is not None else 'not_found'}"
    )

    return {
        "doc_match": doc_sim >= SIMILARITY_THRESHOLD,
        "doc_similarity": round(doc_sim, 4),
        "doc_face_found": doc_emb is not None,
        "cnh_match": cnh_sim >= SIMILARITY_THRESHOLD,
        "cnh_similarity": round(cnh_sim, 4),
        "cnh_face_found": cnh_emb is not None,
    }
