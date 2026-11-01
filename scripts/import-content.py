"""Import the two revised sheets. Usage: python -X utf8 scripts/import-content.py workbook.xlsx"""
import json
import re
import sys
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ns = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
with ZipFile(sys.argv[1]) as z:
    strings = [''.join(si.itertext()) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall(ns+'si')]
    rels = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
    sheets = {}
    for sheet in ET.fromstring(z.read('xl/workbook.xml')).find(ns+'sheets'):
        target = rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
        rows = []
        for row in ET.fromstring(z.read('xl/'+target)).findall('.//'+ns+'row'):
            cells = {}
            for c in row.findall(ns+'c'):
                v = c.find(ns+'v')
                value = v.text if v is not None else ''
                if c.attrib.get('t') == 's' and value: value = strings[int(value)]
                if c.attrib.get('t') == 'inlineStr': value = ''.join(c.find(ns+'is').itertext())
                if value: cells[re.sub(r'\d', '', c.attrib['r'])] = value.strip()
            if cells: rows.append(cells)
        sheets[sheet.attrib['name']] = rows

def slug(value):
    return re.sub(r'[^a-z0-9]+', '-', value.lower()).strip('-')

def video(lesson, name):
    base = f'/videos/{lesson}/{slug(name)}'
    return {'src': base+'.mp4', 'poster': base+'.webp'}

def join(*parts):
    return '\n\n'.join(p for p in parts if p)

fraud = {'id': 'lua-dao', 'title': 'Lừa đảo', 'category': 'online', 'topic': 'Nhận diện lừa đảo', 'theme': 'mint', 'icon': 'shield',
         'description': 'Một lời nhờ giúp ở trung tâm thương mại mở ra những tình huống bất ngờ. Em sẽ lựa chọn thế nào?',
         'duration': '5–10 phút', 'status': 'published', 'version': 20261101, 'startNode': 'Scene 1',
         'cover': '/videos/lua-dao/scene-1.webp', 'mediaNote': 'Đã có video cho toàn bộ các nhánh.', 'nodes': {}}
titles = {'Scene 1': 'Một lời nhờ giúp', 'Scene 2A': 'Cuộc gọi khẩn cấp', 'Scene 2B': 'Có thật là con không?',
          'Scene 2C': 'Kiểm tra bằng một kênh khác', 'Scene 4': 'Tin nhắn từ bạn thân', 'Scene 6': 'Khi người lạ gây áp lực', 'Scene 7': 'Giúp đỡ theo cách an toàn'}
points = {'1.1': 0, '1.2': 1, '1.3': 1, '1.4': 2, '2A.1': 0, '2A.2': 1, '2A.3': 2,
          '2B.1': 0, '2B.2': 2, '2C.1': 0, '2C.2': 2, '4.1': 0, '4.2': 2,
          '6.1': 0, '6.2': 0, '6.3': 1, '6.4': 2}
for row in sheets['Lừa đảo (revised)'][1:]:
    if row.get('A', '').startswith('MÀN HÌNH'):
        fraud['endHelp'] = row['B']
        continue
    if 'A' in row:
        node_id = row['A'].split(' (')[0]
        # C is dialogue. The learner-facing description only uses the situation/context in B.
        node = {'title': titles[node_id], 'text': row.get('B', ''), 'video': video('lua-dao', node_id), 'choices': []}
        fraud['nodes'][node_id] = node
        if node_id == 'Scene 7':
            node.update(kind='ending', analysis=row['F'], next=None)
            continue
    match = re.match(r'Option ([\w.]+):\s*(.*)', row.get('D', ''), re.S)
    if not match: continue
    choice_id, text = match.groups()
    target = row['E'].split(' (')[0]
    feedback = row.get('F', '')
    if target.startswith('END_'):
        fraud['nodes'][target] = {'title': 'Cùng nhìn lại lựa chọn', 'text': '', 'analysis': feedback,
                                  'video': video('lua-dao', target), 'choices': [], 'kind': 'ending', 'next': None}
        feedback = 'Cùng xem diễn biến tiếp theo và nhìn lại lựa chọn của mình nhé.'
    # Direction notes in the source are staging metadata, not learner-facing copy.
    feedback = re.sub(r'\((?:Hệ thống|Giáo viên)[^)]*\)', '', feedback).strip()
    node['choices'].append({'id': choice_id, 'text': text, 'points': points[choice_id],
                            'feedback': feedback or 'Lựa chọn đã được ghi nhận. Cùng xem câu chuyện tiếp theo nhé.',
                            'next': 'After 1.1' if choice_id == '1.1' else target})
