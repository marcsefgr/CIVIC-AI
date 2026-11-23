# CivicAI photo-only classifier

This is a separate, experimental image classifier. Gemini's existing triage flow remains unchanged. The classifier reads only the report photo, suggests a broad CivicAI category, and never sets a report's priority, status, or final values. The admin review screen shows the result as an independent advisory; uncertain predictions are explicitly withheld.

## Dataset

Training images come from two sources:

- The `Programmer-RD-AI/road-issues-detection-dataset` repository, DOI [10.57967/hf/6188](https://doi.org/10.57967/hf/6188). Its Hugging Face dataset card declares CC0-1.0 and credits Ranuga Disansa, Rivindu Ashinsa, Sanila Wijesekara, and Thuan Naheem.
- TACO (Trash Annotations in Context), using the 1,034 locally downloaded resized images. The dataset kit describes TACO as CC BY 4.0 and asks users to cite Proença and Simões (2020). The TACO images are assigned to Sanitation.

CivicAI maps the road-issues source folders as follows:

- Damaged roads and broken road signs → `Infrastructure`
- Littering and garbage → `Sanitation`

The source card describes a collection assembled from several upstream datasets. The model and project credit that collection, but the upstream sources may carry additional terms. Confirm the dataset and intended use with the instructor before relying on it in a paper or public release. The raw photos are kept under `ml/data/` and excluded from project packages; only the small model artifact is packaged.

## Training

Use Python 3.12, then install `requirements-train.txt` in a virtual environment and run:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-train.txt
.\.venv\Scripts\python.exe train_image_model.py
```

The script uses the folders under `ml/data/hf-civic/data/` and `ml/data/taco/`, removes byte-identical duplicates, keeps source filename families together when creating a held-out split, and writes `training_report.json` plus `frontend/public/models/civicai-image-model.json`. The report contains the source names, class counts, split sizes, per-class metrics, confusion matrix, and score/coverage results. Both raw data folders are ignored by Git and are not copied into deployment builds.

The current run combines the road-issues dataset and TACO. After exact duplicate removal it contains 4,921 images: 2,470 Infrastructure and 2,451 Sanitation. The grouped holdout contains 1,040 images, with 89.0% accuracy and 89.3% balanced accuracy. At the 0.60 confidence and 0.15 margin cutoffs, the model returns a category for 991 images (95.3% coverage); 90.4% of those accepted predictions were correct. These are results for this dataset split, not a guarantee of accuracy on local barangay photos.

## Runtime and scope

The browser runs the exported HOG + logistic-regression classifier locally on the admin review page. No photo is sent to a new service for this classifier. The classifier covers only `Infrastructure` (damaged roads and broken road signs) and `Sanitation` (littering/garbage); potholes, `Public Safety`, `Environment`, `Public Spaces`, and `Other` are outside its training labels. Its score is experimental and may not reflect local barangay performance. Staff must inspect the report and make the final decision.

The model artifact is under `frontend/public/models/` so the normal Vite build copies it into `public/app/models/`. Training data and the local virtual environment are excluded by `.gitignore` and `tools/package_project.ps1`.
