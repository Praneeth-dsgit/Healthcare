"""
MedGemma 1.5 radiology image interpretation.

Backends (in auto order):
- local: transformers on your machine/GPU (MEDGEMMA_LOCAL=true)
- vertex: Google Cloud Vertex AI (MEDGEMMA_VERTEX=true + GOOGLE_CLOUD_PROJECT)
- hf: Hugging Face router API (requires fine-grained token with Inference Providers permission;
      note: MedGemma 1.5 may not be deployed on HF serverless yet)

Research/education use only — not for clinical diagnosis without validation.
"""
from __future__ import annotations

import base64
import logging
import shutil
import threading
from io import BytesIO
from pathlib import Path
from typing import Callable, List, Optional, Tuple

import requests
from PIL import Image

from config import (
    GOOGLE_CLOUD_LOCATION,
    GOOGLE_CLOUD_PROJECT,
    HF_API_TOKEN,
    MEDGEMMA_LOCAL,
    MEDGEMMA_LOCAL_DIR,
    MEDGEMMA_MAX_TOKENS,
    MEDGEMMA_MODEL_ID,
    MEDGEMMA_PROVIDER,
    MEDGEMMA_VERTEX,
)

logger = logging.getLogger(__name__)

_LOCAL_PIPELINE = None
_LOAD_LOCK = threading.Lock()

RADIOLOGY_PROMPT = """You are a radiology education assistant for licensed healthcare professionals.
Analyze the provided medical image (X-ray, CT, MRI, ultrasound, or other radiology study).

Output valid Markdown only with these sections (use ## headers):
## TECHNIQUE
## COMPARISON
## FINDINGS
(use ### subsections per anatomical region under FINDINGS)
## IMPRESSION
## RECOMMENDATIONS

Use plain sentences under each header (no bullet lists). Use standard radiology terminology.
If modality or view is uncertain, state your best assessment and limitations.
This is for clinician education — recommend correlation with the ordering physician and source images."""

HF_GATED_REPO_HELP = (
    "Cannot download MedGemma weights (403). Do all of the following: "
    "1) Open https://huggingface.co/google/medgemma-1.5-4b-it and accept the license. "
    "2) Create a fine-grained HF token with 'Read access to public gated repositories' "
    "and 'Make calls to Inference Providers' if using cloud API. "
    "3) Update HF_API_TOKEN in .env and restart the API."
)
HF_INFERENCE_403_HELP = (
    "Create a fine-grained token at https://huggingface.co/settings/tokens/new "
    "with permission 'Make calls to Inference Providers', accept the MedGemma model "
    "license, and update HF_API_TOKEN. Note: google/medgemma-1.5-4b-it is not yet "
    "deployed on HF serverless — use MEDGEMMA_LOCAL=true or MEDGEMMA_VERTEX=true instead."
)


def _decode_b64_image_bytes(image_bytes: bytes) -> bytes:
    """Accept raw file bytes or base64-encoded ascii bytes."""
    if not image_bytes:
        raise ValueError("Empty image data")
    try:
        sample = image_bytes[:32]
        if all(c in b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r" for c in sample):
            return base64.b64decode(image_bytes, validate=False)
    except Exception:
        pass
    return image_bytes


def _pil_from_image_bytes(image_bytes: bytes) -> Image.Image:
    raw = _decode_b64_image_bytes(image_bytes)
    img = Image.open(BytesIO(raw))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    elif img.mode == "L":
        img = img.convert("RGB")
    return img


def _b64_data_url(image_bytes: bytes, image_format: str) -> str:
    raw = _decode_b64_image_bytes(image_bytes)
    fmt = (image_format or "png").lower().replace("jpg", "jpeg")
    b64 = base64.b64encode(raw).decode("ascii")
    return f"data:image/{fmt};base64,{b64}"


def _extract_chat_content(payload: dict) -> str:
    choices = payload.get("choices") or []
    if not choices:
        raise ValueError("MedGemma returned no choices")
    message = choices[0].get("message") or {}
    content = message.get("content", "")
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(block.get("text") or "")
        content = "\n".join(p for p in parts if p)
    if not isinstance(content, str) or not content.strip():
        raise ValueError("MedGemma returned empty content")
    return content.strip()


def _analyze_via_hf_inference(image_bytes: bytes, image_format: str, prompt: str) -> str:
    if not HF_API_TOKEN:
        raise ValueError("HF_API_TOKEN is not configured")

    url = "https://router.huggingface.co/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {HF_API_TOKEN}",
        "Content-Type": "application/json",
    }
    body = {
        "model": MEDGEMMA_MODEL_ID,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": _b64_data_url(image_bytes, image_format)}},
                    {"type": "text", "text": prompt},
                ],
            }
        ],
        "max_tokens": MEDGEMMA_MAX_TOKENS,
        "temperature": 0.1,
    }
    logger.info("Calling MedGemma via Hugging Face router API (%s)", MEDGEMMA_MODEL_ID)
    response = requests.post(url, headers=headers, json=body, timeout=180)
    if response.status_code == 503:
        raise RuntimeError("MedGemma model is loading on Hugging Face — retry in a few seconds")
    if response.status_code == 403:
        raise RuntimeError(HF_INFERENCE_403_HELP)
    if response.status_code == 400 and "model_not_supported" in response.text:
        raise RuntimeError(
            f"{MEDGEMMA_MODEL_ID} is not hosted on Hugging Face Inference Providers. "
            "Use MEDGEMMA_LOCAL=true (GPU) or MEDGEMMA_VERTEX=true (Google Cloud) instead."
        )
    if not response.ok:
        raise RuntimeError(f"Hugging Face API error {response.status_code}: {response.text[:500]}")
    return _extract_chat_content(response.json())


