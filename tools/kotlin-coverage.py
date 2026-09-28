#!/usr/bin/env python3
"""Extrait du rapport JaCoCo de Komga la couverture ligne par ligne de chaque fichier Kotlin.
Sortie : coverage-baseline/kotlin.json  { "<chemin kotlin>": {"covered": [..], "missed": [..], "partial": [..]} }
Usage : python3 tools/kotlin-coverage.py  (après `./gradlew :komga:test :komga:jacocoTestReport` avec rapport XML)"""
import json, os, sys, xml.etree.ElementTree as ET
root = os.path.join(os.path.dirname(__file__), '..')
up = os.path.join(root, 'upstream', 'komga')
xmlp = os.path.join(up, 'build/reports/jacoco/test/jacocoTestReport.xml')
out = {}
for pkg in ET.parse(xmlp).getroot().iter('package'):
    for sf in pkg.iter('sourcefile'):
        rel = None
        for base in ('src/main/kotlin', 'src/flyway/kotlin'):
            p = os.path.join(base, pkg.get('name'), sf.get('name'))
            if os.path.exists(os.path.join(up, p)):
                rel = 'komga/' + p
        if not rel:
            continue  # code généré (jOOQ…)
        cov, miss, part = [], [], []
        for l in sf.iter('line'):
            n, mi, ci, mb, cb = (int(l.get(k)) for k in ('nr', 'mi', 'ci', 'mb', 'cb'))
            if ci == 0: miss.append(n)
            else:
                cov.append(n)
                if mb > 0: part.append(n)
        out[rel] = {'covered': cov, 'missed': miss, 'partial': part}
json.dump(out, open(os.path.join(root, 'coverage-baseline', 'kotlin.json'), 'w'), indent=0)
c = sum(len(v['covered']) for v in out.values()); m = sum(len(v['missed']) for v in out.values())
p = sum(len(v['partial']) for v in out.values())
print(f'{len(out)} fichiers, lignes couvertes {c}/{c+m} = {100*c/(c+m):.1f}%, branches partielles sur {p} lignes')
if '-v' in sys.argv:
    agg = {}
    for k, v in out.items():
        pk = '/'.join(k.split('/')[7:9]) if 'main/kotlin' in k else 'flyway'
        a = agg.setdefault(pk, [0, 0]); a[0] += len(v['covered']); a[1] += len(v['missed'])
    for pk, (c, m) in sorted(agg.items(), key=lambda x: -x[1][1]):
        print(f'  {pk:32} {100*c/max(1,c+m):5.1f}%  non couvertes {m}')
    print('--- fichiers avec le plus de lignes non couvertes')
    for k, v in sorted(out.items(), key=lambda x: -len(x[1]['missed']))[:25]:
        t = len(v['covered']) + len(v['missed'])
        print(f"  {len(v['missed']):4}/{t:<4} {k.split('komga/')[-1]}")