fraud['nodes']['After 1.1'] = {'title': 'Sau lời nhờ giúp', 'text': 'Cùng theo dõi chuyện gì xảy ra sau đó.',
                              'video': video('lua-dao', 'sau option 1.1'), 'choices': [], 'kind': 'narrative', 'next': 'Scene 2A'}
# Correct an obvious subject typo without changing the outcome.
fraud['nodes']['END_4.1']['analysis'] = fraud['nodes']['END_4.1']['analysis'].replace('Người gửi tin chuyển tiền xong thì chặn cậu bạn.', 'Sau khi nhận được tiền, người gửi tin chặn cậu bạn.')
for ending in ['END_2B.1', 'END_2C.1']:
    fraud['nodes'][ending]['analysis'] = fraud['nodes'][ending]['analysis'].replace('Chưa an toàn (xem END_2A.1).', 'Chưa an toàn. Tiền đã chuyển và số điện thoại kia không liên lạc lại được. Mẹ đến TTTM thì thấy bạn vừa đi từ rạp chiếu phim ra, an toàn.')
fraud['nodes']['Scene 7']['text'] = fraud['nodes']['Scene 7']['text'].replace('Node Kết thúc (Cách làm tốt nhất):', 'Cách làm tốt nhất:')

bullying = {'id': 'bao-luc-hoc-duong', 'title': 'Bạo lực học đường', 'category': 'self', 'topic': 'Ứng xử với bạo lực mạng',
            'theme': 'lavender', 'icon': 'shield', 'description': 'Giữa áp lực của nhóm bạn, em sẽ làm gì để bảo vệ mình và ngăn một câu chuyện đi quá xa?',
            'duration': '5–10 phút', 'status': 'published', 'version': 20261101, 'startNode': 'C_01',
            'cover': '/videos/bao-luc-hoc-duong/c-01.webp', 'mediaNote': 'Một số cảnh đang chờ video; em vẫn có thể đọc tình huống và hoàn thành bài.', 'nodes': {}}
titles_b = {'C_01': 'Bài tập nhóm bị bỏ lỡ', 'C_02': 'Một câu chuyện trên mạng', 'C_03': 'Áp lực từ nhóm bạn',
            'C_04a': 'Có nên chia sẻ tin nhắn riêng?', 'C_04b': 'Khi số đông gây sức ép', 'C_05': 'Giữ vững lựa chọn của em'}
points_b = {'C_01': [0, 0], 'C_02': [0, 0], 'C_03': [0, 2], 'C_04a': [0, 2], 'C_04b': [0, 2], 'C_05': [0, 1, 2]}
for row in sheets['Bạo lực học đường (Revised)'][1:]:
    if 'A' in row:
        node_id = row['A']
        ending = node_id.startswith('END_')
        # D is dialogue. The learner-facing description only uses the situation/context in C.
        node = {'title': titles_b.get(node_id, 'Cùng nhìn lại lựa chọn'), 'text': row.get('C', ''),
                'video': video('bao-luc-hoc-duong', node_id) if node_id in ['C_01', 'C_02', 'C_03', 'C_04a'] else None, 'choices': []}
        bullying['nodes'][node_id] = node
        if ending:
            node.update(kind='ending', analysis=row.get('D', ''), next=None)
            continue
    if 'F' not in row: continue
    match = re.match(r'([A-C])\.\s*(.*)', row['E'], re.S)
    choice_id, text = match.groups()
    node['choices'].append({'id': choice_id, 'text': text, 'points': points_b[node_id][len(node['choices'])],
                            'feedback': 'Lựa chọn đã được ghi nhận. Cùng theo dõi diễn biến tiếp theo nhé.', 'next': row['F']})
for lesson in [fraud, bullying]:
    for node in lesson['nodes'].values():
        node.setdefault('kind', 'question')
        if node['kind'] == 'ending': node['help'] = lesson.get('endHelp', 'Nếu chuyện này khiến em lo lắng, hãy nói với bố mẹ hoặc thầy cô em tin tưởng. Em không phải tự xử lý một mình.')
    lesson.pop('endHelp', None)
(ROOT/'server/lessons.json').write_text(json.dumps([fraud, bullying], ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print('Imported two revised lessons; 18 fraud videos and 4 bullying videos mapped.')
