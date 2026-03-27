#!/usr/bin/env python3
"""解析.xls文件，输出JSON。修复xlrd UTF-16LE解码问题。"""
import sys, json, codecs

# 终极方案：直接替换 codecs.utf_16_le_decode 函数
_orig_decode = codecs.utf_16_le_decode
def _safe_decode(input, errors='strict', final=False):
    try:
        return _orig_decode(input, errors, final)
    except UnicodeDecodeError:
        # 截断的字节，去掉最后一个不完整字节
        if len(input) % 2 != 0:
            input = input[:-1]
        return _orig_decode(input, 'replace', final)
codecs.utf_16_le_decode = _safe_decode

import xlrd

filepath = sys.argv[1]
book = xlrd.open_workbook(filepath, on_demand=True)
sheet = book.sheet_by_index(0)
headers = [str(sheet.cell_value(0, c)).strip() for c in range(sheet.ncols)]
rows = []
for r in range(1, sheet.nrows):
    row = {}
    for c in range(sheet.ncols):
        val = sheet.cell_value(r, c)
        if isinstance(val, float) and val == int(val):
            val = int(val)
        row[headers[c]] = val
    rows.append(row)
print(json.dumps(rows, ensure_ascii=False))
