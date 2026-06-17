// ====================== HELPERS ======================
const $ = s => document.querySelector(s);

function setBox(sel, text, kind = "ok") {
  const el = document.querySelector(sel);
  if (!el) return;
  el.textContent = text;
  el.className = "msg " + (kind === "ok" ? "okbox" : kind === "warn" ? "warnbox" : "errbox");
  el.style.display = "block";
}

function hideBox(sel) {
  const el = document.querySelector(sel);
  if (el) {
    el.style.display = "none";
    el.textContent = "";
  }
}

function normalizeCPF(cpf) {
  return String(cpf || "").replace(/\D/g, "");
}

function getTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return String(params.get("token") || params.get("t") || "").trim();
}

function getCpfFromUrl() {
  if (window.__patientFormAccess?.cpf) return normalizeCPF(window.__patientFormAccess.cpf);

  const params = new URLSearchParams(window.location.search);
  let cpf = params.get("cpf");
  if (cpf) return normalizeCPF(cpf);

  const raw = window.location.search.replace("?", "").trim();
  if (/^\d{11}$/.test(raw)) return raw;

  return "";
}

function getTestCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("form") || params.get("code") || TEST_CODE_FIXO;
}

function redirectToAreaPaciente(cpf) {
  const token = getTokenFromUrl();
  if (token) {
    window.location.href = `${AREA_PACIENTE_URL}?token=${encodeURIComponent(token)}`;
    return;
  }

  const cpfDestino = normalizeCPF(cpf || getCpfFromUrl());
  window.location.href = cpfDestino ? `${AREA_PACIENTE_URL}?${cpfDestino}` : AREA_PACIENTE_URL;
}

function isObject(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}

function containsTestCode(jsonb, testCode) {
  if (!jsonb) return false;

  if (typeof jsonb === "string") return jsonb === testCode;

  if (Array.isArray(jsonb)) {
    return jsonb.some(item => {
      if (typeof item === "string") return item === testCode;
      if (isObject(item)) {
        return item.code === testCode || item.test_code === testCode || item.id === testCode || containsTestCode(item, testCode);
      }
      return false;
    });
  }

  if (isObject(jsonb)) {
    if (Object.prototype.hasOwnProperty.call(jsonb, testCode)) {
      const value = jsonb[testCode];
      if (value !== false && value !== null && value !== undefined) return true;
      return false;
    }

    if (jsonb.code === testCode || jsonb.test_code === testCode || jsonb.id === testCode) {
      return true;
    }

    return Object.values(jsonb).some(v => containsTestCode(v, testCode));
  }

  return false;
}

function isTestLiberado(testsLiberados, testCode) {
  if (!containsTestCode(testsLiberados, testCode)) return false;

  if (isObject(testsLiberados) && Object.prototype.hasOwnProperty.call(testsLiberados, testCode)) {
    const v = testsLiberados[testCode];
    if (typeof v === "boolean") return v;
    if (isObject(v) && "liberado" in v) return Boolean(v.liberado);
    if (typeof v === "string") return !["false", "0", "nao", "não"].includes(v.toLowerCase());
    return Boolean(v);
  }

  return true;
}

function isTestFeito(testsFeitos, testCode) {
  if (!containsTestCode(testsFeitos, testCode)) return false;

  if (isObject(testsFeitos) && Object.prototype.hasOwnProperty.call(testsFeitos, testCode)) {
    const v = testsFeitos[testCode];
    if (typeof v === "boolean") return v;
    if (isObject(v) && "feito" in v) return Boolean(v.feito);
    if (typeof v === "string") return !["false", "0", "nao", "não"].includes(v.toLowerCase());
    return Boolean(v);
  }

  return true;
}

function normalizeTestsFeitosForSave(current) {
  const out = {};

  if (!current) return out;

  if (typeof current === "string") {
    out[current] = { feito: true };
    return out;
  }

  if (Array.isArray(current)) {
    current.forEach(item => {
      if (typeof item === "string") {
        out[item] = { feito: true };
      } else if (isObject(item)) {
        const code = item.code || item.test_code || item.id;
        if (code) {
          out[code] = {
            ...item,
            feito: ("feito" in item) ? Boolean(item.feito) : true
          };
        }
      }
    });
    return out;
  }

  if (isObject(current)) {
    Object.entries(current).forEach(([key, value]) => {
      if (typeof value === "boolean") {
        out[key] = { feito: value };
      } else if (typeof value === "string") {
        out[key] = { feito: !["false", "0", "nao", "não"].includes(value.toLowerCase()) };
      } else if (isObject(value)) {
        out[key] = { ...value };
      } else {
        out[key] = { feito: Boolean(value) };
      }
    });
  }

  return out;
}

function buildUpdatedTestsFeitos(currentTestsFeitos, testCode, submittedAtIso) {
  const next = normalizeTestsFeitosForSave(currentTestsFeitos);

  next[testCode] = {
    ...(isObject(next[testCode]) ? next[testCode] : {}),
    feito: true,
    submitted_at: submittedAtIso
  };

  return next;
}

function dataURLToBlob(dataURL) {
  const parts = dataURL.split(",");
  const mime = parts[0].match(/:(.*?);/)[1];
  const binary = atob(parts[1]);
  const array = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }

  return new Blob([array], { type: mime });
}

