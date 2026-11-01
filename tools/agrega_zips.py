#!/usr/bin/env python3
"""
Genera `datos.js` con las seis elecciones (2009-2024) a partir de los ZIP oficiales del INE
(DatosAbiertos_DECEyEC_ConteosCensalesAAAA.zip), cada uno con 32 CSV (uno por entidad).

Uso (desde la carpeta del proyecto):
  python tools/agrega_zips.py "C:\\ruta\\carpeta_con_los_zip" --out datos.js

Lee cada CSV por bloques directamente del ZIP (no descomprime nada ni llena la memoria).
Columnas oficiales: AELEC (año), EDOCVE (clave de entidad), SEXO (0 hombres, 1 mujeres, 2 no binario),
EDAD (años), LN, SV (sí votaron), NV (no votaron), NS (no especificado).
Participación = SV / (SV + NV): definición del Manual CCPC 2009-2024.
Ignora los ZIP de Prisión Preventiva y Voto Anticipado (otra estructura).
No sube nada a ningún servidor.
"""
import argparse, hashlib, io, json, re, sys, zipfile
from datetime import date
from pathlib import Path

import pandas as pd

TIPOS = {2009: 'I', 2012: 'P', 2015: 'I', 2018: 'P', 2021: 'I', 2024: 'P'}
EDADES = ['18-19', '20-24', '25-29', '30-34', '35-39', '40-44', '45-49', '50-54', '55-59', '60-64', '65-69', '70+']
ENTIDADES = [
    ('01', 'Aguascalientes'), ('02', 'Baja California'), ('03', 'Baja California Sur'), ('04', 'Campeche'),
    ('05', 'Coahuila'), ('06', 'Colima'), ('07', 'Chiapas'), ('08', 'Chihuahua'), ('09', 'Ciudad de México'),
    ('10', 'Durango'), ('11', 'Guanajuato'), ('12', 'Guerrero'), ('13', 'Hidalgo'), ('14', 'Jalisco'),
    ('15', 'Estado de México'), ('16', 'Michoacán'), ('17', 'Morelos'), ('18', 'Nayarit'), ('19', 'Nuevo León'),
    ('20', 'Oaxaca'), ('21', 'Puebla'), ('22', 'Querétaro'), ('23', 'Quintana Roo'), ('24', 'San Luis Potosí'),
    ('25', 'Sinaloa'), ('26', 'Sonora'), ('27', 'Tabasco'), ('28', 'Tamaulipas'), ('29', 'Tlaxcala'),
    ('30', 'Veracruz'), ('31', 'Yucatán'), ('32', 'Zacatecas'),
]
USAR = ['AELEC', 'EDOCVE', 'SEXO', 'EDAD', 'LN', 'SV', 'NV', 'NS']
SEXO = {'0': 'H', '1': 'M', '2': 'NB'}


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def edad_g(b):
    if b < 18:
        return None
    if b < 20:
        return '18-19'
    if b >= 70:
        return '70+'
    lo = int(b) // 5 * 5
    return f'{lo}-{lo + 4}'


def lee_csv(z, nombre):
    """Devuelve un iterador de bloques con las columnas oficiales."""
    raw = z.open(nombre)
    cab = z.open(nombre).readline()
    for enc in ('utf-8-sig', 'latin-1'):
        try:
            cab.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    sep = ',' if cab.count(b',') >= cab.count(b'|') and cab.count(b',') >= cab.count(b';') else ('|' if cab.count(b'|') > cab.count(b';') else ';')
    return pd.read_csv(raw, sep=sep, usecols=USAR, dtype=str, encoding=enc, chunksize=500_000)


