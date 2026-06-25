# Atlas Solar Justo

> Plataforma WebGIS de visualização e análise da expansão da Micro e Minigeração Distribuída
> (MMGD) solar no Brasil, sob uma perspectiva de justiça energética.

---

## Sobre o projeto

O Atlas Solar Justo cruza dados de potencial solar, vulnerabilidade social e acesso efetivo à
energia limpa para identificar onde a geração solar distribuída cresce, quem tem acesso a essa
tecnologia, quais territórios permanecem excluídos, e onde existe maior distância entre
potencial solar, vulnerabilidade social e acesso efetivo — os chamados **vazios de acesso**.

A unidade de análise principal é o município (código IBGE de 7 dígitos), com arquitetura
preparada para evoluir a granularidades sub-municipais (setor censitário, CEP ou bairro)
conforme novas fontes de dados se tornem disponíveis.

---

## Fontes de dados primárias

| Fonte | Indicador |
|---|---|
| ANEEL/MMGD | Micro e minigeração distribuída instalada |
| IBGE Censo 2022 | Dados demográficos e territoriais |
| CadÚnico | Cadastro de famílias em vulnerabilidade |
| Tarifa Social de Energia Elétrica (TSEE) | Acesso a tarifa social |
| IVS/IPEA | Índice de Vulnerabilidade Social |
| Irradiação Solar (INPE) | Potencial solar por território |

> O **OBEPE** (Observatório Brasileiro de Erradicação da Pobreza Energética — EPE/MME/BID) é
> referência metodológica para o Índice de Pobreza Energética Regional do Atlas, mas não é
> fonte de dado primário — ver `docs/DRF.md`, seção 14, para detalhamento.

---

## Perfis de usuário

| Perfil | Acesso |
|---|---|
| Usuário Público | Visualização pública, sem dados administrativos |
| Pesquisador/Analista | Visualização + cruzamento avançado de variáveis |
| Gestor Público | Visualização + priorização territorial |
| Parceiro Técnico | Revisão metodológica e validação de dados |
| Equipe do Projeto | Gestão de bases, notas metodológicas, comunicação |
| Administrador | Controle total da plataforma |

---

## Stack técnica

- **Backend:** Node.js 20+, TypeScript, Express, Drizzle ORM
- **Banco de dados:** PostgreSQL 16 + PostGIS 3.4 (SIRGAS 2000 / EPSG:4674)
- **ETL:** Python 3.12+, loguru
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, MapLibre GL JS
- **Infraestrutura:** Docker, Docker Compose, Nginx, Cloudflare

Detalhamento completo de padrões de código, banco de dados, deploy e Git em
[`CLAUDE.md`](./CLAUDE.md).

---

## Documentação

- [`CLAUDE.md`](./CLAUDE.md) — padrão técnico do projeto (stack, estrutura, convenções,
  deploy, exceções ao padrão oficial da empresa)
- [`docs/DRF.md`](./docs/DRF.md) — Documento de Requisitos Funcionais (80 requisitos
  funcionais + 6 transversais)

---

## Como rodar localmente

```bash
git clone https://github.com/clauber2024/polis.git
cd polis
make up
```

Isso inicia o ambiente de desenvolvimento completo (backend, frontend, banco de dados e ETL),
com hot reload habilitado. Ver `CLAUDE.md` para a lista completa de comandos do Makefile.

---

## Acesso de demonstração

Em ambiente de prototipagem, todos os perfis usam a senha `123456`. Ver a tela de login para a
lista completa de e-mails de demonstração por perfil.

⚠️ Credenciais de demonstração nunca devem ser usadas em ambiente de produção.

---

## Licença

A definir.