function formatarTempoSegundos(totalSegundos) {
  totalSegundos = totalSegundos || 0;
  const min = Math.floor(totalSegundos / 60);
  const seg = totalSegundos % 60;
  if (min <= 0) return `${seg}s`;
  return `${min}min ${String(seg).padStart(2, "0")}s`;
}

// ====================== SUPABASE ======================
const SUPABASE_URL = "https://ydypdeafbcdcamwigjuq.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_lg9teAniku65cd2dnZJvIQ_Zii0XneZ";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TEST_CODE_FIXO = "CUBOS_WAIS_III_V2";
const STORAGE_BUCKET = "test-images";
const AREA_PACIENTE_URL = "https://integradaneuropsicologia.github.io/area-do-paciente-v2/";

// ====================== ESTADO ======================
let patient = null;
let currentCPF = "";
let currentPatientName = "";
let resultsSent = false;

const areaLivre        = document.getElementById("areaLivre");
const referencia       = document.getElementById("referencia");
const resultado        = document.getElementById("resultado");
const faseInfoEl       = document.getElementById("faseInfo");
const cronometroEl     = document.getElementById("cronometro");
const pecasDisponiveis = document.getElementById("pecasDisponiveis");
const sendStatusEl     = document.getElementById("sendStatus");

let inicioFaseTimestamp = null;
let inicioTentativaTimestamp = null;

let faseAtual = 0;
let dragOffset = { x: 0, y: 0 };
let tentativaAtual = 0;
let tentativaNumeroNaFase = 1;
let resultadosFases = [];
let tempoRestante = 0;
let cronometroIntervalo = null;
let painelResumo = null;
let temposFases = [];

// ====================== DEFINIÇÃO DAS FASES ======================
const tentativasPorFase = [2,2,2,2,2,2,1,1,1,1,1,1,1,1];
const tempoPorFase      = [30,30,30,30,60,60,60,60,60,120,120,130,130,150];

const fases = [
  [
    { tipo: 'vermelha',  x: 0,  y: 0,  rot: 0 },
    { tipo: 'vermelha',  x: 70, y: 0,  rot: 0 },
  ],
  [
    { tipo: 'branca',  x: 0,  y: 0,  rot: 0 },
    { tipo: 'vermelha',  x: 70, y: 0,  rot: 0 },
  ],
  [
    { tipo: 'branca',  x: 0,  y: 0,  rot: 0 },
    { tipo: 'branca',  x: 70, y: 0,  rot: 0 },
    { tipo: 'branca',  x: 0,  y: 70, rot: 0 },
    { tipo: 'dividida', x: 70, y: 70, rot: 180 }
  ],
  [
    { tipo: 'vermelha', x: 0,  y: 0,  rot: 0 },
    { tipo: 'branca',   x: 70, y: 0,  rot: 0 },
    { tipo: 'branca',   x: 0,  y: 70, rot: 0 },
    { tipo: 'vermelha', x: 70, y: 70, rot: 0 }
  ],
  [
    { tipo: 'vermelha', x: 0,  y: 0,  rot: 0 },
    { tipo: 'vermelha', x: 70, y: 0,  rot: 0 },
    { tipo: 'dividida', x: 0,  y: 70, rot: 180 },
    { tipo: 'branca',   x: 70, y: 70, rot: 0 }
  ],
  [
    { tipo: 'vermelha', x: 0,  y: 0,  rot: 0 },
    { tipo: 'vermelha', x: 70, y: 0,  rot: 0 },
    { tipo: 'dividida', x: 0,  y: 70, rot: 90 },
    { tipo: 'dividida', x: 70, y: 70, rot: 0 }
  ],
  [
    { tipo: 'branca',   x: 0,  y: 0,  rot: 0 },
    { tipo: 'dividida', x: 70, y: 0,  rot: 270 },
    { tipo: 'dividida', x: 0,  y: 70, rot: 90 },
    { tipo: 'branca',   x: 70, y: 70, rot: 0 }
  ],
  [
    { tipo: 'dividida', x: 0,  y: 0,  rot: 180 },
    { tipo: 'vermelha', x: 70, y: 0,  rot: 0 },
    { tipo: 'vermelha', x: 0,  y: 70, rot: 0 },
    { tipo: 'dividida', x: 70, y: 70, rot: 0 }
  ],
  [
    { tipo: 'dividida', x: 0,  y: 0,  rot: 180 },
    { tipo: 'dividida', x: 70, y: 0,  rot: 270 },
    { tipo: 'dividida', x: 0,  y: 70, rot: 0 },
    { tipo: 'dividida', x: 70, y: 70, rot: 90 }
  ],
  [
    { tipo: 'dividida', x: 0,   y: 0,   rot: 270 },
    { tipo: 'branca',   x: 70,  y: 0,   rot: 0 },
    { tipo: 'dividida', x: 140, y: 0,   rot: 0 },
    { tipo: 'branca',   x: 0,   y: 70,  rot: 0 },
    { tipo: 'vermelha', x: 70,  y: 70,  rot: 0 },
    { tipo: 'branca',   x: 140, y: 70,  rot: 0 },
    { tipo: 'dividida', x: 0,   y: 140, rot: 180 },
    { tipo: 'branca',   x: 70,  y: 140, rot: 0 },
    { tipo: 'dividida', x: 140, y: 140, rot: 90 }
  ],
  [
    { tipo: 'dividida', x: 0,   y: 0,   rot: 90 },
    { tipo: 'dividida', x: 70,  y: 0,   rot: 270 },
    { tipo: 'dividida', x: 140, y: 0,   rot: 90 },
    { tipo: 'dividida', x: 0,   y: 70,  rot: 270 },
    { tipo: 'dividida', x: 70,  y: 70,  rot: 90 },
    { tipo: 'dividida', x: 140, y: 70,  rot: 270 },
    { tipo: 'dividida', x: 0,   y: 140, rot: 90 },
    { tipo: 'dividida', x: 70,  y: 140, rot: 270 },
    { tipo: 'dividida', x: 140, y: 140, rot: 90 }
  ],
  [
    { tipo: 'dividida', x: 0,   y: 0,   rot: 270 },
    { tipo: 'dividida', x: 70,  y: 0,   rot: 90 },
    { tipo: 'dividida', x: 140, y: 0,   rot: 0 },
    { tipo: 'dividida', x: 0,   y: 70,  rot: 90 },
    { tipo: 'dividida', x: 70,  y: 70,  rot: 270 },
    { tipo: 'dividida', x: 140, y: 70,  rot: 180 },
    { tipo: 'dividida', x: 0,   y: 140, rot: 180 },
    { tipo: 'dividida', x: 70,  y: 140, rot: 0 },
    { tipo: 'dividida', x: 140, y: 140, rot: 90 }
  ],
  {
    rotacionarReferencia: true,
    pecas: [
      { tipo: 'dividida', x: 0, y: 0, rot: 0 },
      { tipo: 'branca',   x: 70, y: 0, rot: 0 },
      { tipo: 'dividida', x: 140, y: 0, rot: 270 },
      { tipo: 'branca',   x: 0, y: 70, rot: 0 },
      { tipo: 'dividida', x: 70, y: 70, rot: 180 },
      { tipo: 'vermelha', x: 140, y: 70, rot: 0 },
      { tipo: 'dividida', x: 0, y: 140, rot: 90 },
      { tipo: 'vermelha', x: 70, y: 140, rot: 0 },
      { tipo: 'dividida', x: 140, y: 140, rot: 0 }
    ]
  },
  {
    rotacionarReferencia: true,
    pecas: [
      { tipo: 'vermelha', x: 0, y: 0, rot: 0 },
      { tipo: 'dividida', x: 70, y: 0, rot: 180 },
      { tipo: 'dividida', x: 140, y: 0, rot: 270 },
      { tipo: 'dividida', x: 0, y: 70, rot: 180 },
      { tipo: 'branca',   x: 70, y: 70, rot: 0 },
      { tipo: 'vermelha', x: 140, y: 70, rot: 0 },
      { tipo: 'dividida', x: 0, y: 140, rot: 90 },
      { tipo: 'vermelha', x: 70, y: 140, rot: 0 },
      { tipo: 'vermelha', x: 140, y: 140, rot: 0 }
    ]
  }
];

