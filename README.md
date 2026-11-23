# Gestão de Provas Técnicas – CARMAK

Site 100% estático (HTML + CSS + JS puro), pronto para o **GitHub Pages**.

## Publicar
1. Envie todo o conteúdo desta pasta para um repositório no GitHub (raiz do repositório).
2. Em **Settings → Pages**, escolha *Deploy from a branch* → `main` → `/ (root)`.
3. Acesse `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

## Como os dados funcionam
GitHub Pages não tem servidor/banco de dados, então:
- Na página **Administração** (login: Moacir Melchior), solte o HTML de notas. Os dados ficam salvos no navegador.
- Para todos verem os dados: clique em **Exportar provas.json** e substitua `data/provas.json` no repositório (commit). Visitantes passam a ver esses dados.
- Provas repetidas (mesmo colaborador, tipo e horário de início) são ignoradas.

## Atenção
- O login é feito no navegador (a senha fica apenas como hash SHA-256 no código). Serve para evitar acesso casual, **não é segurança real**: quem tiver o link e conhecimento técnico pode ler `data/provas.json`. Não publique dados sensíveis em repositório público.
- A fonte Roboto vem do Google Fonts (precisa de internet).
