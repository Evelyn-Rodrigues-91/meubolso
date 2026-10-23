const SUPABASE_URL = "https://zxhomiwlmdgsetzveyzc.supabase.co";
const SUPABASE_CHAVE_PUBLICA = "sb_publishable_SoN61Y1FdGO533--uiflLQ_b8-4XXLg";
const MODELO = "gemini-3.5-flash-lite";
const CATEGORIAS_PADRAO = ["Combustível", "Estacionamento", "Supermercado", "Refeição", "Farmácia", "Outros"];
const MIMES = ["image/jpeg", "image/png", "image/webp"];
const LIMITE_IMAGEM = 4_000_000;

export const config = { path: "/api/assistente" };

class ErroAmigavel extends Error {
  constructor(frase, status = 500) {
    super(frase);
    this.status = status;
  }
}

const responder = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });

const brl = (n) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
const dataBr = (iso) => iso.split("-").reverse().join("/");
const ehData = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
const hojeSaoPaulo = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

// ---------- Supabase (sempre com o login da própria pessoa) ----------
function cabecalhosBanco(token, extra = {}) {
  return { apikey: SUPABASE_CHAVE_PUBLICA, Authorization: "Bearer " + token, ...extra };
}

async function erroDoBanco(r) {
  let corpo = {};
  try { corpo = await r.json(); } catch { /* sem corpo */ }
  const texto = JSON.stringify(corpo).toLowerCase();
  if (r.status === 401 || texto.includes("jwt")) {
    return new ErroAmigavel("Seu login venceu. Saia do app e entre de novo.", 401);
  }
  if (r.status === 404 || texto.includes("42p01") || texto.includes("pgrst205") || texto.includes("does not exist")) {
    return new ErroAmigavel("A tabela gastos não foi encontrada no Supabase. Confira se ela foi criada.", 500);
  }
  if (r.status === 403 || texto.includes("row-level security")) {
    return new ErroAmigavel("O banco não deixou gravar. Confira a proteção por linha da tabela gastos.", 403);
  }
  return new ErroAmigavel("Não deu para falar com o banco de dados. Tente de novo em instantes.", 502);
}

async function conferirLogin(token) {
  const r = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: cabecalhosBanco(token) });
  if (!r.ok) throw new ErroAmigavel("Seu login venceu. Saia do app e entre de novo.", 401);
  const u = await r.json();
  if (!u || !u.id) throw new ErroAmigavel("Seu login venceu. Saia do app e entre de novo.", 401);
  return u;
}