// ====================== VALIDAÇÃO SUPABASE ======================
async function getPatientFormAccessByToken() {
  const token = getTokenFromUrl();
  const testCode = getTestCodeFromUrl();

  if (!token || !testCode) {
    return { data: null, error: new Error("Link inválido ou formulário não informado.") };
  }

  if (window.__patientFormAccess && window.__patientFormAccess.form_code === testCode) {
    return { data: window.__patientFormAccess, error: null };
  }

  if (!window.__patientFormAccessPromise) {
    window.__patientFormAccessPromise = supabaseClient
      .rpc("get_public_patient_form_access", {
        p_token: token,
        p_form_code: testCode
      })
      .then(({ data, error }) => {
        if (error) return { data: null, error };
        const row = Array.isArray(data) ? data[0] : data;
        window.__patientFormAccess = row || null;
        return { data: row || null, error: null };
      });
  }

  return window.__patientFormAccessPromise;
}

function installPatientTokenAccessShim() {
  if (!supabaseClient || supabaseClient.__patientTokenAccessShim) return;

  const originalFrom = supabaseClient.from.bind(supabaseClient);

  supabaseClient.from = function(table) {
    if (table !== "patients") return originalFrom(table);

    const selectBuilder = {
      select() { return this; },
      eq() { return this; },
      in() { return this; },
      limit() { return this; },
      order() { return this; },
      maybeSingle() { return getPatientFormAccessByToken(); },
      single() { return getPatientFormAccessByToken(); },
      async then(resolve, reject) {
        try {
          const result = await getPatientFormAccessByToken();
          return resolve(result);
        } catch (err) {
          if (reject) return reject(err);
          throw err;
        }
      }
    };

    return {
      select() { return selectBuilder; },
      update() {
        return {
          eq: async () => ({ data: null, error: null })
        };
      }
    };
  };

  supabaseClient.__patientTokenAccessShim = true;
}

