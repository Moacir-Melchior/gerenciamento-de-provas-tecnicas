# Carmak · Painel de Provas

Site estático (HTML + CSS + JS puro, sem build). Funciona direto no **GitHub Pages**.

## Publicar
1. Crie um repositório e envie todo o conteúdo desta pasta.
2. Em **Settings → Pages**, escolha *Deploy from a branch* → `main` → `/ (root)`.

## Como os dados funcionam
- A fonte oficial é `data/provas.json` (lista de provas). Todo visitante lê esse arquivo.
- Na aba **Administração**, cada prova registrada fica no navegador de quem registrou até ser publicada:
  - **Publicar no GitHub**: grava `data/provas.json` (e o PDF em `pdfs/`) direto no repositório. Requer *Configurar GitHub* uma vez (repositório `usuario/repo` + token fine-grained com permissão **Contents: Read and write** só nesse repositório). O token fica só no localStorage do navegador.
  - **Baixar provas.json**: baixa o arquivo atualizado para você substituir em `data/` e fazer commit manualmente.
- PDFs: sem token configurado, salve o arquivo em `pdfs/` com o nome mostrado no aviso após o registro.

## Formato de `data/provas.json`
```json
[
  { "id": "p1", "nome": "Fulano de Tal", "tipo": "Técnico Elétrica 1",
    "data": "2026-11-17", "nota": 8.5, "pdf": "pdfs/p1-prova.pdf" }
]
```
Tipos aceitos: Técnico Elétrica 1/2/3, Técnico Combustão 1/2/3, Auxiliar Mecânico 2/3.
Aprovado = nota ≥ 7,0.

## Segurança (importante)
O login é feito no navegador (a senha é verificada por hash em `js/app.js`). Em site estático isso **não é segurança real**: quem inspecionar o código consegue contornar a tela. Ele só esconde o formulário. A proteção verdadeira vem do GitHub: só quem tem permissão de escrita/token consegue alterar `provas.json`. Como o repositório do Pages costuma ser público, **não coloque dados sensíveis** nele.
