"""Generate TTS audio files for TOPIK vocabulary using edge-tts.
Generates audio only for Korean words (not example sentences).
Creates manifest.json mapping text → filename.
"""
import asyncio
import json
import hashlib
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

try:
    import edge_tts
except ImportError:
    print("Installing edge-tts...")
    import subprocess
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'edge-tts'])
    import edge_tts

VOICE = 'ko-KR-SunHiNeural'
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
AUDIO_DIR = os.path.join(os.path.dirname(__file__), 'audio', 'tts')
MANIFEST_PATH = os.path.join(AUDIO_DIR, 'manifest.json')


async def generate_audio(text, filepath):
    """Generate a single TTS audio file."""
    communicate = edge_tts.Communicate(text, VOICE)
    await communicate.save(filepath)


async def main():
    os.makedirs(AUDIO_DIR, exist_ok=True)

    # Load existing manifest
    manifest = {}
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
            manifest = json.load(f)

    # Collect all unique Korean words from all levels
    all_words = set()
    for level in range(1, 7):
        json_path = os.path.join(DATA_DIR, f'topik{level}.json')
        if not os.path.exists(json_path):
            continue
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        for word in data:
            all_words.add(word['kr'])

    print(f"Total unique words: {len(all_words)}")

    # Filter out words that already have audio
    to_generate = []
    for text in sorted(all_words):
        if text in manifest:
            audio_path = os.path.join(AUDIO_DIR, manifest[text])
            if os.path.exists(audio_path):
                continue
        to_generate.append(text)

    print(f"Need to generate: {len(to_generate)} files")
    print(f"Already cached: {len(all_words) - len(to_generate)} files")

    if not to_generate:
        print("Nothing to generate!")
        return

    # Generate in batches
    BATCH_SIZE = 50
    generated = 0
    errors = 0

    for i in range(0, len(to_generate), BATCH_SIZE):
        batch = to_generate[i:i + BATCH_SIZE]
        tasks = []

        for text in batch:
            # Create filename: NNNN_hash.mp3
            h = hashlib.md5(text.encode('utf-8')).hexdigest()[:8]
            idx = len(manifest) + len(tasks)
            filename = f"{idx:04d}_{h}.mp3"
            filepath = os.path.join(AUDIO_DIR, filename)
            manifest[text] = filename
            tasks.append((text, filepath))

        # Generate batch concurrently
        for text, filepath in tasks:
            try:
                await generate_audio(text, filepath)
                generated += 1
            except Exception as e:
                errors += 1
                # Remove from manifest on error
                if text in manifest:
                    del manifest[text]
                if generated + errors <= 5:
                    print(f"  Error: {text}: {e}")

        # Save manifest after each batch
        with open(MANIFEST_PATH, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, ensure_ascii=False, indent=1)

        pct = min(100, round((i + len(batch)) / len(to_generate) * 100))
        print(f"  Progress: {pct}% ({generated} generated, {errors} errors)")

    print(f"\nDone! Generated {generated} files, {errors} errors")
    print(f"Manifest entries: {len(manifest)}")

    # Report total file size
    total_size = 0
    for f in os.listdir(AUDIO_DIR):
        if f.endswith('.mp3'):
            total_size += os.path.getsize(os.path.join(AUDIO_DIR, f))
    print(f"Total audio size: {total_size / 1024 / 1024:.1f} MB")


if __name__ == '__main__':
    asyncio.run(main())