async function validarAcessoAoTeste() {
  const cpf = getCpfFromUrl();
  const token = getTokenFromUrl();
  const testCode = getTestCodeFromUrl();

  let data = null;
  let error = null;

  if (token) {
    installPatientTokenAccessShim();
    ({ data, error } = await getPatientFormAccessByToken());
  } else {
    if (!cpf || cpf.length !== 11) {
      throw new Error("CPF inválido ou ausente na URL.");
    }

    ({ data, error } = await supabaseClient
      .from("patients")
      .select("cpf, nome, tests_liberados, tests_feitos")
      .eq("cpf", cpf)
      .maybeSingle());
  }

  if (error) {
    console.error(error);
    throw new Error("Erro ao consultar a base de dados.");
  }

  if (!data) {
    throw new Error("CPF não encontrado.");
  }

  const liberado = isTestLiberado(data.tests_liberados, testCode);
  if (!liberado) {
    throw new Error("Teste não liberado.");
  }

  const feito = isTestFeito(data.tests_feitos, testCode);
  if (feito) {
    redirectToAreaPaciente(data.cpf || cpf);
    return null;
  }

  return data;
}

// ====================== SNAPSHOTS ======================
function garantirPainelResumo() {
  if (painelResumo) return painelResumo;

  painelResumo = document.createElement("div");
  painelResumo.id = "painelResumoFases";
  painelResumo.style.position = "absolute";
  painelResumo.style.left = "-9999px";
  painelResumo.style.top = "0";
  painelResumo.style.width = "900px";
  painelResumo.style.background = "#ffffff";
  painelResumo.style.color = "#000000";
  painelResumo.style.padding = "16px";
  painelResumo.style.boxSizing = "border-box";
  painelResumo.style.fontFamily = "'Segoe UI', sans-serif";

  const titulo = document.createElement("h2");
  titulo.textContent = "Montagem Livre - Resumo";
  titulo.style.margin = "0 0 16px 0";
  painelResumo.appendChild(titulo);

  document.body.appendChild(painelResumo);
  return painelResumo;
}

function criarCardSnapshotRotulado(labelTexto) {
  const painel = garantirPainelResumo();

  const card = document.createElement("div");
  card.style.display = "flex";
  card.style.alignItems = "center";
  card.style.gap = "16px";
  card.style.marginBottom = "12px";
  card.style.border = "1px solid #ddd";
  card.style.borderRadius = "8px";
  card.style.padding = "8px 10px";
  card.style.background = "#fafafa";

  const info = document.createElement("div");
  info.style.fontSize = "14px";
  info.style.fontWeight = "700";
  info.textContent = labelTexto;
  card.appendChild(info);

  const mini = document.createElement("div");
  mini.style.position = "relative";
  mini.style.width = areaLivre.clientWidth + "px";
  mini.style.height = areaLivre.clientHeight + "px";
  mini.style.background = "#000";
  mini.style.border = "1px solid #ccc";
  mini.style.overflow = "hidden";
  mini.style.flexShrink = "0";

  const pecas = Array.from(areaLivre.querySelectorAll(".peca"));
  pecas.forEach(orig => {
    const clone = orig.cloneNode(true);
    clone.style.position = "absolute";
    mini.appendChild(clone);
  });

  card.appendChild(mini);
  painel.appendChild(card);
  return card;
}

function registrarFaseSnapshot(faseIndex, tempoGastoSegundos, statusFase = "") {
  const faseNumero = faseIndex + 1;
  const tempoFmt = formatarTempoSegundos(tempoGastoSegundos || 0);
  const statusTxt = statusFase ? ` — ${String(statusFase).toUpperCase()}` : "";
  criarCardSnapshotRotulado(`Fase ${faseNumero} — Final${statusTxt} — Tempo fase: ${tempoFmt}`);
  temposFases[faseIndex] = tempoGastoSegundos || 0;
}

function registrarTentativaSnapshot(faseIndex, tentativaNumero, tipo, tempoTentativaSeg, tempoFaseSeg) {
  const faseNumero = faseIndex + 1;
  const tTent = formatarTempoSegundos(tempoTentativaSeg || 0);
  const tFase = formatarTempoSegundos(tempoFaseSeg || 0);
  const tipoTxt = String(tipo || "").toUpperCase();
  criarCardSnapshotRotulado(`Fase ${faseNumero} — Tentativa ${tentativaNumero} — ${tipoTxt} — Tempo tentativa: ${tTent} (fase: ${tFase})`);
}

// ====================== RESULTADOS SEM PONTUAÇÃO ======================
function registrarResultadoDaFase(faseIndex, status, tentativasFalhas, tempoGastoSegundos) {
  if (!Array.isArray(resultadosFases)) resultadosFases = [];
  resultadosFases[faseIndex] = {
    fase: faseIndex + 1,
    status: String(status || ""),
    tentativas_falhas: Number(tentativasFalhas || 0),
    tempo_segundos: Number(tempoGastoSegundos || 0)
  };
}

function calcularTempoTotal() {
  return (temposFases || []).reduce((a, b) => a + (+b || 0), 0);
}

// ====================== STORAGE ======================
function buildImagePath(cpf, testCode, submittedAt) {
  const stamp = submittedAt.replace(/[:.]/g, "-");
  return `${cpf}/${testCode}/${stamp}.png`;
}

