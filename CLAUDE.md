# Meu Bolso — memória do projeto

Este arquivo é a memória do projeto, no mesmo espírito do MEMORIA.md da terça. Leia-o sempre que abrir esta pasta.

## 1. O que é este projeto

O Meu Bolso é um app de gastos pessoais feito na Formação Claude Pro. Quem usa sou eu, no celular e no computador.

Ele registra gastos e mostra o total do mês por categoria. Na sexta, ganha um assistente que lança o gasto por uma frase ou pela foto do cupom.

As telas e as categorias saem de uma entrevista que o Claude vai conduzir comigo.

## 2. Regras técnicas que não se discutem

- Os arquivos do app ficam na pasta `app/`: `index.html`, `estilo.css`, `app.js`, `configuracao.js`, `manifest.webmanifest` e `icone.svg`.
- Sem Node, sem build, sem framework.
- O cliente do Supabase entra pela CDN, com:
  `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>`
- A entrada é por e-mail e senha, sem confirmação de e-mail.
- As tabelas `gastos` e `resumos` têm proteção por linha.
- A URL do projeto e a chave pública ficam em `app/configuracao.js`, em `window.MEU_BOLSO`.
- A chave secreta do Supabase e a chave do Gemini nunca entram em arquivo nenhum.
- Na raiz, o `netlify.toml` publica a pasta `app` e o `.gitignore` deixa de fora `.env`, `.netlify` e `node_modules`.
- O celular de 390 px vem primeiro.
- Todo erro vira uma frase em português dizendo o que fazer.

## 3. O que este app nunca faz

- Nunca pede, guarda ou mostra senha de banco, número de conta ou cartão.
- Nunca guarda a foto do cupom.
- Nunca envia e-mail ou mensagem.
- Nunca usa dado de outra pessoa.

## 4. Como trabalhar comigo

- Antes de alterar arquivos, diga o plano em até dez linhas e espere a minha aprovação.
- Uma mudança por vez, mostrando a diferença.
- Toda entrega vai para um arquivo, e na conversa vêm só os caminhos.
- Fale em português, para quem não programa.
