#!/usr/bin/env python3
"""Membuat rsrc_windows_amd64.syso (ikon, info versi, manifest) untuk build Go Windows.
Format: objek COFF AMD64 dengan satu section .rsrc + relokasi ADDR32NB."""
import struct, sys, io
from PIL import Image

ICON_SRC = sys.argv[1] if len(sys.argv) > 1 else '../web/icons/icon-512.png'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'rsrc_windows_amd64.syso'
ICO_OUT = sys.argv[3] if len(sys.argv) > 3 else 'klmcut.ico'
VER = (1, 0, 0, 0)

src = Image.open(ICON_SRC).convert('RGBA')
sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]

def dib(img):
    w, h = img.size
    px = img.tobytes('raw', 'BGRA')
    rows = [px[y * w * 4:(y + 1) * w * 4] for y in range(h)][::-1]
    mask_row = ((w + 31) // 32) * 4
    hdr = struct.pack('<IiiHHIIiiII', 40, w, h * 2, 1, 32, 0, w * h * 4 + mask_row * h, 0, 0, 0, 0)
    return hdr + b''.join(rows) + b'\0' * (mask_row * h)

icons = []
for s in sizes:
    im = src.resize((s, s), Image.LANCZOS)
    if s == 256:
        b = io.BytesIO(); im.save(b, 'PNG'); data = b.getvalue()
    else:
        data = dib(im)
    icons.append((s, data))

# file .ico (untuk pintasan / unduhan)
with open(ICO_OUT, 'wb') as f:
    f.write(struct.pack('<HHH', 0, 1, len(icons)))
    off = 6 + 16 * len(icons)
    for s, d in icons:
        f.write(struct.pack('<BBBBHHII', s % 256, s % 256, 0, 0, 1, 32, len(d), off)); off += len(d)
    for s, d in icons: f.write(d)

grp = struct.pack('<HHH', 0, 1, len(icons))
for i, (s, d) in enumerate(icons):
    grp += struct.pack('<BBBBHHIH', s % 256, s % 256, 0, 0, 1, 32, len(d), i + 1)

# ---- VS_VERSIONINFO ----
def pad4(b): return b + b'\0' * ((4 - len(b) % 4) % 4)
def wstr(s): return s.encode('utf-16-le') + b'\0\0'
def node(key, value=b'', wtype=1, children=(), vlen=None):
    body = pad4(struct.pack('<HHH', 0, 0, wtype) + wstr(key)) + value
    for c in children: body = pad4(body) + c
    if vlen is None: vlen = len(value) // 2 if wtype == 1 else len(value)
    return struct.pack('<HHH', len(body), vlen, wtype) + body[6:]
ms = (VER[0] << 16) | VER[1]; ls = (VER[2] << 16) | VER[3]
fixed = struct.pack('<IIIIIIIIIIIII', 0xFEEF04BD, 0x00010000, ms, ls, ms, ls, 0x3F, 0, 0x40004, 1, 0, 0, 0)
vs = '.'.join(map(str, VER))
strings = [('CompanyName', 'KLM'), ('FileDescription', 'KLM Cut - Editor Video'), ('FileVersion', vs), ('InternalName', 'KLM Cut'),
           ('LegalCopyright', 'KLM'), ('OriginalFilename', 'KLM-Cut.exe'), ('ProductName', 'KLM Cut'), ('ProductVersion', vs)]
st = [node(k, wstr(v), 1) for k, v in strings]
stable = node('040904B0', b'', 1, st, vlen=0)
sfi = node('StringFileInfo', b'', 1, [stable], vlen=0)
var = node('Translation', struct.pack('<HH', 0x0409, 0x04B0), 0, vlen=4)
vfi = node('VarFileInfo', b'', 1, [var], vlen=0)
version = node('VS_VERSION_INFO', fixed, 0, [sfi, vfi], vlen=len(fixed))

manifest = b'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <assemblyIdentity type="win32" name="KLM.Cut" version="1.0.0.0" processorArchitecture="amd64"/>
  <description>KLM Cut</description>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3"><security><requestedPrivileges><requestedExecutionLevel level="asInvoker" uiAccess="false"/></requestedPrivileges></security></trustInfo>
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1"><application><supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/><supportedOS Id="{1f676c76-80e1-4239-95bb-83d0f6d0da78}"/></application></compatibility>
  <application xmlns="urn:schemas-microsoft-com:asm.v3"><windowsSettings><dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/pm</dpiAware><dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2</dpiAwareness></windowsSettings></application>
</assembly>'''

# ---- pohon resource ----
LANG = 0x0409
types = {3: [(i + 1, d) for i, (s, d) in enumerate(icons)], 14: [(1, grp)], 16: [(1, version)], 24: [(1, manifest)]}
tids = sorted(types)
root_size = 16 + 8 * len(tids)
pos = root_size
type_dir_off = {}
for t in tids:
    type_dir_off[t] = pos; pos += 16 + 8 * len(types[t])
lang_dir_off = {}
for t in tids:
    for rid, _ in types[t]:
        lang_dir_off[(t, rid)] = pos; pos += 16 + 8
data_entry_off = {}
for t in tids:
    for rid, _ in types[t]:
        data_entry_off[(t, rid)] = pos; pos += 16
data_off = {}
for t in tids:
    for rid, d in types[t]:
        pos = (pos + 7) & ~7
        data_off[(t, rid)] = pos; pos += len(d)
sec = bytearray(pos)
def dirhdr(n): return struct.pack('<IIHHHH', 0, 0, 4, 0, 0, n)
o = 0
sec[o:o + 16] = dirhdr(len(tids)); o += 16
for t in tids:
    sec[o:o + 8] = struct.pack('<II', t, 0x80000000 | type_dir_off[t]); o += 8
relocs = []
for t in tids:
    o = type_dir_off[t]
    sec[o:o + 16] = dirhdr(len(types[t])); o += 16
    for rid, _ in types[t]:
        sec[o:o + 8] = struct.pack('<II', rid, 0x80000000 | lang_dir_off[(t, rid)]); o += 8
    for rid, d in types[t]:
        lo = lang_dir_off[(t, rid)]
        sec[lo:lo + 16] = dirhdr(1)
        sec[lo + 16:lo + 24] = struct.pack('<II', LANG, data_entry_off[(t, rid)])
        de = data_entry_off[(t, rid)]
        sec[de:de + 16] = struct.pack('<IIII', data_off[(t, rid)], len(d), 0, 0)
        relocs.append(de)
        sec[data_off[(t, rid)]:data_off[(t, rid)] + len(d)] = d
sec = bytes(sec)
while len(sec) % 4: sec += b'\0'

# ---- COFF ----
hdr_size = 20 + 40
raw_ptr = hdr_size
reloc_ptr = raw_ptr + len(sec)
sym_ptr = reloc_ptr + 10 * len(relocs)
coff = struct.pack('<HHIIIHH', 0x8664, 1, 0, sym_ptr, 1, 0, 0)
sect = struct.pack('<8sIIIIIIHHI', b'.rsrc\0\0\0', 0, 0, len(sec), raw_ptr, reloc_ptr, 0, len(relocs), 0, 0x40000040)
rel = b''.join(struct.pack('<IIH', r, 0, 3) for r in relocs)
sym = struct.pack('<8sIhHBB', b'.rsrc\0\0\0', 0, 1, 0, 3, 0)
strtab = struct.pack('<I', 4)
with open(OUT, 'wb') as f:
    f.write(coff + sect + sec + rel + sym + strtab)
print('ok', OUT, len(sec), 'bytes rsrc,', len(relocs), 'relokasi')
