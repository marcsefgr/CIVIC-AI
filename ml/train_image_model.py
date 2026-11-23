"""Train CivicAI's photo-only issue classifier from the selected HF image folders."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import date
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps
from skimage.feature import hog
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, balanced_accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import GroupShuffleSplit


ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "hf-civic" / "data"
TACO_DATA = ROOT / "data" / "taco"
MODEL_OUT = ROOT.parent / "frontend" / "public" / "models" / "civicai-image-model.json"
REPORT_OUT = ROOT / "training_report.json"
IMAGE_SIZE = (64, 64)
SOURCE_TO_CATEGORY = {
    "Littering Garbage on Public Places Issues": "Sanitation",
    "Broken Road Sign Issues": "Infrastructure",
    "Damaged Road issues": "Infrastructure",
}


def family_id(path: Path) -> str:
    """Keep Roboflow variants of the same source image in a single split."""
    stem = path.stem.lower()
    stem = re.sub(r"\.rf\..*$", "", stem)
    stem = re.sub(r"_a\d+(?:_jpe?g|_png)?$", "", stem)
    stem = re.sub(r"_[a-f0-9]{16,}$", "", stem)
    return f"{path.parent.name}:{stem}"


def extract_hog(path: Path) -> np.ndarray:
    with Image.open(path) as source:
        image = ImageOps.fit(
            source.convert("RGB"),
            IMAGE_SIZE,
            method=Image.Resampling.BILINEAR,
            centering=(0.5, 0.5),
        )
        rgb = np.asarray(image, dtype=np.float32) / 255.0
        pixels = rgb[:, :, 0] * 0.2125 + rgb[:, :, 1] * 0.7154 + rgb[:, :, 2] * 0.0721
    return hog(
        pixels,
        orientations=9,
        pixels_per_cell=(8, 8),
        cells_per_block=(2, 2),
        block_norm="L2-Hys",
        transform_sqrt=False,
        feature_vector=True,
    ).astype(np.float32)


def main() -> None:
    examples: list[tuple[Path, str, str]] = []
    for folder_name, category in SOURCE_TO_CATEGORY.items():
        matches = list(DATA.rglob(folder_name))
        if not matches:
            raise SystemExit(f"Missing dataset class folder: {folder_name} under {DATA}")
        folder = matches[0]
        for path in sorted(folder.glob("*.jpg")):
            examples.append((path, category, family_id(path)))

    # TACO contains litter/waste scenes; include these as additional Sanitation
    # examples while retaining the original source folders for grouped splitting.
    for path in sorted(TACO_DATA.rglob("*.jpg")):
        examples.append((path, "Sanitation", family_id(path)))

    if not examples:
        raise SystemExit(f"No image files found under {DATA}")

    # Remove byte-identical duplicates before splitting, so a duplicate cannot leak
    # between train and holdout data.
    seen_hashes: set[str] = set()
    unique: list[tuple[Path, str, str]] = []
    for path, category, group in examples:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest in seen_hashes:
            continue
        seen_hashes.add(digest)
        unique.append((path, category, group))

    features: list[np.ndarray] = []
    labels: list[str] = []
    groups: list[str] = []
    skipped: list[dict[str, str]] = []
    for index, (path, category, group) in enumerate(unique, start=1):
        try:
            features.append(extract_hog(path))
            labels.append(category)
            groups.append(group)
        except Exception as error:  # corrupt source image should not abort the full run
            skipped.append({"file": path.name, "reason": type(error).__name__})
        if index % 250 == 0:
            print(f"Prepared {index}/{len(unique)} images", flush=True)

    x = np.vstack(features)
    y = np.asarray(labels)
    group_ids = np.asarray(groups)
    splitter = GroupShuffleSplit(n_splits=1, test_size=0.20, random_state=42)
    train_idx, test_idx = next(splitter.split(x, y, group_ids))
    missing_test = sorted(set(y) - set(y[test_idx]))
    if missing_test:
        raise SystemExit(f"Holdout split is missing categories: {missing_test}")

    classifier = LogisticRegression(
        C=1.0,
        max_iter=500,
        class_weight="balanced",
        random_state=42,
    )
    classifier.fit(x[train_idx], y[train_idx])
    probabilities = classifier.predict_proba(x[test_idx])
    predictions = classifier.classes_[probabilities.argmax(axis=1)]
    report = classification_report(
        y[test_idx], predictions, labels=classifier.classes_, output_dict=True, zero_division=0
    )
    matrix = confusion_matrix(y[test_idx], predictions, labels=classifier.classes_)

    ranked = np.sort(probabilities, axis=1)
    confidences = ranked[:, -1]
    margins = ranked[:, -1] - ranked[:, -2]
    coverage_rows: dict[str, dict[str, float | int]] = {}
    for threshold in (0.50, 0.60, 0.70, 0.80):
        mask = (confidences >= threshold) & (margins >= 0.15)
        coverage_rows[str(threshold)] = {
            "accepted": int(mask.sum()),
            "coverage": float(mask.mean()) if len(mask) else 0.0,
            "accuracy": float(accuracy_score(y[test_idx][mask], predictions[mask])) if mask.any() else 0.0,
        }

    metadata = {
        "name": "CivicAI photo issue classifier",
        "model_type": "HOG features + logistic regression",
        "image_size": IMAGE_SIZE[0],
        "orientations": 9,
        "pixels_per_cell": 8,
        "cells_per_block": 2,
        "classes": classifier.classes_.tolist(),
        "trained_on": [
            "Programmer-RD-AI/road-issues-detection-dataset",
            "TACO (Trash Annotations in Context)",
        ],
        "dataset_doi": "10.57967/hf/6188",
        "dataset_licenses": {
            "road_issues_detection_dataset": "CC0-1.0 as declared by its Hugging Face card; upstream source terms may also apply",
            "taco": "CC BY 4.0 as stated by the CivicAI dataset kit; verify image-level terms before redistribution",
        },
        "dataset_citations": [
            "Disansa et al. (2025), Road Issues Detection Dataset, DOI: 10.57967/hf/6188",
            "Proença and Simões (2020), TACO: Trash Annotations in Context",
        ],
        "generated_on": date.today().isoformat(),
        "confidence_margin_threshold": 0.15,
        "source_labels_mapped": SOURCE_TO_CATEGORY,
        "confidence_threshold": 0.60,
        "holdout_accuracy": float(accuracy_score(y[test_idx], predictions)),
        "holdout_balanced_accuracy": float(balanced_accuracy_score(y[test_idx], predictions)),
        "limitations": [
            "Photo-only classifier; it does not read descriptions or set priority/status.",
            "Infrastructure examples cover damaged roads and broken signs; Sanitation examples cover littering and waste.",
            "A low-confidence output is shown as uncertain; staff must make the final decision.",
            "Dataset images come from multiple sources and locations; local barangay accuracy may differ.",
        ],
    }
    MODEL_OUT.parent.mkdir(parents=True, exist_ok=True)
    coefficients = classifier.coef_
    intercepts = classifier.intercept_
    if len(classifier.classes_) == 2 and coefficients.shape[0] == 1:
        # Expand scikit-learn's binary log-odds row into two-class softmax form.
        coefficients = np.vstack((-coefficients[0], coefficients[0]))
        intercepts = np.asarray([-intercepts[0], intercepts[0]])
    model_payload = {
        "metadata": metadata,
        "feature_count": int(coefficients.shape[1]),
        "coefficients": coefficients.tolist(),
        "intercepts": intercepts.tolist(),
    }
    MODEL_OUT.write_text(json.dumps(model_payload, separators=(",", ":")), encoding="utf-8")

    counts = {label: int((y == label).sum()) for label in sorted(set(y))}
    result = {
        "metadata": metadata,
        "dataset_images_after_deduplication": len(y),
        "images_by_category": counts,
        "skipped_images": skipped,
        "split": {"train": len(train_idx), "holdout": len(test_idx), "grouped_by_source_filename": True},
        "holdout_accuracy": float(accuracy_score(y[test_idx], predictions)),
        "holdout_balanced_accuracy": float(balanced_accuracy_score(y[test_idx], predictions)),
        "holdout_per_class": report,
        "holdout_confusion_matrix": {
            "labels": classifier.classes_.tolist(),
            "values": matrix.tolist(),
        },
        "confidence_coverage": coverage_rows,
        "model_file": str(MODEL_OUT.relative_to(ROOT.parent)),
    }
    REPORT_OUT.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    print(f"Wrote model: {MODEL_OUT}")


if __name__ == "__main__":
    main()
