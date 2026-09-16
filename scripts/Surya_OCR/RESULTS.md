# Surya OCR 시도 기록 (2026-09-12) — 보류

## 결론

**이 Windows(GTX 1060) 환경에서는 Surya를 실용적으로 못 씀.** 벤치마크 수치조차 못 뽑고
환경 문제로 중단했다. 다른 팀원이 Mac/Linux에서 재시도하거나, 더 최신 GPU 환경에서
다시 시도해볼 여지는 있다.

## 겪은 문제 (순서대로)

1. **기본 백엔드(vllm) 자동 선택 → 무한 대기.** Surya는 NVIDIA GPU가 있으면 자동으로
   vllm 백엔드를 고르는데, `pip install surya-ocr`는 vllm을 설치하지 않고, **vllm 자체가
   Windows를 공식 지원하지 않는다.** 자식 프로세스가 죽어도 부모가 이를 감지 못 하고
   10분 넘게 아무 CPU 활동 없이 멈춰있었다(`~/.cache/datalab/surya/vllm_server.lock`만
   생성된 채 멈춤).
2. **`SURYA_INFERENCE_BACKEND=llamacpp`로 강제 전환 → 바이너리 없음 에러.** 이건 즉시
   명확한 에러를 내서(`llama-server binary not found`) 원인 파악은 쉬웠다.
3. **llama.cpp Windows CUDA 바이너리 수동 설치.** `github.com/ggml-org/llama.cpp`
   nightly 릴리스에서 `llama-b10809-bin-win-cuda-12.4-x64.zip` +
   `cudart-llama-bin-win-cuda-12.4-x64.zip`(합쳐서 ~640MB)를 받아
   `LLAMA_CPP_BINARY` 환경변수로 지정.
4. **모델(GGUF, ~1.5GB) 다운로드까지는 성공**했으나, 이후 로딩 단계에서 **18분 넘게
   진행되며 끝나지 않아 강제 종료.** CPU 시간은 계속 누적되고 있어(진짜 멈춘 건 아님)
   구형 GPU(Pascal, compute capability 6.1)용 CUDA 커널을 최초 실행 시 JIT 컴파일하는
   과정이 비정상적으로 오래 걸리는 것으로 추정되나 확인은 못 했다.

## 다음에 다시 시도한다면

- **Mac/Linux 환경**에서 먼저 시도 — vllm이 정식 지원되는 플랫폼이라 이런 문제 자체가
  없을 가능성이 높다.
- Windows에서 계속하려면 `LLAMA_CPP_BINARY`를 **CPU 전용 빌드**(`llama-b10809-bin-win-cpu-x64.zip`)로
  바꿔서 CUDA JIT 컴파일 문제를 우회할 수 있는지 시도해볼 것(느리겠지만 일단 동작 여부 확인 목적).
- 그래도 안 되면 이 접근은 포기하고 PaddleOCR-VL 등 다른 후보로 넘어갈 것.

## 남은 파일

- `scripts/Surya_OCR/.venv` — 전용 venv (surya-ocr, torch 등 설치됨)
- `scripts/Surya_OCR/llama_cpp_bin/` — llama.cpp Windows CUDA 바이너리 (~640MB, 재사용 가능)
- `~/.cache/huggingface/hub/models--datalab-to--surya-ocr-2-gguf` — 다운로드된 GGUF
  모델 (~1.5GB, 재다운로드 불필요)

전부 로컬에만 있고 git에는 안 잡힘. 디스크 정리하려면 지워도 되고, 재시도할 계획이면
남겨둬도 됨(재다운로드 안 해도 되니).