async function uploadCombinedImageToSupabase(cpf, testCode, submittedAt) {
  const painel = garantirPainelResumo();

  const canvas = await html2canvas(painel, {
    useCORS: true,
    backgroundColor: "#ffffff",
    scale: 2
  });

  const dataUrl = canvas.toDataURL("image/png");
  const blob = dataURLToBlob(dataUrl);
  const imagePath = buildImagePath(cpf, testCode, submittedAt);

  const { error: uploadError } = await supabaseClient
    .storage
    .from(STORAGE_BUCKET)
    .upload(imagePath, blob, {
      contentType: "image/png",
      upsert: false
    });

  if (uploadError) {
    console.error(uploadError);
    throw new Error(`Erro ao enviar imagem ao Storage: ${uploadError.message}`);
  }

  const { data: publicData } = supabaseClient
    .storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(imagePath);

  return {
    imagePath,
    imageUrl: publicData?.publicUrl || null
  };
}

// ====================== FASES / REFERÊNCIA ======================
function ultimasDuasFases(index = faseAtual) {
  return index >= (fases.length - 2);
}

function adicionarBotaoGiro(pecaEl) {
  if (pecaEl.querySelector("span")) return;

  const botao = document.createElement("span");
  botao.textContent = "🔄";
  botao.style.position = "absolute";
  botao.style.top = "50%";
  botao.style.left = "50%";
  botao.style.transform = "translate(-50%, -50%)";
  botao.style.width = "26px";
  botao.style.height = "26px";
  botao.style.borderRadius = "999px";
  botao.style.background = "rgba(0,0,0,0.10)";
  botao.style.color = "rgba(255,255,255,0.6)";
  botao.style.display = "flex";
  botao.style.alignItems = "center";
  botao.style.justifyContent = "center";
  botao.style.fontSize = "1rem";
  botao.style.cursor = "pointer";
  botao.style.pointerEvents = "auto";
  botao.style.zIndex = "2";

  botao.addEventListener("mousedown", e => { e.stopPropagation(); e.preventDefault(); });
  botao.addEventListener("touchstart", e => { e.stopPropagation(); });

  botao.onclick = function (e) {
    e.stopPropagation();
    let anguloAtual = parseInt(pecaEl.getAttribute("data-rot") || 0);
    let novoAngulo = (anguloAtual + 45) % 360;
    pecaEl.style.transform = `rotate(${novoAngulo}deg)`;
    pecaEl.setAttribute("data-rot", novoAngulo);
  };

  pecaEl.appendChild(botao);
}

function montarReferencia() {
  referencia.innerHTML = "";

  const fase = fases[faseAtual];
  const posicoes = fase.pecas || fase;

  if (fase.rotacionarReferencia) {
    referencia.classList.add("rotacionado");
  } else {
    referencia.classList.remove("rotacionado");
  }

  const colunas = Math.max(...posicoes.map(p => p.x)) / 70 + 1;
  const linhas = Math.max(...posicoes.map(p => p.y)) / 70 + 1;
  referencia.style.gridTemplateColumns = `repeat(${colunas}, 70px)`;
  referencia.style.gridTemplateRows = `repeat(${linhas}, 70px)`;

  if (faseAtual >= 9) referencia.style.border = "none";
  else referencia.style.border = "1.5px solid black";

  posicoes.forEach(g => {
    const peca = document.createElement("div");
    peca.className = "peca " + g.tipo;
    peca.style.width = "71px";
    peca.style.height = "71px";

    if (g.tipo === "dividida") {
      peca.style.transform = `rotate(${g.rot}deg)`;
      peca.setAttribute("data-rot", g.rot);
    }

    referencia.appendChild(peca);
  });
}

function getLimitesDaFase(index = faseAtual) {
  const fase = fases[index];
  const posicoes = fase.pecas || fase;
  const total = posicoes.length;
  return { min: total, max: total };
}

function montarAreaLivre() {
  areaLivre.innerHTML = "";
  areaLivre.ondragover = e => e.preventDefault();

  areaLivre.ondrop = function (e) {
    e.preventDefault();

    const { max } = getLimitesDaFase();
    const pecasAtuais = areaLivre.querySelectorAll(".peca").length;

    if (pecasAtuais >= max) {
      if (resultado) {
        resultado.textContent = `⚠️ Você só pode usar ${max} peça(s) nesta fase.`;
      }
      return;
    }

    const tipoData = e.dataTransfer.getData("text");
    const partes = tipoData.split("_");
    const tipo = partes[0];
    const rot = partes[1] || 0;
    const areaRect = areaLivre.getBoundingClientRect();
    let offsetX = e.clientX - areaRect.left - dragOffset.x;
    let offsetY = e.clientY - areaRect.top - dragOffset.y;
    offsetX = Math.max(0, Math.min(offsetX, areaLivre.clientWidth - 70));
    offsetY = Math.max(0, Math.min(offsetY, areaLivre.clientHeight - 70));

    const novaPeca = document.createElement("div");
    novaPeca.className = "peca " + tipo;
    novaPeca.style.left = offsetX + "px";
    novaPeca.style.top = offsetY + "px";
    novaPeca.setAttribute("data-tipo", tipo);
    novaPeca.setAttribute("data-rot", rot);
    novaPeca.style.transform = `rotate(${rot}deg)`;

    ativarToqueMobile(novaPeca);
    enableMouseDrag(novaPeca);

    if (tipo === "dividida" || ultimasDuasFases()) {
      adicionarBotaoGiro(novaPeca);
    }

    areaLivre.appendChild(novaPeca);
  };
}