async function gravarGasto(token, usuario, gasto, origem) {
  const r = await fetch(SUPABASE_URL + "/rest/v1/gastos", {
    method: "POST",
    headers: cabecalhosBanco(token, { "Content-Type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({ dono: usuario.id, ...gasto, origem })
  });
  if (!r.ok) throw await erroDoBanco(r);
}

async function lerGastos(token, desde, ate, categoria) {
  const p = new URLSearchParams();
  p.set("select", "valor");
  p.append("data", "gte." + desde);
  p.append("data", "lte." + ate);
  if (categoria) p.set("categoria", "eq." + categoria);
  p.set("limit", "10000");
  const r = await fetch(SUPABASE_URL + "/rest/v1/gastos?" + p.toString(), { headers: cabecalhosBanco(token) });
  if (!r.ok) throw await erroDoBanco(r);
  return r.json();
}

// ---------- Gemini ----------
function montarSistema(hoje, categorias) {
  return [
    "Você é o assistente do app de gastos pessoais Meu Bolso. Responda sempre em português do Brasil, em frases curtas.",
    "A data de hoje em São Paulo é " + hoje + " (formato AAAA-MM-DD). Use-a para entender \"hoje\", \"ontem\", \"este mês\" e \"semana passada\".",
    "Categorias permitidas: " + categorias.join(", ") + ". Escolha a mais próxima; se nenhuma servir, use Outros.",
    "Se a pessoa descrever um gasto, chame registrar_gasto. Se perguntar quanto gastou, chame consultar_gastos.",
    "Se faltar o valor ou o gasto não estiver claro, não chame ferramenta: pergunte o que falta.",
    "Quando vier a foto de um cupom fiscal, use o VALOR TOTAL pago, a data de emissão e o nome da loja como descrição.",
    "Nunca calcule totais você mesmo: para somas, sempre chame consultar_gastos."
  ].join("\n");
}

function ferramentas(categorias) {
  return [{
    function_declarations: [
      {
        name: "registrar_gasto",
        description: "Lança um gasto novo.",
        parameters: {
          type: "OBJECT",
          properties: {
            data: { type: "STRING", description: "Data do gasto, AAAA-MM-DD." },
            descricao: { type: "STRING", description: "Onde ou com o quê foi o gasto." },
            valor: { type: "NUMBER", description: "Valor em reais, maior que zero." },
            categoria: { type: "STRING", enum: categorias }
          },
          required: ["data", "descricao", "valor", "categoria"]
        }
      },
      {
        name: "consultar_gastos",
        description: "Soma os gastos de um período, com filtro opcional de categoria.",
        parameters: {
          type: "OBJECT",
          properties: {
            desde: { type: "STRING", description: "Primeiro dia, AAAA-MM-DD." },
            ate: { type: "STRING", description: "Último dia, AAAA-MM-DD." },
            categoria: { type: "STRING", enum: categorias }
          },
          required: ["desde", "ate"]
        }
      }
    ]
  }];
}

async function perguntarAoGemini(chave, { mensagem, imagem, mime, categorias, hoje }) {
  const partes = [{ text: mensagem || "Lance o gasto deste cupom." }];
  if (imagem) partes.push({ inline_data: { mime_type: mime, data: imagem } });

  let r;
  try {
    r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + MODELO + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: montarSistema(hoje, categorias) }] },
        contents: [{ role: "user", parts: partes }],
        tools: ferramentas(categorias),
        tool_config: { function_calling_config: { mode: "AUTO" } }
      })
    });
  } catch {
    throw new ErroAmigavel("Não deu para falar com o assistente. Tente de novo em instantes.", 502);
  }

  if (r.status === 429) throw new ErroAmigavel("O limite de uso do assistente foi atingido. Espere um pouco e tente de novo.", 429);
  if (r.status === 401 || r.status === 403) throw new ErroAmigavel("A chave do assistente não foi aceita. Confira a CHAVE_GEMINI na Netlify.", 500);
  if (r.status === 404) throw new ErroAmigavel("O modelo do assistente não foi encontrado. Confira o nome do modelo na função.", 500);
  if (r.status === 400) {
    let texto = "";
    try { texto = JSON.stringify(await r.json()).toLowerCase(); } catch { /* sem corpo */ }
    if (texto.includes("api key")) throw new ErroAmigavel("A chave do assistente não foi aceita. Confira a CHAVE_GEMINI na Netlify.", 500);
    throw new ErroAmigavel("O assistente não entendeu o pedido. Tente escrever de outro jeito.", 400);
  }
  if (!r.ok) throw new ErroAmigavel("O assistente está fora do ar agora. Tente de novo em instantes.", 502);

  const j = await r.json();
  const lista = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
  const chamada = lista.find((p) => p.functionCall || p.function_call);
  if (chamada) {
    const f = chamada.functionCall || chamada.function_call;
    return { chamada: { nome: f.name, args: f.args || {} } };
  }
  const texto = lista.map((p) => p.text || "").join("").trim();
  return { texto: texto || "Não entendi. Pode dizer o valor e onde foi o gasto?" };
}

