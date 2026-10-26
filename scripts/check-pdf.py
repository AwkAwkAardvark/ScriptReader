"""Optional independent PDF inspection. Requires PyMuPDF; reads synthetic test output only."""
from pathlib import Path
import json
import pymupdf

out = Path('.agent-local/previews/milestone-2')
results = {}
for name in ['staff-sample-bilingual', 'staff-sample-korean-interface', 'offline-demo', 'pagination-stress']:
    doc = pymupdf.open(out / (name + '.pdf'))
    pages = [page.get_text() for page in doc]
    text = ''.join(pages)
    for page in doc:
        assert abs(page.rect.width - 595.28) < 1 and abs(page.rect.height - 841.89) < 1, 'Expected A4 portrait'
        for word in page.get_text('words'):
            assert word[0] >= 38 and word[1] >= 38 and word[2] <= page.rect.width - 38 and word[3] <= page.rect.height - 38, (name, 'Text outside margins', word)
        assert page.get_text().strip(), 'Blank page'
    for forbidden in ['Open Script', 'Open Cast', 'Print / Save PDF', '대본 열기', '배역 목록 열기', '인쇄 / PDF 저장']:
        assert forbidden not in text, ('Control in print output', forbidden)
    if name == 'pagination-stress':
        assert 'ENTRY000' in pages[0], 'Oversized passage caused a nearly blank first page'
        locations = []
        for i in range(65):
            marker = f'ENTRY{i:03}'
            assert text.count(marker) == 1, ('Missing or duplicated entry', marker)
            location = next(j for j, page in enumerate(pages) if marker in page)
            locations.append(location)
            # Each fitting English/Korean entry stays together on one page.
            assert f'연습 문장 {i}.' in pages[location], ('Split translation', marker)
            assert f'ENDROW{i:03}' in pages[location], ('Split entry', marker)
            expected = f'{marker} A paper lantern lights the garden path. We follow the ticking through the workshop, past the fountain and up the stairs. ENDROW{i:03}'
            assert expected in ' '.join(pages[location].split()), ('Incomplete entry', marker)
        for i in range(130):
            assert text.count(f'TALL{i:03}') == 1, ('Oversized entry lost or duplicated text', i)
        assert locations == sorted(locations)
        assert 'FINAL_SENTINEL' in pages[-1] and '마지막 한국어 문장입니다.' in pages[-1]
        assert 'Oversized entry' in next(page for page in pages if 'TALL000' in page), 'Orphaned scene heading'
        assert len(doc) > 3
        for i in [0, 1, len(doc) - 1]:
            doc[i].get_pixmap(matrix=pymupdf.Matrix(1, 1)).save(out / f'stress-page-{i + 1}.png')
    else:
        assert len(doc) == 1, 'Fitting passage should stay on one page'
        assert 'Rowan Reed' in text and 'Mira Moss' in text
        assert '문이 열려 있어요.' in text and '종이 정원' in text
        assert text.count('The gate is open.') == 1 and text.count('A little time to wonder') == 1
        doc[0].get_pixmap(matrix=pymupdf.Matrix(1.3, 1.3)).save(out / (name + '.png'))
    results[name] = {'pages': len(doc), 'textComplete': True, 'withinMargins': True}
(out / 'pdf-results.json').write_text(json.dumps(results, indent=2))
print(json.dumps(results, indent=2))