def _analyze_via_vertex_ai(image_bytes: bytes, prompt: str) -> str:
    if not GOOGLE_CLOUD_PROJECT:
        raise ValueError("GOOGLE_CLOUD_PROJECT is not configured for Vertex AI MedGemma")

    try:
        import vertexai
        from vertexai.generative_models import GenerativeModel, Part
    except ImportError as exc:
        raise RuntimeError(
            "Vertex MedGemma requires google-cloud-aiplatform. "
            "Run: pip install google-cloud-aiplatform"
        ) from exc

    vertexai.init(project=GOOGLE_CLOUD_PROJECT, location=GOOGLE_CLOUD_LOCATION)
    model = GenerativeModel("medgemma-1.5-4b-it")
    image = _pil_from_image_bytes(image_bytes)
    logger.info(
        "Calling MedGemma via Vertex AI (project=%s, location=%s)",
        GOOGLE_CLOUD_PROJECT,
        GOOGLE_CLOUD_LOCATION,
    )
    response = model.generate_content(
        [prompt, Part.from_image(image)],
        generation_config={"max_output_tokens": MEDGEMMA_MAX_TOKENS, "temperature": 0.1},
    )
    text = getattr(response, "text", None) or ""
    if not text.strip():
        raise ValueError("Vertex MedGemma returned empty content")
    return text.strip()


def _weights_ready(model_dir: Path) -> bool:
    if not model_dir.is_dir():
        return False
    if (model_dir / "model.safetensors.index.json").is_file():
        return True
    if any(model_dir.glob("model-*.safetensors")):
        return True
    if (model_dir / "model.safetensors").is_file():
        return True
    return False


def _clear_hf_locks_for_model() -> None:
    """Remove stale HF hub lock files that break on Windows."""
    cache_root = Path.home() / ".cache" / "huggingface" / "hub" / ".locks"
    if not cache_root.is_dir():
        return
    slug = f"models--{MEDGEMMA_MODEL_ID.replace('/', '--')}"
    lock_dir = cache_root / slug
    if lock_dir.exists():
        shutil.rmtree(lock_dir, ignore_errors=True)
        logger.info("Cleared stale Hugging Face lock directory: %s", lock_dir)


