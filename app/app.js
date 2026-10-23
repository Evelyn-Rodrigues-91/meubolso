(function () {
  var cfg = window.MEU_BOLSO;
  var $ = function (id) { return document.getElementById(id); };
  var banco = null;
  var usuario = null;

  var brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  function mostrar(el, texto, tipo) {
    el.textContent = texto || "";
    el.className = "msg" + (tipo ? " " + tipo : "");
  }

  function dataLocal(d) {
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var dia = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + dia;
  }

  function frase(erro) {
    var t = ((erro && erro.message) || "").toLowerCase();
    if (t.indexOf("invalid login") >= 0) return "E-mail ou senha incorretos. Confira e tente de novo.";
    if (t.indexOf("already registered") >= 0 || t.indexOf("already been registered") >= 0) return "Este e-mail já tem conta. Toque em Entrar.";
    if (t.indexOf("password") >= 0 && t.indexOf("least") >= 0) return "A senha precisa ter pelo menos 6 caracteres.";
    if (t.indexOf("valid email") >= 0 || t.indexOf("invalid email") >= 0) return "Esse e-mail não parece certo. Confira e tente de novo.";
    if (t.indexOf("rate limit") >= 0) return "Muitas tentativas. Espere um minuto e tente de novo.";
    if (t.indexOf("fetch") >= 0 || t.indexOf("network") >= 0) return "Sem conexão. Verifique a internet e tente de novo.";
    return "Algo deu errado. Tente de novo em instantes.";
  }

  // ---------- Entrada ----------
  function telaEntrada() {
    usuario = null;
    $("tela-app").hidden = true;
    $("tela-entrada").hidden = false;
  }

  function telaApp() {
    $("tela-entrada").hidden = true;
    $("tela-app").hidden = false;
    $("data").value = dataLocal(new Date());
    carregar();
  }

  function lerCampos() {
    var email = $("email").value.trim();
    var senha = $("senha").value;
    if (!email || !senha) {
      mostrar($("msg-entrada"), "Preencha o e-mail e a senha.", "erro");
      return null;
    }
    return { email: email, password: senha };
  }

  async function entrar(e) {
    e.preventDefault();
    var c = lerCampos();
    if (!c) return;
    mostrar($("msg-entrada"), "Entrando…");
    var r = await banco.auth.signInWithPassword(c);
    if (r.error) return mostrar($("msg-entrada"), frase(r.error), "erro");
    usuario = r.data.user;
    mostrar($("msg-entrada"), "");
    telaApp();
  }

  async function criarConta() {
    var c = lerCampos();
    if (!c) return;
    mostrar($("msg-entrada"), "Criando conta…");
    var r = await banco.auth.signUp(c);
    if (r.error) return mostrar($("msg-entrada"), frase(r.error), "erro");
    var sessao = r.data.session;
    if (!sessao) {
      var e2 = await banco.auth.signInWithPassword(c);
      if (e2.error) return mostrar($("msg-entrada"), frase(e2.error), "erro");
      sessao = e2.data.session;
    }
    usuario = sessao.user;
    mostrar($("msg-entrada"), "");
    telaApp();
  }

  async function sair() {
    await banco.auth.signOut();
    $("senha").value = "";
    telaEntrada();
  }

  // ---------- Dados ----------
  async function carregar() {
    var hoje = new Date();
    var inicio = dataLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
    var fim = dataLocal(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1));

    var r = await banco.from("gastos").select("id,data,descricao,valor,categoria")
      .gte("data", inicio).lt("data", fim)
      .order("data", { ascending: false }).order("criado_em", { ascending: false });
    if (r.error) {
      mostrar($("msg-lista"), "Não deu para carregar os gastos. " + frase(r.error), "erro");
    } else {
      mostrar($("msg-lista"), "");
      desenhar(r.data || [], dataLocal(hoje));
    }
    carregarResumo();
  }

  function desenhar(gastos, hoje) {
    var mes = 0, dia = 0, porCat = {};
    cfg.CATEGORIAS.forEach(function (c) { porCat[c] = 0; });
    gastos.forEach(function (g) {
      var v = Number(g.valor) || 0;
      mes += v;
      if (g.data === hoje) dia += v;
      porCat[g.categoria] = (porCat[g.categoria] || 0) + v;
    });
    $("total-mes").textContent = brl.format(mes);
    $("total-hoje").textContent = brl.format(dia);
    $("rotulo-mes").textContent = "No mês de " + new Date().toLocaleDateString("pt-BR", { month: "long" });

    var barras = $("barras");
    barras.textContent = "";
    Object.keys(porCat).forEach(function (cat) {
      var v = porCat[cat];
      var item = document.createElement("div");
      item.className = "barra-item";
      var info = document.createElement("div");
      info.className = "barra-info";
      var n = document.createElement("span"); n.textContent = cat;
      var t = document.createElement("span"); t.textContent = brl.format(v);
      info.append(n, t);
      var fundo = document.createElement("div"); fundo.className = "barra-fundo";
      var cheia = document.createElement("div"); cheia.className = "barra-cheia";
      cheia.style.width = (mes > 0 ? (v / mes) * 100 : 0) + "%";
      fundo.append(cheia);
      item.append(info, fundo);
      barras.append(item);
    });

    var lista = $("lista");
    lista.textContent = "";
    if (!gastos.length) {
      var vazio = document.createElement("li");
      vazio.className = "vazio";
      vazio.textContent = "Nenhum gasto neste mês ainda. Lance o primeiro acima.";
      lista.append(vazio);
      return;
    }
    gastos.forEach(function (g) {
      var li = document.createElement("li");
      var info = document.createElement("div");
      info.className = "gasto-info";
      var d = document.createElement("span"); d.className = "gasto-desc";
      d.textContent = g.descricao || g.categoria;
      var m = document.createElement("span"); m.className = "gasto-meta";
      var p = g.data.split("-");
      m.textContent = p[2] + "/" + p[1] + " · " + g.categoria;
      info.append(d, m);
      var val = document.createElement("span"); val.className = "gasto-valor";
      val.textContent = brl.format(Number(g.valor) || 0);
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = "Apagar";
      b.setAttribute("aria-label", "Apagar gasto " + (g.descricao || g.categoria));
      b.addEventListener("click", function () { apagar(g); });
      li.append(info, val, b);
      lista.append(li);
    });
  }

  async function apagar(g) {
    var nome = g.descricao || g.categoria;
    if (!window.confirm("Apagar o gasto \"" + nome + "\" de " + brl.format(Number(g.valor) || 0) + "?")) return;
    var r = await banco.from("gastos").delete().eq("id", g.id);
    if (r.error) return mostrar($("msg-lista"), "Não deu para apagar. " + frase(r.error), "erro");
    carregar();
  }

  async function lancar(e) {
    e.preventDefault();
    var msg = $("msg-gasto");
    var bruto = $("valor").value.trim().replace(/\./g, "").replace(",", ".");
    var valor = Number(bruto);
    if (!bruto || !isFinite(valor) || valor <= 0) {
      return mostrar(msg, "Digite um valor maior que zero, por exemplo 25,90.", "erro");
    }
    var data = $("data").value;
    if (!data) return mostrar(msg, "Escolha a data do gasto.", "erro");

    mostrar(msg, "Salvando…");
    var r = await banco.from("gastos").insert({
      dono: usuario.id,
      data: data,
      descricao: $("descricao").value.trim(),
      valor: Math.round(valor * 100) / 100,
      categoria: $("categoria").value,
      origem: "manual"
    });
    if (r.error) return mostrar(msg, "Não deu para salvar. " + frase(r.error), "erro");
    $("valor").value = "";
    $("descricao").value = "";
    mostrar(msg, "Gasto salvo.", "ok");
    carregar();
  }

  async function carregarResumo() {
    var r = await banco.from("resumos").select("texto").order("criado_em", { ascending: false }).limit(1);
    var linha = !r.error && r.data && r.data[0];
    $("cartao-resumo").hidden = !linha;
    if (linha) $("texto-resumo").textContent = linha.texto;
  }

  function assistente() {
    mostrar($("msg-assistente"), "O assistente chega na sexta.");
  }

  // ---------- Início ----------
  async function iniciar() {
    var sel = $("categoria");
    cfg.CATEGORIAS.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c; o.textContent = c;
      sel.append(o);
    });

    $("form-entrada").addEventListener("submit", entrar);
    $("btn-criar").addEventListener("click", criarConta);
    $("btn-sair").addEventListener("click", sair);
    $("form-gasto").addEventListener("submit", lancar);
    $("btn-enviar").addEventListener("click", assistente);
    $("btn-foto").addEventListener("click", assistente);

    if (!window.supabase) {
      $("tela-entrada").hidden = false;
      return mostrar($("msg-entrada"), "Não deu para carregar o app. Verifique a internet e recarregue a página.", "erro");
    }
    banco = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_CHAVE_PUBLICA);
    var s = await banco.auth.getSession();
    if (s.data && s.data.session) {
      usuario = s.data.session.user;
      telaApp();
    } else {
      telaEntrada();
    }
  }

  iniciar();
})();
