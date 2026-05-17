const fileInput = document.getElementById('fileInput');
const uploadZone = document.getElementById('uploadZone');
const uploadState = document.getElementById('uploadState');
const processingState = document.getElementById('processingState');
const resultsState = document.getElementById('resultsState');
const errBox = document.getElementById('errBox');

uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault(); uploadZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.type === 'application/pdf') processFile(f);
  else showErr('Please upload a PDF file.');
});
fileInput.addEventListener('change', () => { if (fileInput.files[0]) processFile(fileInput.files[0]); });

function setStage(n) { for (let i = 1; i <= 5; i++) 
  { const el = document.getElementById('ps' + i); 
    el.className = 'ps' + (i < n ? ' done' : i === n ? ' active' : ''); } }
function showErr(msg) {
  errBox.innerHTML = `
    <div style="text-align:center;padding:10px 0;">
      <div style="font-size:14px;color:#e8ecef;margin-bottom:8px;">
        🚧 Demo Currently Under Development
      </div>
      <div style="font-size:11px;color:#8a9099;line-height:1.7;">
        Our AI manufacturing engine is being configured for live deployment.<br>
        Please contact the TOOLROOM Ai team for a private walkthrough demo.
      </div>
    </div>
  `;

  errBox.classList.remove('hidden');
  processingState.classList.add('hidden');
}
function resetDemo() { uploadState.classList.remove('hidden'); processingState.classList.add('hidden'); resultsState.classList.add('hidden'); errBox.classList.add('hidden'); fileInput.value = ''; }

async function callAI(messages, max = 1000) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: max, messages })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.content.filter(b => b.type === 'text').map(b => b.text).join('');
}
function pj(t) { return JSON.parse(t.replace(/```json|```/g, '').trim()); }

async function processFile(file) {
  uploadState.classList.add('hidden');
  errBox.classList.add('hidden');
  processingState.classList.remove('hidden');
  resultsState.classList.add('hidden');
  setStage(1);
  document.getElementById('spinTxt').textContent = 'Reading PDF drawing…';

  let b64;
  try {
    b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = () => rej(new Error('Read failed')); r.readAsDataURL(file); });
  } catch (e) { showErr('Could not read file: ' + e.message); return; }

  // Step 1: Extract specs
  setStage(2); document.getElementById('spinTxt').textContent = 'Extracting part specifications…';
  let specs;
  try {
    const txt = await callAI([{
      role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        {
          type: 'text', text: `You are an expert manufacturing engineer. Analyse this engineering drawing.
Return ONLY valid JSON, no markdown:
{"part_name":"string","part_number":"string or null","material":"string","material_type":"Forging or Rolled Round or Cast or Other","diameter_mm":number_or_null,"length_mm":number_or_null,"weight_kg":number_or_null,"surface_finish_Ra":"string or null","tolerance_class":"string or null","processes_required":["CNC Turning","Boring","VMC Milling","Heat Treatment","Cylindrical Grinding","EDM","Wire Cut","Keyway Cutting","Face Drilling","Slotting — list only what applies"],"notes":"string or null"}
Use null for unknowns. Infer processes from geometry and drawing callouts.`}
      ]
    }]);
    specs = pj(txt);
  } catch (e) { showErr('AI extraction failed: ' + e.message); return; }

  // Step 2: Route card
  setStage(3); document.getElementById('spinTxt').textContent = 'Generating process route card…';
  let route;
  try {
    const txt = await callAI([{
      role: 'user', content: `Manufacturing process engineer. Generate route card for this part:
${JSON.stringify(specs)}
Rules: Material Procurement first (Forging if dia≥250mm else Rolled Round) → CNC Turning → Boring (if bore) → VMC Milling (if flat/slot features) → Keyway Cutting (Outsource if no slotter) → Heat Treatment (if required) → Cylindrical Grinding (after HT) → EDM/Wire Cut (always Outsource) → Final Inspection.
Return ONLY JSON: {"route":[{"step":1,"operation":"name","machine":"machine type","location":"Inhouse or Outsource","note":"brief note"}]}`}]);
    route = pj(txt);
  } catch (e) { showErr('Route card generation failed: ' + e.message); return; }

  // Step 3: Supplier match
  setStage(4); document.getElementById('spinTxt').textContent = 'Matching toolroom suppliers…';
  let sups;
  try {
    const txt = await callAI([{
      role: 'user', content: `Procurement specialist, Delhi NCR manufacturing cluster.
Part: ${specs.part_name}, Material: ${specs.material} (${specs.material_type}), Processes needed: ${(specs.processes_required || []).join(', ')}, Dia: ${specs.diameter_mm}mm, Length: ${specs.length_mm}mm.
Generate 4 realistic MSME toolroom suppliers from Ghaziabad/Noida/Greater Noida/Gurugram. Use plausible varied Indian engineering firm names.
Return ONLY JSON: {"suppliers":[{"rank":1,"name":"firm name","location":"city","score":87,"processes":["process1","process2"],"rating":"EXCELLENT"}]}
Ratings: EXCELLENT(85+) GOOD(70-84) FAIR(55-69). Vary the scores realistically.`}], 800);
    sups = pj(txt);
  } catch (e) { showErr('Supplier matching failed: ' + e.message); return; }

  setStage(5); processingState.classList.add('hidden');

  // Render specs
  const fields = [['Part', specs.part_name], ['Part No.', specs.part_number], ['Material', specs.material], ['Type', specs.material_type], ['Diameter', specs.diameter_mm ? specs.diameter_mm + 'mm' : null], ['Length', specs.length_mm ? specs.length_mm + 'mm' : null], ['Weight', specs.weight_kg ? specs.weight_kg + 'kg' : null], ['Surface', specs.surface_finish_Ra ? 'Ra ' + specs.surface_finish_Ra : null], ['Tolerance', specs.tolerance_class], ['Processes', (specs.processes_required || []).join(', ') || null]];
  document.getElementById('specOut').innerHTML = fields.filter(([, v]) => v).map(([k, v]) => `<div class="srow"><span class="sk">${k}</span><span class="sv">${v}</span></div>`).join('');

  // Render route
  document.getElementById('routeOut').innerHTML = route.route.map(s => `<div class="ritem"><div class="rnum">${s.step}</div><div><div class="rop">${s.operation}<span class="bdg ${s.location === 'Inhouse' ? 'bin' : 'bout'}">${s.location}</span></div><div class="rdet">${s.machine}${s.note ? ' · ' + s.note : ''}</div></div></div>`).join('');

  // Render suppliers
  const stars = { 'EXCELLENT': '★★★★★', 'GOOD': '★★★★☆', 'FAIR': '★★★☆☆' };
  document.getElementById('supOut').innerHTML = sups.suppliers.map(s => `<div class="suprow"><div class="supinit">${s.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</div><div class="supinfo"><div class="supname">${s.name}</div><div class="suploc">${s.location} · ${(s.processes || []).slice(0, 3).join(', ')}</div></div><div style="text-align:right;"><div class="supscore">${s.score}</div><div class="suprat">${stars[s.rating] || '★★★☆☆'} ${s.rating}</div></div></div>`).join('');

  resultsState.classList.remove('hidden');
  // Scroll demo into view smoothly
  document.querySelector('.demo-card').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}