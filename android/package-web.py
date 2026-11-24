#!/usr/bin/env python3
"""Inclui a versão assinada no caminho usado pelo botão de download do site."""
import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('projeto', type=Path)
    parser.add_argument('apk', type=Path)
    parser.add_argument('saida', type=Path)
    args = parser.parse_args()
    projeto = args.projeto.resolve()
    with ZipFile(args.apk) as apk:
        obrigatorios = {'AndroidManifest.xml', 'classes.dex', 'assets/public/index.html'}
        if not obrigatorios.issubset(apk.namelist()) or apk.testzip() is not None:
            parser.error('Use um APK compilado e íntegro.')

    arquivos = [
        caminho for caminho in projeto.iterdir()
        if caminho.is_file() and caminho.suffix in ('.html', '.css', '.js', '.json', '.png', '.ico')
    ]
    for pasta in ('fonts', 'vendor', '.well-known', 'wellknown'):
        arquivos.extend(caminho for caminho in (projeto / pasta).rglob('*') if caminho.is_file())
    for nome in ('index.html', 'style.css', 'icon-192x192.png', 'vendor/supabase.js'):
        if not (projeto / nome).is_file():
            parser.error(f'Falta o recurso web {nome}.')

    args.saida.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(args.saida, 'w', ZIP_DEFLATED) as pacote:
        for caminho in sorted(arquivos):
            pacote.write(caminho, caminho.relative_to(projeto).as_posix())
        pacote.write(args.apk, 'downloads/Suiri-Empresa.apk', compress_type=ZIP_STORED)


if __name__ == '__main__':
    main()
