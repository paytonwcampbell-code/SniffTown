import fitz
from pathlib import Path

source = Path('attached_assets/dog_off_leash_area_map_v5_1788811562889.pdf')
out_dir = Path('.agents/outputs/off-leash-map')
doc = fitz.open(source)
print(f'pages={doc.page_count}')
for index, page in enumerate(doc):
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    output = out_dir / f'page-{index + 1}.png'
    pix.save(output)
    text = page.get_text('text')
    (out_dir / f'page-{index + 1}.txt').write_text(text, encoding='utf-8')
    print(f'{output} size={page.rect.width}x{page.rect.height} text_chars={len(text)}')