def _download_model_weights() -> str:
    from huggingface_hub import snapshot_download

    model_dir = Path(MEDGEMMA_LOCAL_DIR)
    model_dir.mkdir(parents=True, exist_ok=True)

    if _weights_ready(model_dir):
        logger.info("Using existing MedGemma weights at %s", model_dir)
        return str(model_dir)

    logger.info(
        "Downloading MedGemma weights (%s) to %s — first run is ~8GB and may take several minutes",
        MEDGEMMA_MODEL_ID,
        model_dir,
    )

    def _run_download() -> str:
        snapshot_download(
            repo_id=MEDGEMMA_MODEL_ID,
            token=HF_API_TOKEN,
            local_dir=str(model_dir),
            max_workers=1,
        )
        return str(model_dir)

    try:
        return _run_download()
    except OSError as exc:
        if "invalid argument" in str(exc).lower() and ".lock" in str(exc).lower():
            logger.warning("HF hub lock error on Windows — clearing locks and retrying once")
            _clear_hf_locks_for_model()
            return _run_download()
        raise
    except Exception as exc:
        err = str(exc).lower()
        if "403" in err or "gated" in err or "forbidden" in err:
            raise RuntimeError(HF_GATED_REPO_HELP) from exc
        if "invalid argument" in err and ".lock" in err:
            logger.warning("HF hub lock error on Windows — clearing locks and retrying once")
            _clear_hf_locks_for_model()
            try:
                return _run_download()
            except Exception as retry_exc:
                err = str(retry_exc).lower()
                if "403" in err or "gated" in err or "forbidden" in err:
                    raise RuntimeError(HF_GATED_REPO_HELP) from retry_exc
                raise
        raise


def _resolve_torch_device(torch):
    """Pick cuda only when kernels actually run (RTX 50xx needs PyTorch cu128)."""
    if not torch.cuda.is_available():
        return "cpu", torch.float32

    cap = torch.cuda.get_device_capability(0)
    arch_list = torch.cuda.get_arch_list() if hasattr(torch.cuda, "get_arch_list") else []
    sm_tag = f"sm_{cap[0]}{cap[1]}"
    if arch_list and sm_tag not in arch_list and cap[0] >= 10:
        logger.warning(
            "GPU %s (%s) is not supported by torch %s (archs: %s). "
            "Install CUDA 12.8 wheels: pip install torch torchvision "
            "--index-url https://download.pytorch.org/whl/cu128",
            torch.cuda.get_device_name(0),
            sm_tag,
            torch.__version__,
            ", ".join(arch_list),
        )
        return "cpu", torch.float32

    try:
        probe = torch.zeros(1, device="cuda")
        probe.fill_(1.0)
        torch.cuda.synchronize()
        return "cuda", torch.bfloat16
    except RuntimeError as exc:
        logger.warning(
            "CUDA device %s failed a probe with torch %s (%s). Using CPU instead.",
            torch.cuda.get_device_name(0),
            torch.__version__,
            exc,
        )
        return "cpu", torch.float32


def _build_local_pipeline(torch, pipeline, model_path: str, device: str, dtype):
    model_kwargs: dict = {"dtype": dtype}
    if device == "cuda":
        model_kwargs["device_map"] = "auto"

    pipe = pipeline(
        "image-text-to-text",
        model=model_path,
        model_kwargs=model_kwargs,
    )
    try:
        pipe.model.generation_config.do_sample = False
    except Exception:
        pass
    return pipe


def _get_local_pipeline():
    global _LOCAL_PIPELINE
    if _LOCAL_PIPELINE is not None:
        return _LOCAL_PIPELINE

    with _LOAD_LOCK:
        if _LOCAL_PIPELINE is not None:
            return _LOCAL_PIPELINE
        try:
            import torch
            from transformers import pipeline
        except ImportError as exc:
            raise RuntimeError(
                "Local MedGemma requires torch, transformers, and huggingface_hub. "
                "Install: pip install torch transformers accelerate"
            ) from exc

        if not HF_API_TOKEN:
            raise RuntimeError(
                "HF_API_TOKEN is required to download gated MedGemma weights. "
                "Accept the license at https://huggingface.co/google/medgemma-1.5-4b-it "
                "then set HF_API_TOKEN in .env"
            )

        device, dtype = _resolve_torch_device(torch)

        logger.info(
            "torch=%s cuda_available=%s device_count=%s selected_device=%s",
            torch.__version__,
            torch.cuda.is_available(),
            torch.cuda.device_count() if torch.cuda.is_available() else 0,
            device,
        )

        model_path = _download_model_weights()
        logger.info("MedGemma weights ready at %s — loading pipeline on %s", model_path, device)

        try:
            _LOCAL_PIPELINE = _build_local_pipeline(torch, pipeline, model_path, device, dtype)
        except RuntimeError as exc:
            if device == "cuda" and "no kernel image" in str(exc).lower():
                logger.warning(
                    "CUDA load failed (%s) — retrying MedGemma on CPU (slower, needs ~16GB RAM)",
                    exc,
                )
                _LOCAL_PIPELINE = _build_local_pipeline(
                    torch, pipeline, model_path, "cpu", torch.float32
                )
            else:
                raise
        return _LOCAL_PIPELINE


