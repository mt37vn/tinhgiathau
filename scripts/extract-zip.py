import zipfile
import os
import sys

zip_path = sys.argv[1]
extract_dir = sys.argv[2]

os.makedirs(extract_dir, exist_ok=True)

with zipfile.ZipFile(zip_path, 'r') as z:
    for info in z.infolist():
        name = info.filename
        if info.file_size == 0 and (name.endswith('/') or name.endswith('\\')):
            continue
        base = name.replace('\\', '/').split('/')[-1]
        target = os.path.join(extract_dir, base)
        data = z.read(info)
        with open(target, 'wb') as f:
            f.write(data)
        print(base)
