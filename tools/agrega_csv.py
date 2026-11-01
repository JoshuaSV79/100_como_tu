#!/usr/bin/env python3
"""
Convierte el export grande del tablero del INE (Tabla General, una fila por sección x edad x sexo)
en `datos.js`, leyendo por bloques para no llenar la memoria.

Uso:
  python tools/agrega_csv.py "Tabla General_Full Data_data.csv" --out datos.js
  # con más de un archivo (por ejemplo, uno por elección):
  python tools/agrega_csv.py archivo2024.csv archivo2021.csv --out datos.js

Columnas que usa (por nombre): Año, Estado (o Nombre), Grupo quinquenal, Sexo, Sí votaron, No votaron
y, solo para verificar, Lista nominal y Población ind/afro.
Participación = Sí votaron / (Sí votaron + No votaron), definición del Manual CCPC 2009-2024.
No sube nada a ningún servidor.
"""
import argparse, hashlib, json, re, sys, unicodedata
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


def norm(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().upper()
    return re.sub(r'[^A-Z0-9 ]+', ' ', s).strip()


def ncol(s):
    return re.sub(r'\s+', '', norm(s)).lower()


ENT_POR_NOMBRE = {norm(n): c for c, n in ENTIDADES}
ENT_POR_NOMBRE.update({'MEXICO': '15', 'ESTADO DE MEXICO': '15', 'COAHUILA DE ZARAGOZA': '05',
                       'MICHOACAN DE OCAMPO': '16', 'VERACRUZ DE IGNACIO DE LA LLAVE': '30'})
SEXOS = {'HOMBRE': 'H', 'H': 'H', 'MUJER': 'M', 'M': 'M', 'NO BINARIO': 'NB', 'NB': 'NB'}


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def edad_g(v):
    m = re.search(r'\d+', str(v))
    if not m:
        return None
    b = int(m.group())
    if b < 18:
        return None
    if b < 20:
        return '18-19'
    if b >= 70:
        return '70+'
    lo = b // 5 * 5
    return f'{lo}-{lo + 4}'


def cabecera(path):
    for enc in ('utf-8-sig', 'latin-1'):
        try:
            cols = list(pd.read_csv(path, nrows=0, encoding=enc).columns)
            return cols, enc
        except UnicodeDecodeError:
            continue
    raise SystemExit('No pude leer la codificación del archivo.')


def encuentra(cols, *patrones, evita=()):
    for p in patrones:
        for c in cols:
            n = ncol(c)
            if re.fullmatch(p, n) and not any(e in n for e in evita):
                return c
    return None


def agrega(path):
    cols, enc = cabecera(path)
    c = {
        'año': encuentra(cols, r'ano', r'anio'),
        'ent': encuentra(cols, r'estado', r'nombre'),
        'edad': encuentra(cols, r'grupoquinquenal'),
        'sexo': encuentra(cols, r'sexo'),
        'si': encuentra(cols, r'sivotaron'),
        'no': encuentra(cols, r'novotaron'),
        'ln': encuentra(cols, r'listanominal'),
        'pob': encuentra(cols, r'poblacionind/?afro', r'poblacionindafro'),
    }
    falta = [k for k in ('año', 'ent', 'edad', 'sexo', 'si', 'no') if not c[k]]
    if falta:
        raise SystemExit(f'No encontré las columnas {falta}. Columnas del archivo: {cols}')
    usar = [v for v in c.values() if v]
    partes, filas = [], 0
    for ch in pd.read_csv(path, usecols=usar, dtype=str, encoding=enc, chunksize=1_000_000):
        filas += len(ch)
        d = pd.DataFrame({
            'a': ch[c['año']].str.strip(), 'ent': ch[c['ent']].str.strip(), 'edad': ch[c['edad']],
            's': ch[c['sexo']].str.strip(),
            'pob': ch[c['pob']].str.strip() if c['pob'] else 'n/d',
            'si': pd.to_numeric(ch[c['si']], errors='coerce').fillna(0),
            'no': pd.to_numeric(ch[c['no']], errors='coerce').fillna(0),
            'ln': pd.to_numeric(ch[c['ln']], errors='coerce').fillna(0) if c['ln'] else 0,
        })
        partes.append(d.groupby(['a', 'ent', 'edad', 's', 'pob'], as_index=False)[['si', 'no', 'ln']].sum())
        print(f'  … {filas:,} filas leídas', end='\r')
    print(f'  {filas:,} filas leídas.      ')
    return pd.concat(partes, ignore_index=True).groupby(['a', 'ent', 'edad', 's', 'pob'], as_index=False)[['si', 'no', 'ln']].sum()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('archivos', nargs='+', type=Path)
    ap.add_argument('--out', type=Path, default=Path('datos.js'))
    ap.add_argument('--agregado', type=Path, default=Path('agregado.csv'), help='Tabla pequeña intermedia (se puede entregar).')
    ap.add_argument('--corte', default='base cartográfica a mayo de 2023; base estática (Manual CCPC 2009-2024)')
    args = ap.parse_args()

    partes, fuentes = [], {}
    for p in args.archivos:
        print(f'Leyendo {p.name} …')
        t = agrega(p)
        años = sorted(t['a'].unique())
        print(f'  años en el archivo: {años}')
        for a in años:
            fuentes[str(a)] = {'archivo': p.name, 'sha256': sha256(p)}
        partes.append(t)
    t = pd.concat(partes, ignore_index=True)

    # Verificaciones antes de transformar
    print('\nVerificaciones:')
    print('  valores de «Población ind/afro» (si trae 2 valores y las cifras se duplican, lo veremos abajo):')
    print(t.groupby(['a', 'pob'])[['si', 'no']].sum().to_string())
    t['ln_calc'] = t['si'] + t['no']
    dif = (t['ln'] - t['ln_calc']).abs().sum()
    print(f'  Diferencia total entre «Lista nominal» y (Sí + No): {dif:,.0f} personas (debe ser 0 o casi 0)')

    t['e'] = t['ent'].map(lambda v: ENT_POR_NOMBRE.get(norm(v)))
    t['g'] = t['edad'].map(edad_g)
    t['sx'] = t['s'].map(lambda v: SEXOS.get(norm(v)))
    for col, nom in (('e', 'entidad'), ('sx', 'sexo')):
        malos = sorted(t.loc[t[col].isna(), {'e': 'ent', 'sx': 's'}[col]].astype(str).unique())
        if malos:
            raise SystemExit(f'Valores de {nom} sin reconocer: {malos[:15]}')
    t = t.dropna(subset=['g'])
    t['a'] = t['a'].astype(int)
    fuera = sorted(set(t['a']) - set(TIPOS))
    if fuera:
        raise SystemExit(f'Años no previstos: {fuera}. Agrégalos a TIPOS.')

    out = t.groupby(['a', 'e', 'g', 'sx'], as_index=False)[['si', 'no']].sum()
    out['ln'] = (out['si'] + out['no']).round().astype(int)
    out['v'] = out['si'].round().astype(int)
    assert (out['v'] <= out['ln']).all()
    out = out.sort_values(['a', 'e', 'g', 'sx'])
    out.rename(columns={'sx': 's'})[['a', 'e', 'g', 's', 'ln', 'v']].to_csv(args.agregado, index=False)

    print('\nParticipación nacional calculada (compárala con «Datos generales» del tablero del INE):')
    for a, r in out.groupby('a')[['v', 'ln']].sum().iterrows():
        print(f'  {a} ({TIPOS[a]}): {r.v / r.ln * 100:5.2f} %   [{int(r.v):,} de {int(r.ln):,}]')
    cob = out.groupby('a')['e'].nunique()
    if (cob != 32).any():
        print('AVISO: algún año no tiene las 32 entidades:', cob.to_dict())

    años = sorted(out['a'].unique())
    regs = [{'a': int(r.a), 'e': r.e, 'g': r.g, 's': r.sx, 'ln': int(r.ln), 'v': int(r.v)} for r in out.itertuples()]
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
    js = ('/* Generado por tools/agrega_csv.py a partir de las exportaciones oficiales del INE. No editar a mano.\n'
          '   Cada archivo fuente queda registrado en meta.archivos con su SHA-256. */\n'
          'window.CCPC_DATA = ' + json.dumps({
              'meta': meta, 'elecciones': [int(a) for a in años], 'tipos': {str(k): v for k, v in TIPOS.items() if k in años},
              'edades': EDADES, 'entidades': [{'clave': c_, 'nombre': n} for c_, n in ENTIDADES],
              'registros': '__REGS__'}, ensure_ascii=False, indent=1).replace(
              '"__REGS__"', '[\n' + ',\n'.join(json.dumps(r, separators=(',', ':')) for r in regs) + '\n]') + ';\n')
    args.out.write_text(js, encoding='utf-8')
    print(f'\nListo: {args.out} ({len(regs)} registros, {args.out.stat().st_size / 1e3:.0f} KB) y {args.agregado}.')


if __name__ == '__main__':
    main()
