# Carmak · Painel de Provas

Site estático (HTML + CSS + JS puro, sem build). Funciona direto no **GitHub Pages**.

## Publicar
1. Crie um repositório e envie todo o conteúdo desta pasta.
2. Em **Settings → Pages**, escolha *Deploy from a branch* → `main` → `/ (root)`.

## Estrutura de pastas
```
index.html
css/style.css
js/app.js  js/charts3d.js
assets/logo.png
data/provas.json          <- base de dados oficial (todas as provas)
pdfs/<colaborador>/<tipo-de-prova>/<aaaa-mm-dd>.pdf
```
Exemplo de PDF: `pdfs/joao-da-silva/auxiliar-mecanico-2/2026-11-17.pdf`

## Como os dados funcionam
- A fonte oficial é `data/provas.json`. Todo visitante lê esse arquivo; gráficos, tabelas e perfis são calculados a partir dele.
- Na aba **Administração** você pode:
  - **Importar provas (JSON)**: envie um ou mais arquivos de notas (como o "AM2 - Atividade Avaliativa"). O sistema mostra uma prévia (provas novas, perfis novos, duplicadas, erros) e só grava após **Confirmar importação**.
  - **Registrar prova corrigida** manualmente, com PDF opcional.
  - **Anexar PDF** a uma prova já registrada (no perfil ou na lista de colaboradores).
- Tudo fica no navegador até ser publicado:
  - **Publicar no GitHub**: grava `data/provas.json` e os PDFs em `pdfs/` direto no repositório. Requer *Configurar GitHub* uma vez (repositório `usuario/repo` + token fine-grained com **Contents: Read and write**). O token fica só no localStorage.
  - **Baixar provas.json**: baixa o arquivo atualizado para substituir em `data/` e fazer commit manualmente.
- Sem token, salve o PDF no caminho mostrado no aviso após o registro.

## Perfis
- Cada pessoa tem **um único perfil**, identificado pelo nome sem acentos, sem diferença de maiúsculas/minúsculas e com espaços colapsados ("João  da Silva" = "joao da silva").
- A aba **Perfis** lista todos; cada perfil mostra as provas nas 8 categorias, com média, aprovações e PDFs.
- Duas provas da mesma pessoa, do mesmo tipo e na mesma data são tratadas como duplicadas e ignoradas.

## Formato do JSON importado
O importador aceita vários formatos. Campos reconhecidos (não diferencia maiúsculas/acentos):
nome (`nome`, `colaborador`, `aluno`, `participante`...), nota (`nota`, `notaFinal`, `grade`...), data (`data`, `dataProva`...) e tipo (`tipo`, `prova`, `categoria`...).
Se o tipo ou a data não estiverem no arquivo, o sistema tenta achar no nome do arquivo (ex.: `AM2-...` = Auxiliar Mecânico 2) ou usa os campos "Tipo" e "Data" da tela de importação. Notas de 0 a 100 são convertidas para 0 a 10.

## Formato de `data/provas.json`
```json
[
  { "id": "p1", "nome": "Fulano de Tal", "perfil": "fulano-de-tal", "tipo": "Técnico Elétrica 1",
    "data": "2026-11-17", "nota": 8.5, "pdf": "pdfs/fulano-de-tal/tecnico-eletrica-1/2026-11-17.pdf" }
]
```
Tipos aceitos: Técnico Elétrica 1/2/3, Técnico Combustão 1/2/3, Auxiliar Mecânico 2/3.
Aprovado = nota ≥ 7,0.

## Segurança (importante)
O login é feito no navegador (a senha é verificada por hash em `js/app.js`). Em site estático isso **não é segurança real**: quem inspecionar o código consegue contornar a tela. Ele só esconde o formulário. A proteção verdadeira vem do GitHub: só quem tem permissão de escrita/token consegue alterar `provas.json`. Como o repositório do Pages costuma ser público, **não coloque dados sensíveis** nele.
