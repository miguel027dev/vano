from pathlib import Path

root = Path(__file__).resolve().parent
manifest = root / "DELETE_V330_FILES.txt"

if not (root / "app.py").exists():
    raise SystemExit("ERRO: execute este script na raiz do projeto VANO, onde fica app.py.")

files = [line.strip() for line in manifest.read_text(encoding="utf-8").splitlines() if line.strip()]
for rel in files:
    target = (root / rel).resolve()
    try:
        target.relative_to(root.resolve())
    except ValueError:
        raise SystemExit(f"Caminho invalido no manifest: {rel}")
    if target.is_file() or target.is_symlink():
        target.unlink()
        print(f"removido: {rel}")

# Remove only patch helper files; restored project files stay untouched.
for helper in ["DELETE_V330_FILES.txt", "REVERTER_PARA_VERSAO_ORIGINAL.txt"]:
    p = root / helper
    if p.exists():
        p.unlink()

print("Reversao concluida. Os arquivos do projeto voltaram para a versao original enviada.")
# Self-delete is intentionally skipped so the script can finish cleanly on all OSes.