// ---------- Ações ----------
async function registrar(args, { token, usuario, categorias, imagem }) {
  const valor = Math.round(Number(args.valor) * 100) / 100;
  if (!isFinite(valor) || valor <= 0) return { resposta: "Não achei o valor. Quanto foi o gasto?", mudou: false };
  if (!ehData(args.data)) return { resposta: "Não entendi a data. Em que dia foi o gasto?", mudou: false };
  const categoria = categorias.includes(args.categoria) ? args.categoria : "Outros";
  const descricao = String(args.descricao || "").trim().slice(0, 80);

  await gravarGasto(token, usuario, { data: args.data, descricao, valor, categoria }, imagem ? "foto" : "texto");
  const resumo = descricao ? categoria + ": " + descricao : categoria;
  return { resposta: "Lancei " + brl(valor) + " em " + resumo + ", " + dataBr(args.data), mudou: true };
}

async function consultar(args, { token, categorias, hoje }) {
  const desde = ehData(args.desde) ? args.desde : hoje.slice(0, 8) + "01";
  const ate = ehData(args.ate) ? args.ate : hoje;
  const categoria = categorias.includes(args.categoria) ? args.categoria : null;

  const linhas = await lerGastos(token, desde, ate, categoria);
  const total = linhas.reduce((s, l) => s + Math.round((Number(l.valor) || 0) * 100), 0) / 100;
  const periodo = "de " + dataBr(desde) + " a " + dataBr(ate);
  const onde = categoria ? " em " + categoria : "";
  if (!linhas.length) return { resposta: "Nenhum gasto" + onde + " " + periodo + ".", mudou: false };
  return { resposta: "Você gastou " + brl(total) + onde + " " + periodo + ".", mudou: false };
}

// ---------- Entrada ----------
export default async (req) => {
  if (req.method !== "POST") return responder({ resposta: "Use o app para falar com o assistente." }, 405);

  try {
    const chave = process.env.CHAVE_GEMINI;
    if (!chave) throw new ErroAmigavel("O assistente ainda não tem a chave configurada. Crie a variável CHAVE_GEMINI na Netlify.", 500);

    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) throw new ErroAmigavel("Seu login venceu. Saia do app e entre de novo.", 401);
    const usuario = await conferirLogin(token);

    let corpo;
    try { corpo = await req.json(); } catch { throw new ErroAmigavel("O pedido veio quebrado. Recarregue o app e tente de novo.", 400); }

    const mensagem = String(corpo.mensagem || "").trim().slice(0, 500);
    const imagem = typeof corpo.imagem === "string" ? corpo.imagem : "";
    const mime = String(corpo.mime || "");
    if (!mensagem && !imagem) throw new ErroAmigavel("Escreva o gasto ou mande a foto do cupom.", 400);
    if (imagem && !MIMES.includes(mime)) throw new ErroAmigavel("Use uma foto em JPEG, PNG ou WebP.", 400);
    if (imagem.length > LIMITE_IMAGEM) throw new ErroAmigavel("A foto ficou grande demais. Tente uma foto mais próxima do cupom.", 413);

    const enviadas = Array.isArray(corpo.categorias) ? corpo.categorias.map(String).filter(Boolean) : [];
    const categorias = enviadas.length ? enviadas.slice(0, 12) : CATEGORIAS_PADRAO;
    const hoje = hojeSaoPaulo();
    const ctx = { token, usuario, categorias, imagem, hoje };

    const r = await perguntarAoGemini(chave, { mensagem, imagem, mime, categorias, hoje });
    if (r.chamada) {
      if (r.chamada.nome === "registrar_gasto") return responder(await registrar(r.chamada.args, ctx));
      if (r.chamada.nome === "consultar_gastos") return responder(await consultar(r.chamada.args, ctx));
    }
    return responder({ resposta: r.texto || "Não entendi. Pode dizer o valor e onde foi o gasto?", mudou: false });
  } catch (e) {
    if (e instanceof ErroAmigavel) return responder({ resposta: e.message, erro: true }, e.status);
    return responder({ resposta: "Algo deu errado no assistente. Tente de novo em instantes.", erro: true }, 500);
  }
};
