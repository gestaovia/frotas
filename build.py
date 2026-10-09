"""Gera dist/index.html (arquivo único) a partir de src/.
Uso: python3 build.py
A configuração pública (endereço do Supabase e chave publicável) vem de config.json.
Nunca coloque chaves secretas (service_role, sb_secret_..., token do Traccar) em config.json."""
import json, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / 'src'
ORDER = ['01-core.js', '02-logic.js', '03-shell.js', '04-driver.js', '05-manager.js', '07-calendar.js',
         '08-traccar.js', '09-docs.js', '10-pdf.js', '11-cloud.js', '06-modules.js']

cfg = json.loads((ROOT / 'config.json').read_text(encoding='utf-8'))
public = {'supabaseUrl': cfg.get('supabaseUrl', ''), 'supabaseKey': cfg.get('supabaseKey', '')}
key = public['supabaseKey']
# trava de segurança: só aceita chave publicável/anon
if key and not (key.startswith('sb_publishable_') or '"role":"anon"' in (lambda p: __import__('base64').urlsafe_b64decode(p + '=' * (-len(p) % 4)).decode('utf-8', 'ignore'))(key.split('.')[1] if key.count('.') == 2 else '')):
    sys.exit('ERRO: config.json deve conter apenas a chave PUBLICÁVEL (sb_publishable_...) ou anon. Nunca a service_role/secret.')

css = (SRC / 'styles.css').read_text(encoding='utf-8')
lcss = (ROOT / 'vendor' / 'leaflet.css').read_text(encoding='utf-8')
lcss = re.sub(r'/\*.*?\*/', '', lcss, flags=re.S)
lcss = re.sub(r'\n\s*\n', '\n', lcss)
bm = (SRC / 'basemap.json').read_text(encoding='utf-8')
js = '\n'.join((SRC / f).read_text(encoding='utf-8') for f in ORDER)

head = '''<title>gestaovia</title>
<meta name="description" content="Gestão visual de frota: posse por QR Code, checklists, mapa, calendário de manutenção e premiação.">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&family=Playfair+Display:wght@700&display=swap">
<script>try{var t=localStorage.getItem('vialink-theme');if(t==='dark'||t==='light')document.documentElement.dataset.theme=t}catch(e){}</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"></script>
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js"></script>
'''
body = (f'<style>\n{lcss}\n{css}\n</style>\n<div id="app"></div>\n'
        f'<script>window.VIALINK_CONFIG={json.dumps(public)};window.BASEMAP={bm};</script>\n'
        f'<script>\n"use strict";\n{js}\n</script>\n')
out = ROOT / 'dist'
out.mkdir(exist_ok=True)
(out / 'index.html').write_text('<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    '<meta name="theme-color" content="#F4EFE4">\n<meta name="color-scheme" content="light dark">\n' + head + '</head>\n<body>\n' + body + '</body>\n</html>\n', encoding='utf-8')
# versão de demonstração (sem servidor) para visualizar no Claude
demo_body = body.replace(f'window.VIALINK_CONFIG={json.dumps(public)};', 'window.VIALINK_CONFIG={};')
(out / 'demo.html').write_text(head + demo_body, encoding='utf-8')
print('dist/index.html', len(head + body), 'bytes')
