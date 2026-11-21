<p align="center">
  <img src="https://raw.githubusercontent.com/ProjectNox-org/.github/main/assets/brand/nox-emblem.webp" alt="Emblema oficial do Project Nox" width="96" />
</p>

<h1 align="center">Project Nox · Mangá</h1>

<p align="center">
  Plataforma web de leitura e organização de mangás e quadrinhos digitais do <strong>Project Nox</strong>.
</p>

## Sobre o projeto

O **Project Nox Mangá** é a plataforma web do Project Nox dedicada à leitura e organização de mangás e outros quadrinhos digitais diretamente pelo navegador. Este repositório reúne o código-fonte da aplicação web dentro do ecossistema aberto da organização.

Por se tratar de um projeto em evolução contínua — sujeito a melhorias e reformulações técnicas em sua arquitetura, infraestrutura e endereço de acesso —, a disponibilidade do serviço público pode variar. Para consultar o estado atual e acessar os links atualizados da iniciativa, utilize sempre a [Central Oficial do Project Nox](https://projectnox-org.github.io/).

## O papel do Project Nox Importer

O ecossistema de leitura é composto por dois projetos independentes com responsabilidades bem definidas:

- **Project Nox Mangá:** a plataforma web com a qual o leitor interage para explorar obras e ler capítulos.
- [**Project Nox Importer**](https://github.com/ProjectNox-org/project-nox-importer): o serviço separado responsável por alimentar e preparar o catálogo utilizado pela plataforma.

> O Importer alimenta o catálogo; o site permite ao usuário explorar e ler as obras.

De forma contínua e desacoplada da interface, o **Project Nox Importer** tem como responsabilidades principais:

1. Consultar as fontes de conteúdo configuradas.
2. Identificar obras e capítulos disponíveis.
3. Extrair e organizar os metadados do catálogo.
4. Processar páginas e arquivos de mídia.
5. Validar e preparar os dados para utilização segura pela plataforma.
6. Disponibilizar as informações necessárias para que a aplicação web apresente as obras e seus capítulos.

Essa divisão entre serviço de ingestão e aplicação de leitura é uma base conceitual permanente do ecossistema, independentemente das tecnologias internas adotadas em cada fase do projeto.

## Como funciona o ecossistema

**Fontes configuradas → Project Nox Importer → Catálogo da plataforma → Leitor web**

O **Project Nox Importer** executa previamente a coleta, validação e organização do conteúdo em um fluxo automatizado separado. Assim, a leitura realizada pelo visitante na aplicação web consome um catálogo já estruturado e validado, sem confundir o trabalho de ingestão em segundo plano com a experiência de navegação do leitor.

## Código aberto e desenvolvimento

Este repositório contém o código-fonte da aplicação web, aberto sob licença livre para consulta, estudo, modificação e redistribuição conforme os termos aplicáveis. Para conhecer o serviço responsável pela coleta e preparo de dados, acesse diretamente o repositório do [Project Nox Importer](https://github.com/ProjectNox-org/project-nox-importer).

Como a arquitetura da plataforma está em evolução, detalhes de implantação, dependências e guias técnicos específicos podem ser atualizados conforme cada etapa de desenvolvimento. Diretrizes gerais de colaboração estão disponíveis no [Guia de Contribuição da organização](https://github.com/ProjectNox-org/.github/blob/main/CONTRIBUTING.md).

## Projetos relacionados

- [**Central Oficial do Project Nox**](https://projectnox-org.github.io/) — Portal institucional, diretório completo de projetos e status atualizado de disponibilidade.
- [**Project Nox Importer**](https://github.com/ProjectNox-org/project-nox-importer) — Serviço independente de coleta, validação e organização do catálogo.
- [**Extensões de Mangá**](https://github.com/ProjectNox-org/manga-extensoes) — Catálogo oficial de distribuição gratuita de extensões para aplicativos compatíveis.
- [**Código-fonte das Extensões de Mangá**](https://github.com/ProjectNox-org/manga-fonte-extensoes) — Repositório de desenvolvimento e compilação das extensões de mangá.

## Créditos e licenciamento

Desenvolvido e mantido por **Project Nox Contributors & Awerkori** (veja [`NOTICE`](NOTICE)).

Este software é licenciado sob a **GNU Affero General Public License v3.0 (`AGPL-3.0-only`)** — consulte [`LICENSE`](LICENSE) para o texto integral e [`NOTICE`](NOTICE) para atribuições e avisos aplicáveis:

- O uso, estudo, modificação e redistribuição do código-fonte observam os termos da GNU AGPL-3.0, incluindo a disponibilização do Código-Fonte Correspondente conforme exigido pela licença (como previsto na Seção 13 para versões modificadas operadas com interação remota por rede).
- A licença aplica-se exclusivamente ao software e **não** concede direitos sobre mangás, imagens, traduções ou quaisquer obras intelectuais de terceiros.
- Conforme a Seção 7(e) da AGPL-3.0, os nomes e marcas **"Project Nox"** e **"Awerkori"** identificam a origem do projeto e não autorizam insinuar endosso ou representação oficial sem autorização prévia por escrito.

```text
Copyright (C) 2026 Project Nox Contributors & Awerkori
Licensed under the GNU Affero General Public License, Version 3.0 (AGPL-3.0-only).
```