function atualizarFaseInfo() {
  if (faseInfoEl) {
    const { min } = getLimitesDaFase();
    faseInfoEl.textContent = `Fase ${faseAtual + 1} — use exatamente ${min} peça(s).`;
  }
}

function atualizarPecasDisponiveis() {
  pecasDisponiveis.innerHTML = "";
  const fase = fases[faseAtual];
  const tipos = fase.tiposDisponiveis || ["vermelha", "branca", "dividida"];

  tipos.forEach(tipo => {
    const peca = document.createElement("div");
    peca.className = "peca " + tipo;
    peca.setAttribute("data-tipo", tipo);
    peca.setAttribute("data-rot", "0");
    peca.setAttribute("draggable", "true");
    ativarToqueMobile(peca);

    peca.addEventListener("dragstart", function (e) {
      const tipo = this.getAttribute("data-tipo");
      const rot = this.getAttribute("data-rot") || "0";
      const rect = this.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;

      e.dataTransfer.setData("text", tipo + "_" + rot);

      const imagemFantasma = this.cloneNode(true);
      imagemFantasma.style.position = "absolute";
      imagemFantasma.style.top = "-1000px";
      imagemFantasma.style.transform = this.style.transform;
      document.body.appendChild(imagemFantasma);
      e.dataTransfer.setDragImage(imagemFantasma, dragOffset.x, dragOffset.y);

      setTimeout(() => {
        if (document.body.contains(imagemFantasma)) {
          document.body.removeChild(imagemFantasma);
        }
      }, 1);
    });

    pecasDisponiveis.appendChild(peca);
  });
}

// ====================== DRAG ======================
let mouseDraggingPiece = null;
let mouseDragOffsetX = 0;
let mouseDragOffsetY = 0;

function enableMouseDrag(peca) {
  peca.addEventListener("mousedown", function (e) {
    if (e.button !== 0) return;
    if (e.target.tagName === "SPAN") return;

    e.preventDefault();
    mouseDraggingPiece = peca;

    const rect = peca.getBoundingClientRect();
    mouseDragOffsetX = e.clientX - rect.left;
    mouseDragOffsetY = e.clientY - rect.top;

    peca.style.zIndex = 1000;
  });
}

function removeIfOutsideArea(peca) {
  if (!peca || peca.parentElement !== areaLivre) return false;

  const areaRect = areaLivre.getBoundingClientRect();
  const pieceRect = peca.getBoundingClientRect();

  const saiu =
    pieceRect.right < areaRect.left ||
    pieceRect.left > areaRect.right ||
    pieceRect.bottom < areaRect.top ||
    pieceRect.top > areaRect.bottom;

  if (saiu) {
    peca.remove();
    return true;
  }
  return false;
}

document.addEventListener("mousemove", function (e) {
  if (!mouseDraggingPiece) return;

  const areaRect = areaLivre.getBoundingClientRect();
  const x = e.clientX - areaRect.left - mouseDragOffsetX;
  const y = e.clientY - areaRect.top - mouseDragOffsetY;

  mouseDraggingPiece.style.position = "absolute";
  mouseDraggingPiece.style.left = x + "px";
  mouseDraggingPiece.style.top = y + "px";

  if (removeIfOutsideArea(mouseDraggingPiece)) {
    mouseDraggingPiece = null;
  }
});

document.addEventListener("mouseup", function () {
  if (!mouseDraggingPiece) return;
  if (document.body.contains(mouseDraggingPiece)) {
    mouseDraggingPiece.style.zIndex = 1;
  }
  mouseDraggingPiece = null;
});

function ativarToqueMobile(peca) {
  let offsetX, offsetY;

  peca.addEventListener("touchstart", function (e) {
    const touch = e.touches[0];
    const rect = peca.getBoundingClientRect();
    offsetX = touch.clientX - rect.left;
    offsetY = touch.clientY - rect.top;
    peca.style.zIndex = 1000;
  });

  peca.addEventListener("touchmove", function (e) {
    e.preventDefault();
    const touch = e.touches[0];
    const areaRect = areaLivre.getBoundingClientRect();
    const x = touch.clientX - areaRect.left - offsetX;
    const y = touch.clientY - areaRect.top - offsetY;

    peca.style.position = "absolute";
    peca.style.left = x + "px";
    peca.style.top = y + "px";

    if (removeIfOutsideArea(peca)) {
      peca.style.zIndex = 1;
    }
  });

  peca.addEventListener("touchend", function () {
    if (document.body.contains(peca)) {
      peca.style.zIndex = 1;
    }
  });
}

// ====================== FLUXO ======================
function moverInfosParaAbaixoDaReferencia() {
  const ref = document.getElementById("referencia");
  if (!ref) return;

  let wrap = document.getElementById("infoAbaixoReferencia");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "infoAbaixoReferencia";
    wrap.style.marginTop = "12px";
    wrap.style.display = "flex";
    wrap.style.flexDirection = "column";
    wrap.style.alignItems = "center";
    ref.insertAdjacentElement("afterend", wrap);
  }

  ["faseInfo", "cronometro", "resultado"].forEach(id => {
    const el = document.getElementById(id);
    if (el) wrap.appendChild(el);
  });
}

