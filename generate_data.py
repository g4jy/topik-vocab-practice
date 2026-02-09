"""Convert TOPIK CSV files to JSON for the web app.
Reads from TOPIK_Vocabulary/ and outputs to data/topik{N}.json
Also generates a combined category mapping from the category CSVs.
"""
import csv
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

TOPIK_DIR = r"G:\내 드라이브\Preply\TOPIK_Vocabulary"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'data')

# Category CSV mapping
CATEGORIES = [
    'Food', 'Actions', 'People', 'Places', 'Nature',
    'Describe', 'Transport', 'Daily', 'Numbers', 'Connect',
    'Emotions', 'Body', 'Time'
]

def load_category_mapping(level):
    """Load category CSVs for a given level and build word→category mapping."""
    mapping = {}
    for cat_name in CATEGORIES:
        filename = f"TOPIK{level}_{cat_name}.csv"
        path = os.path.join(TOPIK_DIR, filename)
        if not os.path.exists(path):
            continue
        with open(path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            header = next(reader, None)
            if not header:
                continue
            # Find Korean word column
            kr_idx = None
            for i, h in enumerate(header):
                if 'Korean' in h or h.strip() == 'Korean Word':
                    kr_idx = i
                    break
            if kr_idx is None:
                # Try 3rd column (common pattern in category CSVs)
                kr_idx = 2
            for row in reader:
                if row and len(row) > kr_idx:
                    word = row[kr_idx].strip()
                    if word:
                        mapping[word] = cat_name
    return mapping


def clean_word(word):
    """Remove numbering suffixes like ₀₁, ₀₂ from Korean words."""
    return re.sub(r'\s*[₀-₉]+', '', word).strip()


def classify_by_pos(word_class):
    """Auto-classify word by part of speech if no category found."""
    wc = word_class.lower()
    if 'verb' in wc:
        return 'Actions'
    if 'adjective' in wc:
        return 'Describe'
    if 'adverb' in wc:
        return 'Connect'
    if 'noun' in wc:
        return 'Daily'
    return 'Other'


def convert_level(level):
    """Convert a single TOPIK level CSV to JSON."""
    csv_path = os.path.join(TOPIK_DIR, f"TOPIK_VOCAB - TOPIK {level}급.csv")
    cat_mapping = load_category_mapping(level)

    words = []
    seen = set()

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        # Detect column structure (varies slightly between levels)
        # Level 1-2: Korean Word, Word Class, English Meaning, Korean Example, English Translation
        # Level 3+: Korean Word, Part of Speech, English Meaning, Korean Example, English Translation

        for row in reader:
            if len(row) < 5:
                continue

            korean_raw = row[0].strip()
            korean = clean_word(korean_raw)
            if not korean or korean in seen:
                continue
            seen.add(korean)

            word_class = row[1].strip()
            english = row[2].strip()
            example_kr = row[3].strip()
            example_en = row[4].strip()

            # Determine category
            category = cat_mapping.get(korean, classify_by_pos(word_class))

            words.append({
                'kr': korean,
                'en': english,
                'pos': word_class,
                'category': category,
                'ex_kr': example_kr,
                'ex_en': example_en,
            })

    # Sort by Korean alphabetical order
    words.sort(key=lambda w: w['kr'])

    out_path = os.path.join(OUTPUT_DIR, f'topik{level}.json')
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(words, f, ensure_ascii=False, indent=1)

    return len(words)


def main():
    print("=== TOPIK CSV → JSON Conversion ===\n")
    total = 0
    for level in range(1, 7):
        count = convert_level(level)
        total += count
        print(f"Level {level}: {count} words → data/topik{level}.json")
    print(f"\nTotal: {total} words converted")


if __name__ == '__main__':
    main()