def _analyze_via_local_transformers(image_bytes: bytes, prompt: str) -> str:
    pipe = _get_local_pipeline()
    image = _pil_from_image_bytes(image_bytes)
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": prompt},
            ],
        }
    ]
    logger.info("Running local MedGemma inference")
    output = pipe(text=messages, max_new_tokens=MEDGEMMA_MAX_TOKENS, do_sample=False)
    if not output:
        raise ValueError("Local MedGemma returned no output")
    generated = output[0].get("generated_text")
    if isinstance(generated, list):
        for turn in reversed(generated):
            if isinstance(turn, dict) and turn.get("role") == "assistant":
                content = turn.get("content")
                if isinstance(content, str) and content.strip():
                    return content.strip()
        raise ValueError("Could not parse local MedGemma assistant message")
    if isinstance(generated, str) and generated.strip():
        return generated.strip()
    raise ValueError("Unexpected local MedGemma output format")


def _provider_chain() -> List[Tuple[str, Callable[[bytes, str, str], str]]]:
    """Return (name, fn) backends to try. fn(image_bytes, image_format, prompt) -> text."""
    backends: List[Tuple[str, Callable[[bytes, str, str], str]]] = []

    def local_fn(b, _fmt, p):
        return _analyze_via_local_transformers(b, p)

    def vertex_fn(b, _fmt, p):
        return _analyze_via_vertex_ai(b, p)

    def hf_fn(b, fmt, p):
        return _analyze_via_hf_inference(b, fmt, p)

    if MEDGEMMA_PROVIDER == 'local':
        backends.append(('local', local_fn))
    elif MEDGEMMA_PROVIDER == 'vertex':
        backends.append(('vertex', vertex_fn))
    elif MEDGEMMA_PROVIDER == 'hf':
        backends.append(('hf', hf_fn))
    else:
        # auto: HF does not host MedGemma 1.5 serverless — prefer local/vertex
        if MEDGEMMA_LOCAL:
            backends.append(('local', local_fn))
        if MEDGEMMA_VERTEX or GOOGLE_CLOUD_PROJECT:
            backends.append(('vertex', vertex_fn))
        # HF router only if explicitly no local/vertex configured
        if HF_API_TOKEN and not MEDGEMMA_LOCAL and not (MEDGEMMA_VERTEX or GOOGLE_CLOUD_PROJECT):
            backends.append(('hf', hf_fn))

    return backends


def analyze_radiology_image(
    image_bytes: bytes,
    image_format: str = "png",
    prompt: Optional[str] = None,
) -> str:
    """Run MedGemma 1.5 on a radiology image. Raises on failure."""
    text_prompt = prompt or RADIOLOGY_PROMPT
    chain = _provider_chain()
    if not chain:
        raise ValueError(
            "No MedGemma backend configured. Set MEDGEMMA_LOCAL=true, "
            "MEDGEMMA_VERTEX=true with GOOGLE_CLOUD_PROJECT, or HF_API_TOKEN."
        )

    errors: List[str] = []
    for name, fn in chain:
        try:
            return fn(image_bytes, image_format, text_prompt)
        except Exception as exc:
            msg = f"{name}: {exc}"
            errors.append(msg)
            logger.warning("MedGemma backend failed (%s)", msg)

    raise RuntimeError("All MedGemma backends failed. " + " | ".join(errors))


def try_medgemma_radiology_analysis(
    image_bytes: bytes,
    image_format: str = "png",
    prompt: Optional[str] = None,
) -> Optional[str]:
    """Return analysis text or None if MedGemma is unavailable/fails."""
    try:
        result = analyze_radiology_image(image_bytes, image_format=image_format, prompt=prompt)
        if len(result.strip()) < 50:
            logger.warning("MedGemma response too short (%s chars)", len(result))
            return None
        logger.info("MedGemma radiology analysis succeeded (%s chars)", len(result))
        return result
    except Exception as exc:
        logger.warning("MedGemma radiology analysis failed: %s", exc)
        return None