function iniciarContagemRegressiva() {
  inicioTentativaTimestamp = Date.now();

  const tempoTotal = tempoPorFase[faseAtual];
  tempoRestante = tempoTotal;
  if (cronometroEl) cronometroEl.textContent = `⏳ Tempo: ${tempoRestante}s`;

  cronometroIntervalo = setInterval(() => {
    tempoRestante--;
    if (cronometroEl) cronometroEl.textContent = `⏳ Tempo: ${tempoRestante}s`;

    if (tempoRestante <= 0) {
      clearInterval(cronometroIntervalo);
      resultado.textContent = "⏰ Tempo esgotado!";

      const tempoFase = inicioFaseTimestamp ? Math.floor((Date.now() - inicioFaseTimestamp) / 1000) : tempoTotal;
      proximaFase(tempoFase, "timeout", tentativaAtual);
    }
  }, 1000);
}

function iniciarFaseDireta() {
  montarReferencia();
  montarAreaLivre();
  atualizarFaseInfo();
  atualizarPecasDisponiveis();

  tentativaNumeroNaFase = 1;
  tentativaAtual = 0;
  inicioFaseTimestamp = Date.now();
  inicioTentativaTimestamp = null;

  iniciarContagemRegressiva();
}

function startGame() {
  const orient = document.getElementById("orientacoesInicial");
  if (orient) {
    orient.style.display = "none";
    moverInfosParaAbaixoDaReferencia();
  }

  const btnIniciar = document.getElementById("btnIniciar");
  if (btnIniciar) btnIniciar.style.display = "none";

  faseAtual = 0;
  resultadosFases = Array(fases.length).fill(null);
  tentativaAtual = 0;
  tentativaNumeroNaFase = 1;
  temposFases = [];

  inicioFaseTimestamp = Date.now();
  inicioTentativaTimestamp = null;

  if (painelResumo && painelResumo.parentNode) {
    painelResumo.parentNode.removeChild(painelResumo);
  }
  painelResumo = null;

  montarReferencia();
  referencia.classList.add("grande");
  montarAreaLivre();
  atualizarFaseInfo();
  atualizarPecasDisponiveis();
  iniciarContagemRegressiva();
}

function verificar() {
  const pecas = Array.from(areaLivre.querySelectorAll(".peca"));
  const { min, max } = getLimitesDaFase();

  if (pecas.length < min) {
    resultado.textContent = `⚠️ Faltam peças! Coloque ${min} peça(s).`;
    return;
  }

  if (pecas.length > max) {
    resultado.textContent = `⚠️ Peças demais! Use exatamente ${max} peça(s).`;
    return;
  }

  const fase = fases[faseAtual];
  const gabaritoOriginal = fase.pecas || fase;

  const agora = Date.now();
  const tempoGastoFase = inicioFaseTimestamp ? Math.floor((agora - inicioFaseTimestamp) / 1000) : 0;
  const tempoGastoTentativa = inicioTentativaTimestamp ? Math.floor((agora - inicioTentativaTimestamp) / 1000) : 0;

  const minX = Math.min(...pecas.map(p => parseInt(p.style.left)));
  const minY = Math.min(...pecas.map(p => parseInt(p.style.top)));

  const usuario = pecas.map(p => ({
    tipo: p.getAttribute("data-tipo"),
    x: Math.round(parseFloat(p.style.left)) - minX,
    y: Math.round(parseFloat(p.style.top)) - minY,
    rot: parseInt(p.getAttribute("data-rot") || 0)
  }));

  let gab = gabaritoOriginal.map(p => ({ ...p }));
  const gabMinX = Math.min(...gab.map(p => p.x));
  const gabMinY = Math.min(...gab.map(p => p.y));

  gab = gab.map(p => ({
    ...p,
    x: p.x - gabMinX,
    y: p.y - gabMinY
  }));

  const correto = gab.every(g =>
    usuario.some(p =>
      p.tipo === g.tipo &&
      Math.abs(p.x - g.x) <= 65 &&
      Math.abs(p.y - g.y) <= 65 &&
      (p.tipo !== "dividida" || (p.rot % 360) === (g.rot % 360))
    )
  );

  const temTentativasNaFase = (faseAtual < 6);
  const maxTentativas = tentativasPorFase[faseAtual] || 1;
  const podeTentarDeNovo = temTentativasNaFase && (tentativaNumeroNaFase < maxTentativas);

  if (correto) {
    if (temTentativasNaFase && tentativaNumeroNaFase > 1) {
      registrarTentativaSnapshot(faseAtual, tentativaNumeroNaFase, "acerto", tempoGastoTentativa, tempoGastoFase);
    }

    const tentativasFalhas = tentativaAtual;
    resultado.textContent = "";
    tentativaAtual = 0;
    proximaFase(tempoGastoFase, "ok", tentativasFalhas);
  } else {
    tentativaAtual++;

    if (podeTentarDeNovo) {
      registrarTentativaSnapshot(faseAtual, tentativaNumeroNaFase, "erro", tempoGastoTentativa, tempoGastoFase);
      resultado.textContent = "❌ Tente novamente.";
      clearInterval(cronometroIntervalo);

      tentativaNumeroNaFase += 1;
      iniciarContagemRegressiva();
    } else {
      if (temTentativasNaFase) {
        registrarTentativaSnapshot(faseAtual, tentativaNumeroNaFase, "erro_final", tempoGastoTentativa, tempoGastoFase);
      }

      const tentativasFalhas = tentativaAtual;
      tentativaAtual = 0;
      resultado.textContent = "";
      proximaFase(tempoGastoFase, "fail", tentativasFalhas);
    }
  }
}