def procesa_zip(zp, año):
    partes, filas, vistos = [], 0, 0
    with zipfile.ZipFile(zp) as z:
        csvs = sorted(i.filename for i in z.infolist() if i.filename.lower().endswith('.csv'))
        if not csvs:
            raise SystemExit(f'{zp.name}: no trae CSV.')
        for k, nombre in enumerate(csvs, 1):
            for ch in lee_csv(z, nombre):
                filas += len(ch)
                d = pd.DataFrame({
                    'a': ch['AELEC'].str.strip(), 'ent': ch['EDOCVE'].str.strip(), 's': ch['SEXO'].str.strip(),
                    'edad': pd.to_numeric(ch['EDAD'], errors='coerce'),
                    'ln': pd.to_numeric(ch['LN'], errors='coerce').fillna(0),
                    'sv': pd.to_numeric(ch['SV'], errors='coerce').fillna(0),
                    'nv': pd.to_numeric(ch['NV'], errors='coerce').fillna(0),
                    'ns': pd.to_numeric(ch['NS'], errors='coerce').fillna(0),
                })
                d = d.dropna(subset=['edad'])
                d['g'] = d['edad'].map(edad_g)
                partes.append(d.groupby(['a', 'ent', 's', 'g'], as_index=False, dropna=False)[['ln', 'sv', 'nv', 'ns']].sum())
            print(f'  [{año}] {k}/{len(csvs)} archivos · {filas:,} filas', end='\r')
    print(f'  [{año}] {len(csvs)} archivos · {filas:,} filas.            ')
    t = pd.concat(partes, ignore_index=True)
    return t.groupby(['a', 'ent', 's', 'g'], as_index=False, dropna=False)[['ln', 'sv', 'nv', 'ns']].sum()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('carpeta', type=Path)
    ap.add_argument('--out', type=Path, default=Path('datos.js'))
    ap.add_argument('--agregado', type=Path, default=Path('agregado.csv'))
    ap.add_argument('--corte', default='base cartográfica a mayo de 2023; base estática (Manual CCPC 2009-2024)')
    args = ap.parse_args()

    zips = {}
    for p in sorted(args.carpeta.glob('*.zip')):
        m = re.search(r'ConteosCensales(20\d\d)\.zip$', p.name, re.I)
        if m and int(m.group(1)) in TIPOS:
            zips[int(m.group(1))] = p
    faltan = sorted(set(TIPOS) - set(zips))
    if faltan:
        print(f'AVISO: no encontré los ZIP de {faltan}. Se procesan solo: {sorted(zips)}')
    if not zips:
        raise SystemExit('No encontré ZIP con nombre ...ConteosCensalesAAAA.zip en esa carpeta.')

    frames, fuentes = [], {}
    for año in sorted(zips):
        print(f'Procesando {zips[año].name} …')
        t = procesa_zip(zips[año], año)
        if set(t['a'].dropna().unique()) != {str(año)}:
            print(f'  AVISO: AELEC trae {sorted(t["a"].dropna().unique())} en el ZIP de {año}.')
        t['año'] = año
        frames.append(t)
        fuentes[str(año)] = {'zip': zips[año].name, 'sha256': sha256(zips[año])}
    t = pd.concat(frames, ignore_index=True)

    t['e'] = t['ent'].map(lambda v: f'{int(float(v)):02d}' if pd.notna(v) and str(v).strip() else None)
    t['sx'] = t['s'].map(SEXO)
    malos = t.loc[t['e'].isna() | ~t['e'].isin([c for c, _ in ENTIDADES]), 'ent'].unique()
    if len(malos):
        raise SystemExit(f'Claves de entidad inesperadas: {list(malos)[:10]}')
    if t['sx'].isna().any():
        raise SystemExit(f'Valores de sexo inesperados: {sorted(t.loc[t.sx.isna(), "s"].astype(str).unique())}')

    print('\nVerificación de columnas (LN debe ser SV + NV + NS):')
    chk = t.groupby('año')[['ln', 'sv', 'nv', 'ns']].sum()
    for a, r in chk.iterrows():
        d = r.ln - (r.sv + r.nv + r.ns)
        print(f'  {a}: LN={int(r.ln):,}  SV+NV+NS={int(r.sv + r.nv + r.ns):,}  diferencia={int(d):,}  (NS={int(r.ns):,})')

    t = t.dropna(subset=['g'])
    out = t.groupby(['año', 'e', 'g', 'sx'], as_index=False)[['sv', 'nv']].sum()
    out['ln'] = (out['sv'] + out['nv']).round().astype(int)
    out['v'] = out['sv'].round().astype(int)
    assert (out['v'] <= out['ln']).all()
    out = out[out['ln'] > 0].sort_values(['año', 'e', 'g', 'sx'])
    out.rename(columns={'año': 'a', 'sx': 's'})[['a', 'e', 'g', 's', 'ln', 'v']].to_csv(args.agregado, index=False)

    print('\nParticipación nacional calculada (compárala con «Datos generales» del tablero del INE):')
    for a, r in out.groupby('año')[['v', 'ln']].sum().iterrows():
        print(f'  {a} ({TIPOS[a]}): {r.v / r.ln * 100:5.2f} %   [{int(r.v):,} de {int(r.ln):,}]')
    cob = out.groupby('año')['e'].nunique()
    if (cob != 32).any():
        print('AVISO: algún año no tiene las 32 entidades:', cob.to_dict())

    años = [int(a) for a in sorted(out['año'].unique())]
    regs = [{'a': int(r.año), 'e': r.e, 'g': r.g, 's': r.sx, 'ln': int(r.ln), 'v': int(r.v)} for r in out.itertuples()]
    meta = {
        'esEjemplo': False,
        'fuente': 'INE, Plataforma de los Conteos Censales de Participación Ciudadana (CCPC) 2009-2024',
        'corte': args.corte,
        'metrica': 'Participación = Sí votaron ÷ (Sí votaron + No votaron). Definición del Manual de los Conteos Censales 2009-2024 del INE; no usa la lista nominal como denominador.',
        'denominador': 'personas que sí o no votaron',
        'umbralMin': 50,
        'generado': date.today().isoformat(),
        'archivos': fuentes,
    }
    js = ('/* Generado por tools/agrega_zips.py a partir de los ZIP oficiales del INE. No editar a mano.\n'
          '   Cada archivo fuente queda registrado en meta.archivos con su SHA-256. */\n'
          'window.CCPC_DATA = ' + json.dumps({
              'meta': meta, 'elecciones': años, 'tipos': {str(k): v for k, v in TIPOS.items() if k in años},
              'edades': EDADES, 'entidades': [{'clave': c, 'nombre': n} for c, n in ENTIDADES],
              'registros': '__REGS__'}, ensure_ascii=False, indent=1).replace(
              '"__REGS__"', '[\n' + ',\n'.join(json.dumps(r, separators=(',', ':')) for r in regs) + '\n]') + ';\n')
    args.out.write_text(js, encoding='utf-8')
    print(f'\nListo: {args.out} ({len(regs)} registros, {args.out.stat().st_size / 1e3:.0f} KB) y {args.agregado}.')


if __name__ == '__main__':
    main()
