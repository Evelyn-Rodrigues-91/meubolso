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
    if (t.indexOf("jwt") >= 0 || t.indexOf("refresh token") >= 0 || t.indexOf("not authenticated") >= 0) return "Seu login venceu. Toque em Sair e entre de novo.";
    if (t.indexOf("rate limit") >= 0) return "Muitas tentativas. Espere um minuto e tente de novo.";
    if (t.indexOf("fetch") >= 0 || t.indexOf("network") >= 0) return "Sem conexão. Verifique a internet e tente de novo.";
    return "Algo deu errado. Tente de novo em instantes.";
  }

  // Se uma ação falhar sem aviso, a pessoa vê uma frase em vez de a tela ficar parada.
  function protegido(fn, idMsg) {
    return async function () {
      try {
        return await fn.apply(this, arguments);
      } catch (e) {
        mostrar($(idMsg), "Sem conexão ou falha inesperada. Verifique a internet e tente de novo.", "erro");
      }
    };
  }

  // ---------- Entrada ----------
  function telaEntrada() {
    usuario = null;
    $("carregando").hidden = true;
    $("tela-app").hidden = true;
    $("tela-entrada").hidden = false;
  }

  function telaApp() {
    $("carregando").hidden = true;
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
  async function carregarGastos() {
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
  var carregar = protegido(carregarGastos, "msg-lista");

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
    $("media-dia").textContent = "Média de " + brl.format(mes / new Date().getDate()) + " por dia";
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
      b.addEventListener("click", function () { protegido(apagar, "msg-lista")(g); });
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
    var marcada = document.querySelector("input[name=categoria]:checked");
    if (!marcada) return mostrar(msg, "Escolha a categoria do gasto.", "erro");
    // Aceita 25,90, 25.90 e 1.234,56 (ponto sozinho com 1 ou 2 casas é decimal).
    var texto = $("valor").value.trim();
    var bruto = /^\d+\.\d{1,2}$/.test(texto) ? texto : texto.replace(/\./g, "").replace(",", ".");
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
      categoria: marcada.value,
      origem: "manual"
    });
    if (r.error) return mostrar(msg, "Não deu para salvar. " + frase(r.error), "erro");
    marcada.checked = false;
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

  // Reduz a foto para no máximo 1600 px, em JPEG. A foto nunca é guardada.
  function reduzirFoto(arquivo) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(arquivo);
      var img = new Image();
      img.onload = function () {
        try {
          var escala = Math.min(1, 1600 / Math.max(img.width, img.height));
          var c = document.createElement("canvas");
          c.width = Math.round(img.width * escala);
          c.height = Math.round(img.height * escala);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
        } catch (e) {
          reject(new Error("foto"));
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("foto"));
      };
      img.src = url;
    });
  }

  async function falarComAssistente(mensagem, imagem) {
    var msg = $("msg-assistente");
    $("btn-enviar").disabled = true;
    $("btn-foto").disabled = true;
    mostrar(msg, "Pensando…");
    try {
      var s = await banco.auth.getSession();
      if (!s.data || !s.data.session) {
        return mostrar(msg, "Seu login venceu. Saia do app e entre de novo.", "erro");
      }
      var r = await fetch("/api/assistente", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + s.data.session.access_token
        },
        body: JSON.stringify({
          mensagem: mensagem,
          imagem: imagem || "",
          mime: imagem ? "image/jpeg" : "",
          categorias: cfg.CATEGORIAS
        })
      });
      var j = null;
      try { j = await r.json(); } catch (e) { /* sem corpo */ }
      if (!r.ok) {
        return mostrar(msg, (j && j.resposta) || "O assistente não respondeu. Tente de novo em instantes.", "erro");
      }
      mostrar(msg, j.resposta, j.mudou ? "ok" : "");
      if (j.mudou) {
        $("assistente-texto").value = "";
        carregar();
      }
    } catch (e) {
      mostrar(msg, "Sem conexão. Verifique a internet e tente de novo.", "erro");
    } finally {
      $("btn-enviar").disabled = false;
      $("btn-foto").disabled = false;
    }
  }

  function enviarTexto() {
    var texto = $("assistente-texto").value.trim();
    if (!texto) return mostrar($("msg-assistente"), "Escreva o gasto ou faça uma pergunta.", "erro");
    falarComAssistente(texto, "");
  }

  async function enviarFoto(e) {
    var arquivo = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!arquivo) return;
    var msg = $("msg-assistente");
    mostrar(msg, "Preparando a foto…");
    var imagem;
    try {
      imagem = await reduzirFoto(arquivo);
    } catch (err) {
      return mostrar(msg, "Não deu para abrir a foto. Tente com outra imagem.", "erro");
    }
    falarComAssistente($("assistente-texto").value.trim(), imagem);
  }

  // ---------- Início ----------
  async function iniciar() {
    try {
      var grupo = $("categoria");
      cfg.CATEGORIAS.forEach(function (c, i) {
        var r = document.createElement("input");
        r.type = "radio"; r.name = "categoria"; r.value = c;
        r.id = "cat-" + i; r.className = "chip-input";
        var l = document.createElement("label");
        l.htmlFor = r.id; l.className = "chip"; l.textContent = c;
        grupo.append(r, l);
      });

      $("form-entrada").addEventListener("submit", protegido(entrar, "msg-entrada"));
      $("btn-criar").addEventListener("click", protegido(criarConta, "msg-entrada"));
      $("btn-sair").addEventListener("click", protegido(sair, "msg-lista"));
      $("form-gasto").addEventListener("submit", protegido(lancar, "msg-gasto"));
      var arquivoFoto = document.createElement("input");
      arquivoFoto.type = "file";
      arquivoFoto.accept = "image/*";
      arquivoFoto.addEventListener("change", protegido(enviarFoto, "msg-assistente"));
      $("btn-enviar").addEventListener("click", enviarTexto);
      $("btn-foto").addEventListener("click", function () { arquivoFoto.click(); });

      if (!window.supabase) {
        telaEntrada();
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
    } catch (e) {
      telaEntrada();
      mostrar($("msg-entrada"), "Não deu para iniciar o app. Verifique a internet e recarregue a página.", "erro");
    }
  }

  iniciar();
})();