function proximaFase(tempoGastoSegundos = 0, statusFase = "next", tentativasFalhas = 0) {
  clearInterval(cronometroIntervalo);

  registrarFaseSnapshot(faseAtual, tempoGastoSegundos, statusFase);
  registrarResultadoDaFase(faseAtual, statusFase, tentativasFalhas, tempoGastoSegundos);

  faseAtual++;

  if (faseAtual >= fases.length) {
    const btnVerificar = document.getElementById("btnVerificar");
    if (btnVerificar) {
      btnVerificar.removeEventListener("click", verificar);
      btnVerificar.disabled = true;
      btnVerificar.textContent = "Aguarde...";
    }

    if (resultado) {
      resultado.textContent = "Aguarde, finalizando o teste...";
    }

    enviarResultados();
    return;
  }

  resultado.textContent = "";
  tentativaAtual = 0;
  tentativaNumeroNaFase = 1;
  inicioTentativaTimestamp = null;

  iniciarFaseDireta();
}

// ====================== ENVIO FINAL ======================
async function enviarResultados() {
  const btnVerificar = document.getElementById("btnVerificar");

  try {
    if (resultsSent) return;

    const cpf = normalizeCPF(currentCPF || patient?.cpf || getCpfFromUrl());
    const token = getTokenFromUrl();
    if (token) installPatientTokenAccessShim();
    const testCode = getTestCodeFromUrl();
    const submittedAt = new Date().toISOString();

    if (!cpf) throw new Error("CPF inválido.");
    if (!patient) throw new Error("Sessão inválida.");

    if (btnVerificar) {
      btnVerificar.disabled = true;
      btnVerificar.textContent = "Enviando...";
    }

    hideBox("#alert");
    if (sendStatusEl) sendStatusEl.textContent = "Enviando imagem ao Storage...";

    const uploadResult = await uploadCombinedImageToSupabase(cpf, testCode, submittedAt);
    if (!uploadResult.imageUrl) {
      throw new Error("Não foi possível gerar o link público da imagem.");
    }

    if (sendStatusEl) sendStatusEl.textContent = "Salvando resposta...";

    const { error: insertError } = await supabaseClient
      .from("respostas")
      .insert([{
        cpf: cpf,
        code: testCode,
        submitted_at: submittedAt,
        results_meta: {
          image_url: uploadResult.imageUrl
        }
      }]);

    if (insertError) {
      console.error(insertError);
      throw new Error(`Erro ao salvar respostas: ${insertError.message}`);
    }

    const nextTestsFeitos = buildUpdatedTestsFeitos(
      patient.tests_feitos,
      testCode,
      submittedAt
    );

    const { error: updateError } = await supabaseClient
      .from("patients")
      .update({
        tests_feitos: nextTestsFeitos
      })
      .eq("cpf", cpf);

    if (updateError) {
      console.error(updateError);
      throw new Error("Resposta salva, mas falhou ao marcar teste como feito.");
    }

    resultsSent = true;
    if (sendStatusEl) sendStatusEl.textContent = "Pronto! Redirecionando...";
    setBox("#alert", "Teste concluído com sucesso.", "ok");

    setTimeout(() => {
      redirectToAreaPaciente(cpf);
    }, 700);

  } catch (err) {
    console.error(err);

    if (sendStatusEl) {
      sendStatusEl.textContent = err.message || "Erro ao enviar.";
    }

    setBox("#alert", err.message || "Erro ao enviar.", "err");

    if (btnVerificar) {
      btnVerificar.disabled = false;
      btnVerificar.textContent = "Tentar enviar novamente";
      btnVerificar.onclick = enviarResultados;
    }

    resultsSent = false;
  }
}

// ====================== BOOT ======================
(async function boot() {
  try {
    const data = await validarAcessoAoTeste();
    if (!data) return;

    patient = data;
    currentCPF = normalizeCPF(data.cpf);
    currentPatientName = data.nome || "";

    hideBox("#alert");
    document.body.classList.add("ok");
    $("#container").style.display = "flex";

    montarReferencia();

    if (faseInfoEl) {
      faseInfoEl.textContent = "Fase 1";
    }

    if (cronometroEl) {
      cronometroEl.textContent = '⏳ O tempo começará após clicar em "Iniciar".';
    }

    if (resultado) {
      resultado.textContent = "";
    }

  } catch (err) {
    console.error(err);
    setBox("#alert", err.message || "Falha ao abrir o formulário.", "err");
  }
})();

// ====================== BOTÕES ======================
const btnVerificar = document.getElementById("btnVerificar");
if (btnVerificar) {
  btnVerificar.addEventListener("click", verificar);
}

const btnIniciar = document.getElementById("btnIniciar");
if (btnIniciar) {
  btnIniciar.addEventListener("click", () => {
    startGame();
  });
}
