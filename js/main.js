// Boot: wires the model, viewport, tools and UI together.
import { App } from './app.js';
import { V } from './view.js';
import { bindKeys, run } from './commands.js';
import * as Op from './ops.js';
import { loadGeoLibs } from './bool.js';
import { loadFace } from './fonts.js';
import { renderObjects } from './render.js';
import { bindDrop, Store, deserialize } from './io.js';
import { Pick, FreePick, XForm, Zoom, Pan } from './tools/pick.js';
import * as D from './tools/draw.js';
import * as SH from './tools/shape.js';
import * as FXT from './tools/fx.js';
import { Text } from './tools/text.js';
import { buildShell, applyColor, TOOL_ICON } from './ui/shell.js';
import { bindPropbar } from './ui/propbar.js';
import { bindDockers } from './ui/dockers.js';
import './ui/dialogs.js';
import { buildStart } from './ui/start.js';
import { applyTheme } from './ui/theme.js';
import { loadScript, toast } from './util.js';

const tools = [Pick, FreePick, XForm, Zoom, Pan, SH.Shape, SH.Smooth, SH.Smear, SH.Twirl, SH.Attract, SH.Repel, SH.Roughen, SH.Crop, SH.Knife, SH.VSDel, SH.Eraser,
  D.Freehand, D.Line2, D.Bezier, D.Pen, D.BSpline, D.Polyline, D.Curve3, D.Smart, D.Media, D.Rect, D.Rect3, D.Ellipse, D.Ellipse3, D.Polygon, D.Star, D.CStar, D.Graph, D.Spiral, D.Shapes,
  Text, D.Table, D.DimPar, D.DimHV, D.DimAng, D.DimSeg, D.Leader, D.Conn,
  FXT.Shadow, FXT.Contour, FXT.Blend, FXT.Distort, FXT.Envelope, FXT.Extrude, FXT.Block, FXT.Transp, FXT.Eyedrop, FXT.AttrDrop, FXT.Bucket, FXT.IFill, FXT.SmartFill];
for (const t of tools) App.tools[t.id] = t;

App.ops = Op;
App.view = V;
App.ui.applyColor = applyColor;
App.ui.toolIcon = id => TOOL_ICON[id];
App.ui.renderTemp = o => { const r = renderObjects([o], { mode: 'export', units: App.doc?.units }); return `<defs>${r.defs}</defs>${r.body}`; };

function boot() {
  applyTheme();
  V.init();
  buildShell();
  bindPropbar();
  bindDockers();
  buildStart();
  bindKeys();
  bindDrop(document.getElementById('app'));
  App.setTool('pick');
  App.emit('doc');
  loadGeoLibs().then(() => App.render()).catch(() => toast('Pustaka geometri gagal dimuat — operasi pembentukan tidak tersedia', 'warn'));
  loadFace('Arial'); loadFace('Arial', 700);
  loadScript('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js').then(() => App.render()).catch(() => { });
  if (App.settings.startup === 'last') Store.list().then(async l => { if (l[0]) { const r = await Store.get(l[0].id); if (r) { const d = deserialize(r.data); d.id = r.id; d.name = r.name; App.openDoc(d); } } });
  addEventListener('resize', () => V.resize());
  // ?new opens a blank A4 immediately (handy for quick sketches / testing)
  const q = new URLSearchParams(location.search);
  if (q.has('new')) App.newDocument();
  if (q.has('tpl')) import('./templates.js').then(async ({ TEMPLATES }) => { const { finalizeDoc } = await import('./ui/start.js'); const t = TEMPLATES.find(x => x.id === q.get('tpl')); if (t) App.openDoc(await finalizeDoc(t.make())); });
  document.getElementById('boot')?.remove();
  window.AmatuDraw = { App, V, run };
}
boot();
