"""Downloads the narrator voices at build time and verifies their checksums.

The models come from https://huggingface.co/rhasspy/piper-voices, pinned to a
fixed commit. Both voices are trained on CC0 datasets.
"""

import hashlib
import sys
import urllib.request
from pathlib import Path

REPO = "https://huggingface.co/rhasspy/piper-voices/resolve/6b9cfaacb4fb2e02a9621227e3c1a48bec9710c3/de/de_DE"

FILES = {
    "thorsten/high/de_DE-thorsten-high.onnx": "9df1c43c61149ef9b39e618e2b861fbe41e1fcea9390b2dac62e8761573ea4f1",
    "thorsten/high/de_DE-thorsten-high.onnx.json": "6de734444e4c3f9e33b7ebe2746dbc19b71e85f613e79c65acf623200b99a76a",
    "kerstin/medium/de_DE-kerstin-medium.onnx": "c56d70475fb99248a20e60dafbcd107475e60d7e01deec18ba65201d288d015d",
    "kerstin/medium/de_DE-kerstin-medium.onnx.json": "8e86846ab0c5c5403c25125e3a505841eec4a52eed7d2babf904990883f7e83d",
}


def main(target: Path) -> None:
    target.mkdir(parents=True, exist_ok=True)
    for path, expected in FILES.items():
        destination = target / Path(path).name
        print(f"Downloading {path}", flush=True)
        digest = hashlib.sha256()
        with urllib.request.urlopen(f"{REPO}/{path}", timeout=120) as response, open(destination, "wb") as out:
            while chunk := response.read(1 << 20):
                digest.update(chunk)
                out.write(chunk)
        if digest.hexdigest() != expected:
            destination.unlink()
            sys.exit(f"Checksum mismatch for {path}")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "/voices"))
