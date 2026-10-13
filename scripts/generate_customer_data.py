import csv
import json
from pathlib import Path

src = Path(r"E:\dataset_any\dataset_analyser\data\watched\customer_shopping_data.csv")
out = Path(r"E:\dataset_any\dataset_analyser\data\customer_shopping_data.json")

with src.open("r", newline="", encoding="utf-8") as f:
    rows = list(csv.DictReader(f))

out.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Wrote {len(rows)} rows to {out}")
